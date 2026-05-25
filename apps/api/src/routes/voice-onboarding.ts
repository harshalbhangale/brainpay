import { Hono } from 'hono'
import { logger } from '../logger'

/**
 * Voice onboarding HTTP endpoints.
 * Simpler than WebSocket relay — works around React Native WS binary
 * audio limitations.
 *
 * Flow:
 *   POST /voice/onboard/speak  { line }   -> audio MP3 bytes (streamed)
 *
 * The client drives the conversation step-by-step:
 *   1. Calls /speak with the intro line → plays audio
 *   2. User types name → client calls /speak with the avatar prompt
 *   3. User picks avatar → client calls /speak with style prompt
 *   4. User picks style → client calls /speak with confirmation
 *   5. Client PATCHes /me with the persona
 *
 * The lines are pre-defined and templated with the user's name.
 * No LLM round-trip per turn — instant TTS, smooth UX.
 */

const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID
const ELEVEN_MODEL = 'eleven_flash_v2_5'

export const voiceOnboarding = new Hono()

voiceOnboarding.get('/voice/onboard/speak', async (c) => {
  if (!ELEVEN_API_KEY || !ELEVEN_VOICE_ID) {
    return c.json({ error: 'tts_not_configured' }, 503)
  }

  const text = c.req.query('text')?.trim()
  if (!text || text.length > 500) {
    return c.json({ error: 'invalid_input' }, 400)
  }

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.85,
          style: 0.6,
          use_speaker_boost: true,
        },
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      logger.error({ status: res.status, body: errBody.slice(0, 300) }, 'voice_onboard.tts_failed')
      return c.json({ error: 'tts_failed' }, 503)
    }

    const audioBuffer = await res.arrayBuffer()
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    logger.error({ err: String(err) }, 'voice_onboard.exception')
    return c.json({ error: 'tts_failed' }, 503)
  }
})
