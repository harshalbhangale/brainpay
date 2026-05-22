import { Hono } from 'hono'
import { SignJWT, jwtVerify } from 'jose'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts, families, invites, ledger, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { sendInviteSms } from '../services/twilio'

/**
 * Invite system — SMS deep link + QR.
 *
 * Token is a signed JWT (HS256) carrying { invite_id, family_id, role,
 * kid_seed, exp }. The token itself is what the QR encodes; SMS gets a
 * shorter `code` that maps to the same invite row server-side.
 *
 * Routes:
 *   POST   /invites                  parent creates an invite
 *   GET    /invites/:code            preview (public — used by invite-accept)
 *   POST   /invites/:id/send-sms     send the SMS via Twilio
 *   DELETE /invites/:id              revoke
 *   POST   /invites/:code/accept     accept (Task 7)
 */

const INVITE_JWT_SECRET = process.env.INVITE_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET ?? 'dev-only-invite-secret-replace-me'
const SECRET = new TextEncoder().encode(INVITE_JWT_SECRET)
const TOKEN_TTL_DAYS = 7

export const invitesRoutes = new Hono<{ Variables: AuthVars }>()

// Public preview endpoint sits BEFORE the auth middleware.
const publicInvites = new Hono()

publicInvites.get('/invites/:code', async (c) => {
  const code = c.req.param('code')
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.code, code), eq(invites.status, 'pending')),
  })
  if (!invite) return c.json({ error: 'not_found_or_used' }, 404)
  if (invite.expiresAt < new Date()) return c.json({ error: 'expired' }, 410)

  const family = await db.query.families.findFirst({ where: eq(families.id, invite.familyId) })
  const inviter = await db.query.accounts.findFirst({ where: eq(accounts.id, invite.invitedBy) })
  const inviterPersona = (inviter?.persona ?? {}) as { name?: string; avatar?: string }

  return c.json({
    invite: {
      id: invite.id,
      code: invite.code,
      expectedRole: invite.expectedRole,
      kidSeed: invite.kidSeed,
      initialTopup: invite.initialTopup,
      family: { id: family?.id, name: family?.name, avatar: family?.avatar },
      inviter: { name: inviterPersona.name ?? 'Someone', avatar: inviterPersona.avatar ?? '👤' },
      expiresAt: invite.expiresAt,
    },
  })
})

invitesRoutes.route('/', publicInvites)

// Authed routes for create / send-sms / revoke.
const authed = new Hono<{ Variables: AuthVars }>()
authed.use('*', requireAuth)

