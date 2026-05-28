import { Hono } from 'hono'
import OpenAI from 'openai'
import { logger } from '../logger'

/**
 * Voice onboarding HTTP endpoints — now using OpenAI TTS.
 *
 * GET /voice/onboard/speak?text=...  → audio MP3 bytes
 *
 * Switched from ElevenLabs to OpenAI tts-1 (nova voice):
 *   - Same OpenAI API key already in env
 *   - ~300ms latency, good quality
 *   - No separate billing account needed
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const voiceOnboarding = new Hono()

voiceOnboarding.get('/voice/onboard/speak', async (c) => {
  const text = c.req.query('text')?.trim()
  if (!text || text.length > 500) {
    return c.json({ error: 'invalid_input' }, 400)
  }

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      response_format: 'mp3',
    })

    const audioBuffer = await response.arrayBuffer()
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    logger.error({ err: String(err) }, 'voice_onboard.tts_failed')
    return c.json({ error: 'tts_failed' }, 503)
  }
})
