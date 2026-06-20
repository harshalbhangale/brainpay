import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * ElevenLabs streaming TTS for the Mika companion voice.
 *
 * We use the Flash model (~75 ms latency) and stream MP3 back. The browser
 * decodes each sentence's MP3 with the Web Audio API, so we don't need the
 * Pro-tier PCM output format.
 */

const env = loadEnv()

const VOICE_SETTINGS = {
  stability: 0.4,
  similarity_boost: 0.85,
  style: 0.45,
  use_speaker_boost: true,
}

/**
 * Synthesise `text` to MP3 and stream it to `onChunk`. Aborts cleanly via
 * `signal` (barge-in). Resolves when the full clip has been streamed.
 */
export async function streamTts(
  text: string,
  onChunk: (mp3: Buffer) => void,
  signal: AbortSignal,
): Promise<void> {
  const voiceId = env.ELEVENLABS_COMPANION_VOICE_ID || env.ELEVENLABS_VOICE_ID
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream` +
    `?output_format=mp3_44100_128&optimize_streaming_latency=2`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: env.ELEVENLABS_TTS_MODEL,
      voice_settings: VOICE_SETTINGS,
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    logger.warn({ status: res.status, detail: detail.slice(0, 200) }, 'tts.failed')
    return
  }

  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value && value.length) onChunk(Buffer.from(value))
  }
}