authed.post('/invites', async (c) => {
  const accountId = authedAccountId(c)
  const body = (await c.req.json().catch(() => ({}))) as {
    expectedRole?: 'co_parent' | 'guardian' | 'kid'
    kidSeed?: Record<string, unknown>
    initialTopup?: number
    recipientPhone?: string
  }

  // Find the inviter's family.
  const memberRow = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  if (!memberRow.length) return c.json({ error: 'no_family' }, 400)
  const familyId = memberRow[0].familyId
  if (!['primary_parent', 'co_parent'].includes(memberRow[0].role)) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const expectedRole = body.expectedRole ?? 'kid'
  const kidSeed = body.kidSeed ?? {}
  const initialTopup = Math.max(0, Math.min(body.initialTopup ?? 0, 10_000))
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

  // Short SMS-friendly code: 8 chars uppercase alphanumeric.
  const code = generateCode()

  // Insert invite without token first so we have an id to embed.
  let row
  try {
    const [inserted] = await db
      .insert(invites)
      .values({
        familyId,
        invitedBy: accountId,
        code,
        token: 'pending', // placeholder, replaced below
        expectedRole,
        kidSeed,
        initialTopup,
        recipientPhone: body.recipientPhone ?? null,
        expiresAt,
      })
      .returning()
    row = inserted
  } catch (err) {
    logger.error({ err: String(err) }, 'invite.insert_failed')
    return c.json({ error: 'insert_failed' }, 500)
  }

  const token = await new SignJWT({
    invite_id: row.id,
    family_id: familyId,
    role: expectedRole,
    code,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(SECRET)

  // Update with the real token.
  await db.update(invites).set({ token }).where(eq(invites.id, row.id))

  // Build deep link payload — both SMS and QR use this.
  const link = `brainpay://inv/${code}`

  return c.json({
    invite: {
      id: row.id,
      code,
      token,
      link,
      qrData: token,           // QR encodes the full JWT for instant verify
      expiresAt: row.expiresAt,
      expectedRole,
      kidSeed,
      initialTopup,
    },
  })
})

authed.post('/invites/:id/send-sms', async (c) => {
  const accountId = authedAccountId(c)
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { phone?: string }
  const phone = body.phone?.trim()
  if (!phone) return c.json({ error: 'phone_required' }, 400)

  const invite = await db.query.invites.findFirst({ where: eq(invites.id, id) })
  if (!invite) return c.json({ error: 'not_found' }, 404)
  if (invite.invitedBy !== accountId) return c.json({ error: 'forbidden' }, 403)

  // Inviter context for the SMS body.
  const inviter = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
  const inviterPersona = (inviter?.persona ?? {}) as { name?: string }
  const family = await db.query.families.findFirst({ where: eq(families.id, invite.familyId) })

  const link = `brainpay://inv/${invite.code}`
  const result = await sendInviteSms({
    to: phone,
    inviterName: inviterPersona.name ?? 'A parent',
    familyName: family?.name ?? 'their family',
    link,
  })

  if (!result.ok) return c.json({ error: result.error ?? 'send_failed' }, 502)

  // Persist recipient_phone so otp-check can detect pending invites.
  await db.update(invites).set({ recipientPhone: phone }).where(eq(invites.id, id))

  return c.json({ ok: true, messageSid: result.messageSid })
})

authed.delete('/invites/:id', async (c) => {
  const accountId = authedAccountId(c)
  const id = c.req.param('id')
  const invite = await db.query.invites.findFirst({ where: eq(invites.id, id) })
  if (!invite) return c.json({ error: 'not_found' }, 404)
  if (invite.invitedBy !== accountId) return c.json({ error: 'forbidden' }, 403)

  await db
    .update(invites)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(invites.id, id))
  return c.json({ ok: true })
})

// Accept: caller is authed (just signed in via OTP), they claim the invite.
authed.post('/invites/:code/accept', async (c) => {
  const accountId = authedAccountId(c)
  const code = c.req.param('code')

  const invite = await db.query.invites.findFirst({ where: eq(invites.code, code) })
  if (!invite) return c.json({ error: 'not_found' }, 404)
  if (invite.status !== 'pending') return c.json({ error: 'already_used' }, 410)
  if (invite.expiresAt < new Date()) return c.json({ error: 'expired' }, 410)

  // Verify the JWT to ensure tampering hasn't occurred.
  try {
    await verifyInviteToken(invite.token)
  } catch {
    return c.json({ error: 'token_invalid' }, 400)
  }

  // Reject if already a member of this family.
  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.familyId, invite.familyId), eq(memberships.accountId, accountId)))
    .limit(1)
  if (existing.length > 0) return c.json({ error: 'already_in_family' }, 409)

  // Add membership with the role from the invite.
  const role = invite.expectedRole === 'kid'
    ? 'kid'
    : invite.expectedRole === 'co_parent'
      ? 'co_parent'
      : 'guardian'

  // Set accountType from role + apply initial top-up + mark invite accepted —
  // all in one transaction.
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ accountType: role === 'kid' ? 'kid' : (role === 'guardian' ? 'extended' : 'parent') })
        .where(eq(accounts.id, accountId))

      await tx.insert(memberships).values({
        familyId: invite.familyId,
        accountId,
        role,
      })

      if (invite.initialTopup > 0 && role === 'kid') {
        // Insert ledger row — trigger updates cached_balance.
        const balanceAfter = invite.initialTopup
        await tx.insert(ledger).values({
          familyId: invite.familyId,
          accountId,
          actorId: invite.invitedBy,
          kind: 'topup',
          brainsDelta: invite.initialTopup,
          balanceAfter,
          metadata: { reason: 'initial_topup', via: 'invite' },
        })
      }

      await tx
        .update(invites)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(invites.id, invite.id))
    })
  } catch (err) {
    logger.error({ err: String(err) }, 'invite.accept_failed')
    return c.json({ error: 'accept_failed' }, 500)
  }

  return c.json({
    ok: true,
    familyId: invite.familyId,
    role,
    accountType: role === 'kid' ? 'kid' : (role === 'guardian' ? 'extended' : 'parent'),
    kidSeed: invite.kidSeed,
  })
})

invitesRoutes.route('/', authed)

// Util: 8-char SMS-safe code (no 0/O/I/1 to avoid confusion).
function generateCode(): string {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  for (let i = 0; i < 8; i++) s += ALPHA[bytes[i] % ALPHA.length]
  return s
}

// Re-export the verify helper for /invites/:code/accept (Task 7).
export async function verifyInviteToken(token: string) {
  return jwtVerify(token, SECRET)
}
