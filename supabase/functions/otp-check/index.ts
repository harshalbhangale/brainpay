// Supabase Edge Function — POST /otp-check
// Detailed Spec § 2.4. Verifies SMS OTP and returns a Supabase JWT.
// Implemented day 2.

// deno-lint-ignore-file no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 })

  const { phone, code } = await req.json().catch(() => ({}))
  if (!phone || !code || typeof code !== 'string' || code.length !== 6) {
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 })
  }

  // 1. Verify with Twilio
  const verifyUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, Code: code }),
  })

  const verifyBody = await verifyRes.json()
  if (!verifyRes.ok || verifyBody.status !== 'approved') {
    return new Response(JSON.stringify({ error: 'code_invalid' }), { status: 401 })
  }

  // 2. Upsert auth user keyed by phone, then upsert profile rows.
  // TODO(day-2): finish — admin.auth.admin.createUser / generateLink → JWT issuance.
  return new Response(
    JSON.stringify({ error: 'not_implemented', day: 2 }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  )
})
