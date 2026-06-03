import { Hono } from 'hono'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Twilio Voice inbound — voice-task feature.
 *
 *   POST /twilio/voice/incoming
 *     Twilio hits this when a call reaches TWILIO_VOICE_NUMBER.
 *     We return TwiML that opens a bidirectional Media Stream to our
 *     /twilio-media WebSocket, which bridges audio into the OpenAI
 *     Realtime session (see ws/twilio-media.ts).
 *
 * No auth — Twilio calls this. We pass the caller's number as a stream
 * parameter so the media handler can identify the parent.
 */

const env = loadEnv()

export const twilioVoice = new Hono()

twilioVoice.post('/twilio/voice/incoming', async (c) => {
  // Twilio posts form-encoded params (From, To, CallSid, ...).
  const form = await c.req.parseBody().catch(() => ({} as Record<string, string>))
  const from = (form.From as string) ?? ''
  const callSid = (form.CallSid as string) ?? ''

  logger.info({ from, callSid }, 'twilio_voice.incoming')

  // Derive the wss media URL from PUBLIC_BASE_URL.
  const base = env.PUBLIC_BASE_URL ?? ''
  const wsUrl = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/twilio-media'

  // TwiML: greet, then open the media stream. The <Stream> keeps the call
  // connected while audio flows over the WebSocket.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="from" value="${escapeXml(from)}" />
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
    </Stream>
  </Connect>
</Response>`

  return c.body(twiml, 200, { 'Content-Type': 'text/xml' })
})

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
