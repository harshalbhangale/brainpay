import type { WebSocket } from 'ws'
import { containsBannedPhrase, streamReaction, type PalContext } from '../services/xai'
import { streamTTS } from '../services/elevenlabs'
import { encodeAudioChunk } from './framing'
import { logger } from '../logger'

/**
 * Run the full voice reaction:
 *   Grok stream  →  guardrail check  →  ElevenLabs stream  →  client audio chunks
 *
 * Returns the final transcribed line (for logging / speech.started overlay).
 */
export async function speakReaction(
  ws: WebSocket,
  detectionId: string,
  ctx: PalContext,
  abort: AbortController,
): Promise<string> {
  let line = ''
  let banned = false

  // Wrap Grok stream so we can sniff for banned phrases mid-stream.
  async function* guardedTokens(): AsyncGenerator<string> {
    for await (const token of streamReaction(ctx)) {
      if (abort.signal.aborted) return
      line += token
      if (containsBannedPhrase(line)) {
        banned = true
        abort.abort()
        return
      }
      yield token
    }
  }

  ws.send(JSON.stringify({ type: 'speech.started', detectionId }))

  let seq = 0
  try {
    for await (const mp3 of streamTTS(guardedTokens(), { signal: abort.signal })) {
      if (abort.signal.aborted) break
      if (ws.readyState !== ws.OPEN) break
      ws.send(encodeAudioChunk(seq++, mp3))
    }
  } catch (err) {
    logger.error({ err: String(err), detectionId }, 'voice.stream_failed')
  }

  if (banned) {
    logger.warn({ detectionId, line }, 'voice.banned_phrase_blocked')
    // Replace with a templated fallback so the demo isn't silent.
    line =
      ctx.healthScore >= 0
        ? `Genuinely a good shout. +${ctx.healthScore}.`
        : `Bold choice. ${ctx.healthScore}.`
  }

  ws.send(JSON.stringify({ type: 'speech.ended', detectionId, text: line.trim() }))
  return line.trim()
}
