import WebSocket from 'ws'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * ElevenLabs Flash v2.5 streaming TTS WebSocket.
 * Detailed Spec § 4.3.
 *
 * Wire protocol:
 *   wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?...
 *   First message: { text: " ", voice_settings: {...}, xi_api_key: "..." }
 *   Subsequent:    { text: "<token>", try_trigger_generation: true }
 *   Flush:         { text: "" }
 *   Receive:       { audio: "<base64 mp3>" } or { isFinal: true }
 */

const env = loadEnv()
export const ELEVEN_MODEL = 'eleven_flash_v2_5'
export const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128'

type Opts = {
  /** AbortSignal to cut off in-flight TTS (e.g. on user tap-to-interrupt). */
  signal?: AbortSignal
}

/**
 * Stream text tokens through ElevenLabs and yield MP3 chunks as they arrive.
 * Closes the upstream WS once the input generator finishes or the signal aborts.
 */
export async function* streamTTS(
  textStream: AsyncIterable<string>,
  opts: Opts = {},
): AsyncGenerator<Uint8Array> {
  const url =
    `wss://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}` +
    `/stream-input?model_id=${ELEVEN_MODEL}&output_format=${ELEVEN_OUTPUT_FORMAT}`

  const ws = new WebSocket(url)

  const audioQueue: Uint8Array[] = []
  let resolveNext: ((v: Uint8Array | null) => void) | null = null
  let done = false
  let errored: unknown = null

  const push = (chunk: Uint8Array | null) => {
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r(chunk)
    } else if (chunk) {
      audioQueue.push(chunk)
    } else {
      done = true
    }
  }

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        text: ' ',
        voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.6 },
        xi_api_key: env.ELEVENLABS_API_KEY,
      }),
    )
    // Pump text tokens in.
    ;(async () => {
      try {
        for await (const token of textStream) {
          if (opts.signal?.aborted) break
          if (ws.readyState !== WebSocket.OPEN) break
          ws.send(JSON.stringify({ text: token, try_trigger_generation: true }))
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ text: '' }))
      } catch (err) {
        errored = err
        ws.close()
      }
    })()
  })

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.audio) {
        push(Buffer.from(msg.audio, 'base64'))
      }
      if (msg.isFinal) {
        push(null)
        ws.close()
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'elevenlabs.parse_failed')
    }
  })

  ws.on('error', (err) => {
    errored = err
    push(null)
  })

  ws.on('close', () => {
    push(null)
  })

  opts.signal?.addEventListener('abort', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close()
  })

  while (!done) {
    if (audioQueue.length > 0) {
      yield audioQueue.shift()!
      continue
    }
    const next = await new Promise<Uint8Array | null>((r) => {
      resolveNext = r
    })
    if (next === null) break
    yield next
  }

  if (errored) logger.error({ err: String(errored) }, 'elevenlabs.stream_failed')
}
