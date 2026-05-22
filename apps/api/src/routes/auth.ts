import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { accounts } from '../db/schema'
import { logger } from '../logger'
import { mintToken } from '../services/jwt'
import { verifyCheck, verifyStart } from '../services/twilio-verify'

/**
 * POST /auth/otp/start    { phone }                 -> { ok: true }
 * POST /auth/otp/check    { phone, code }           -> { token, account, isNewUser }
 * POST /auth/logout                                 -> 204 (client clears storage)
 *
 * The API owns the OTP flow end-to-end: Twilio Verify on the way in,
 * BrainPal-signed HS256 JWT on the way out. We don't depend on Supabase
 * Auth for any of this.
 */
export const auth = new Hono()

const E164 = /^\+\d{6,15}$/

auth.post('/auth/otp/start', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { phone?: string }
  const phone = body.phone?.trim()
  if (!phone || !E164.test(phone)) {
    return c.json({ error: 'invalid_phone' }, 400)
  }

  const result = await verifyStart(phone)
  if (!result.ok) {
    return c.json(
      { error: result.error, status: result.status, twilioCode: result.twilioCode },
      503,
    )
  }
  return c.json({ ok: true, ...(result.bypass ? { bypass: true } : {}) })
})

auth.post('/auth/otp/check', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    phone?: string
    code?: string
  }
  const phone = body.phone?.trim()
  const code = body.code?.trim()

  if (!phone || !E164.test(phone) || !code || code.length < 4 || code.length > 8) {
    return c.json({ error: 'invalid_input' }, 400)
  }

  const check = await verifyCheck(phone, code)
  if (!check.ok) {
    return c.json(
      { error: check.error, status: check.status, twilioStatus: check.twilioStatus },
      401,
    )
  }

  // Find-or-create accounts row keyed by phone.
  let account = await db.query.accounts.findFirst({
    where: eq(accounts.phone, phone),
  })

  let isNewUser = false
  if (!account) {
    isNewUser = true
    const id = randomUUID()
    const [created] = await db
      .insert(accounts)
      .values({ id, phone, lastSeenAt: new Date() })
      .returning()
    account = created
  } else {
    // Touch last_seen_at on returning users.
    await db
      .update(accounts)
      .set({ lastSeenAt: new Date() })
      .where(eq(accounts.id, account.id))
  }

  if (!account) {
    logger.error({ phone }, 'auth.account_upsert_returned_nothing')
    return c.json({ error: 'account_upsert_failed' }, 500)
  }

  let token: string
  let expiresAt: number
  try {
    const minted = await mintToken({ accountId: account.id, phone: account.phone })
    token = minted.token
    expiresAt = minted.expiresAt
  } catch (err) {
    logger.error({ err: String(err) }, 'auth.mint_token_failed')
    return c.json({ error: 'token_mint_failed' }, 500)
  }

  return c.json({
    token,
    expiresAt,
    isNewUser,
    account: {
      id: account.id,
      phone: account.phone,
      accountType: account.accountType,
      persona: account.persona,
      cachedBalance: account.cachedBalance,
    },
  })
})

auth.post('/auth/logout', (c) => {
  // Stateless JWT — logout is purely client-side (drop the token from
  // SecureStore). We expose the endpoint so analytics can hook here later.
  return c.body(null, 204)
})
