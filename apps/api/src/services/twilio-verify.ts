import { logger } from '../logger'

/**
 * Twilio Verify — server-side SMS OTP.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_VERIFY_SERVICE_SID   (VA...)
 *
 * Dev bypass: when DEV_BYPASS_OTP=true and code === DEV_BYPASS_CODE
 * (default '123456'), check returns approved without round-tripping
 * Twilio. Phone-side `start` still calls Twilio so we exercise the full
 * SMS path; flip DEV_BYPASS_OTP_START=true to short-circuit that too.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID

const DEV_BYPASS_OTP = process.env.DEV_BYPASS_OTP === 'true'
const DEV_BYPASS_OTP_START = process.env.DEV_BYPASS_OTP_START === 'true'
const DEV_BYPASS_CODE = process.env.DEV_BYPASS_CODE ?? '123456'

const basicAuth = () =>
  'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')

function assertConfigured() {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !VERIFY_SERVICE_SID) {
    throw new Error('twilio_verify_not_configured')
  }
}

export type VerifyStartResult =
  | { ok: true; bypass?: boolean }
  | { ok: false; error: string; status?: number; twilioCode?: number }

export async function verifyStart(phone: string): Promise<VerifyStartResult> {
  if (DEV_BYPASS_OTP_START) {
    logger.info({ phone, bypassCode: DEV_BYPASS_CODE }, 'twilio.verify.start_bypassed — use code: ' + DEV_BYPASS_CODE)
    return { ok: true, bypass: true }
  }

  try {
    assertConfigured()
  } catch {
    return { ok: false, error: 'twilio_verify_not_configured' }
  }

  const url = `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}/Verifications`
  const body = new URLSearchParams({ To: phone, Channel: 'sms' })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    logger.error({ status: res.status, body: text.slice(0, 500) }, 'twilio.verify.start_failed')
    let twilioCode: number | undefined
    try { twilioCode = JSON.parse(text).code } catch { /* ignore */ }
    return { ok: false, error: 'twilio_error', status: res.status, twilioCode }
  }

  return { ok: true }
}

export type VerifyCheckResult =
  | { ok: true; bypass?: boolean }
  | { ok: false; error: string; status?: number; twilioStatus?: string }

export async function verifyCheck(phone: string, code: string): Promise<VerifyCheckResult> {
  if (DEV_BYPASS_OTP && code === DEV_BYPASS_CODE) {
    logger.info({ phone }, 'twilio.verify.check_bypassed')
    return { ok: true, bypass: true }
  }

  try {
    assertConfigured()
  } catch {
    return { ok: false, error: 'twilio_verify_not_configured' }
  }

  const url = `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE_SID}/VerificationCheck`
  const body = new URLSearchParams({ To: phone, Code: code })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  let payload: { status?: string; valid?: boolean } = {}
  try {
    payload = await res.json() as { status?: string; valid?: boolean }
  } catch { /* leave empty */ }

  if (!res.ok || payload.status !== 'approved') {
    return {
      ok: false,
      error: 'code_invalid',
      status: res.status,
      twilioStatus: payload.status,
    }
  }

  return { ok: true }
}
