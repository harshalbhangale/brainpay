// Supabase Edge Function — POST /otp-start
// Detailed Spec § 2.4. Sends SMS OTP via Twilio Verify.
// Implemented day 2.

// deno-lint-ignore-file no-explicit-any
declare const Deno: any

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 })

  const { phone } = await req.json().catch(() => ({}))
  if (!phone || typeof phone !== 'string') {
    return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400 })
  }

  const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`
  const body = new URLSearchParams({ To: phone, Channel: 'sms' })
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('twilio_error', res.status, text)
    return new Response(JSON.stringify({ error: 'twilio_error' }), { status: 503 })
  }

  return new Response(
    JSON.stringify({ ok: true, expiresInSec: 600 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
