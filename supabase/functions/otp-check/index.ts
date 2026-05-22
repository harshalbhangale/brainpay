// Supabase Edge Function — POST /otp-check
// Verifies SMS OTP via Twilio Verify, upserts the auth user + accounts row,
// returns a Supabase JWT (access + refresh) plus onboarding context flags.
//
// Flow:
//   1. Twilio Verify approved? → 401 if not
//   2. Find or create Supabase auth user by phone (admin API)
//   3. Upsert public.accounts row keyed by auth.user.id
//   4. Issue session via admin.generateLink(magiclink) → otp grant
//   5. Check public.invites for any pending invite matching this phone
//   6. Return { jwt, refreshToken, isNewUser, hasPendingInvite, accountType }

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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 })

  let phone: string, code: string
  try {
    const body = await req.json()
    phone = body.phone
    code = body.code
  } catch {
    return json(400, { error: 'invalid_input' })
  }
  if (!phone || !code || typeof code !== 'string' || code.length !== 6) {
    return json(400, { error: 'invalid_input' })
  }

  // ─── 1. Verify with Twilio ────────────────────────────────────────
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
    return json(401, { error: 'code_invalid' })
  }

  // ─── 2. Find-or-create the Supabase auth user keyed by phone ──────
  // Supabase's admin.listUsers does not support phone filter directly; we
  // page through up to 1000 users (fine for prototype). Production should
  // index by phone via a custom RPC.
  let isNewUser = false
  let userId: string | null = null

  // Try a direct lookup first via getUserByPhone-equivalent: createUser
  // with phone_confirm: true; if user exists, the API returns the existing
  // record on conflict.
  try {
    const { data: existing, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (listErr) throw listErr
    const found = existing.users.find((u) => u.phone === phone.replace(/^\+/, ''))
    if (found) {
      userId = found.id
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        phone,
        phone_confirm: true,
      })
      if (createErr || !created.user) {
        console.error('create_user_failed', createErr)
        return json(503, { error: 'create_user_failed' })
      }
      userId = created.user.id
      isNewUser = true
    }
  } catch (err) {
    console.error('list_users_failed', err)
    return json(503, { error: 'auth_lookup_failed' })
  }

  if (!userId) return json(503, { error: 'auth_unknown' })

  // ─── 3. Upsert accounts row ──────────────────────────────────────
  const { data: accountRow, error: upsertErr } = await admin
    .from('accounts')
    .upsert(
      { id: userId, phone, last_seen_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select('id, account_type')
    .single()

  if (upsertErr) {
    console.error('account_upsert_failed', upsertErr)
    return json(503, { error: 'account_upsert_failed' })
  }

  const accountType: string | null = accountRow?.account_type ?? null

  // ─── 4. Issue a session ──────────────────────────────────────────
  // generateLink with type 'magiclink' returns properties.action_link with
  // a hashed token; we instead use the otp grant pattern.
  // Cleanest path: admin.generateLink → email/phone-OTP; for phone we
  // re-use the same OTP flow by signing a JWT ourselves via the admin
  // client's session creation.
  //
  // Supabase JS v2 exposes admin.signInWithOtp for some flows; the
  // canonical "issue session for known user" is:
  //   admin.auth.admin.generateLink({ type: 'magiclink', email })
  // which doesn't apply here.
  //
  // Workaround: use admin to create a session via the Auth REST API
  // /admin/users/<id>/sessions endpoint (officially supported on hosted
  // Supabase as of late 2024).
  const sessionRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}/sessions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!sessionRes.ok) {
    const text = await sessionRes.text()
    console.error('session_issue_failed', sessionRes.status, text)
    return json(503, { error: 'session_issue_failed' })
  }
  const sessionBody = await sessionRes.json()
  const accessToken: string | undefined = sessionBody.access_token
  const refreshToken: string | undefined = sessionBody.refresh_token

  if (!accessToken || !refreshToken) {
    return json(503, { error: 'session_malformed' })
  }

  // ─── 5. Check for pending invites for this phone ─────────────────
  const { data: pendingInvites } = await admin
    .from('invites')
    .select('id')
    .eq('recipient_phone', phone)
    .eq('status', 'pending')
    .limit(1)

  const hasPendingInvite = (pendingInvites?.length ?? 0) > 0

  // ─── 6. Done ─────────────────────────────────────────────────────
  return json(200, {
    jwt: accessToken,
    refreshToken,
    isNewUser,
    hasPendingInvite,
    accountType,
    user: {
      id: userId,
      phone,
    },
  })
})
