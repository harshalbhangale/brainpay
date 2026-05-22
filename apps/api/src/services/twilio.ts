import { logger } from '../logger'

/**
 * Twilio Messaging API — for sending invite SMS.
 *
 * Uses the same Twilio account as Verify but a different endpoint.
 * Configuration:
 *   TWILIO_ACCOUNT_SID         (already set in Secrets Manager)
 *   TWILIO_AUTH_TOKEN          (already set)
 *   TWILIO_MESSAGING_FROM      (sender — either +1234567890 or a Messaging Service SID)
 *
 * For AU we want a Messaging Service SID since unverified numbers can't
 * SMS Australian phones. Set this to your TWILIO_MESSAGING_SERVICE_SID
 * once you have one.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_MESSAGING_FROM = process.env.TWILIO_MESSAGING_FROM
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID

export type SendInviteSmsInput = {
  to: string                    // E.164
  inviterName: string
  familyName: string
  link: string                  // brainpay://inv/<code> or https://brainpay.app/inv/<code>
}

export async function sendInviteSms(input: SendInviteSmsInput): Promise<{ ok: boolean; messageSid?: string; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    logger.warn('twilio.not_configured — skipping SMS, returning ok in dev')
    return { ok: true, messageSid: 'dev-stub' }
  }
  if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_MESSAGING_FROM) {
    return { ok: false, error: 'twilio_messaging_not_configured' }
  }

  const body =
    `${input.inviterName} invited you to ${input.familyName} on BrainPay. ` +
    `Open: ${input.link}`

  const params = new URLSearchParams({ To: input.to, Body: body })
  if (TWILIO_MESSAGING_SERVICE_SID) {
    params.set('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID)
  } else if (TWILIO_MESSAGING_FROM) {
    params.set('From', TWILIO_MESSAGING_FROM)
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  )

  if (!res.ok) {
    const text = await res.text()
    logger.error({ status: res.status, body: text.slice(0, 300) }, 'twilio.send_failed')
    return { ok: false, error: `twilio_${res.status}` }
  }

  const data = (await res.json()) as { sid?: string }
  return { ok: true, messageSid: data.sid }
}
