import { Hono } from 'hono'
import { streamTts } from '../services/elevenlabs-tts'
import { resolveVoiceId } from '../services/voices'
import { logger } from '../logger'

/**
 * Voice preview — GET /voice/sample?voice=<key>&name=<companion>
 *
 * Returns a short MP3 of the chosen companion introducing itself in the chosen
 * ElevenLabs voice, so the onboarding picker can let users hear each voice.
 * Public + cacheable (no per-user data); plays via a plain <audio> src.
 */
export const voiceSample = new Hono()

voiceSample.get('/voice/sample', async (c) => {
  const voice = (c.req.query('voice') ?? 'normal').slice(0, 16)
  // Keep only letters/spaces/'- from the name; cap length.
  const name = (c.req.query('name') ?? '').replace(/[^\p{L}\s'-]/gu, '').trim().slice(0, 24)
  const sentence = name
    ? `Hi, I'm ${name}! I'm your BrainPal — so happy to meet you.`
    : `Hi! I'm your BrainPal — so happy to meet you.`

  const voiceId = resolveVoiceId(voice)
  const parts: Buffer[] = []
  const ac = new AbortController()
  try {
    await streamTts(sentence, (chunk) => parts.push(chunk), ac.signal, voiceId)
  } catch (err) {
    logger.warn({ err: String(err), voice }, 'voice_sample.failed')
  }

  const mp3 = Buffer.concat(parts)
  if (!mp3.length) return c.json({ error: 'tts_failed' }, 503)

  return new Response(mp3, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(mp3.length),
      // Same voice+name always yields the same line — cache hard.
      'Cache-Control': 'public, max-age=86400',
    },
  })
})
