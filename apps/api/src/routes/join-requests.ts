import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { accounts, families, ledger, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { sql } from 'drizzle-orm'

/**
 * Join Request system — replaces SMS invite codes.
 *
 * Flow:
 *   1. Parent enters kid's phone number → POST /join-requests
 *      Server stores a pending request keyed by kid's phone.
 *
 *   2. Kid signs in with their phone → GET /join-requests/pending
 *      Returns any pending requests for their phone.
 *
 *   3. Kid taps Accept → POST /join-requests/:id/accept
 *      Kid is added to the family, initial Brains credited.
 *
 *   4. Kid taps Decline → POST /join-requests/:id/decline
 *
 * No SMS, no invite codes, no Twilio needed.
 * The request is stored in the `invites` table (reusing existing schema)
 * with status='pending' and recipientPhone set.
 */

const E164 = /^\+\d{6,15}$/

export const joinRequests = new Hono<{ Variables: AuthVars }>()

// ─── POST /join-requests ──────────────────────────────────────────────
// Parent creates a join request for a kid by phone number.
// Body: { phone, kidSeed?, initialTopup? }
joinRequests.post('/join-requests', requireAuth, async (c) => {
  const parentId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      phone: z.string().regex(E164, 'Must be E.164 format e.g. +61412345678'),
      kidSeed: z.record(z.unknown()).default({}),
      initialTopup: z.number().int().min(0).max(10_000).default(0),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { phone, kidSeed, initialTopup } = parsed.data

  // Verify parent has a family.
  const [memberRow] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, parentId))
    .limit(1)

  if (!memberRow) return c.json({ error: 'no_family' }, 400)
  if (!['primary_parent', 'co_parent'].includes(memberRow.role)) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const { familyId } = memberRow

  // Check if this phone is already in the family.
  const existingAccount = await db.query.accounts.findFirst({
    where: eq(accounts.phone, phone),
  })
  if (existingAccount) {
    const alreadyMember = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.familyId, familyId), eq(memberships.accountId, existingAccount.id)))
      .limit(1)
    if (alreadyMember.length > 0) {
      return c.json({ error: 'already_in_family' }, 409)
    }
  }

  // Cancel any existing pending request for this phone in this family.
  const { invites } = await import('../db/schema')
  await db
    .update(invites)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(
      and(
        eq(invites.familyId, familyId),
        eq(invites.recipientPhone, phone),
        eq(invites.status, 'pending'),
      ),
    )

  // Create new join request (stored as invite with a special code).
  const code = `JR${generateCode()}`
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  const [row] = await db
    .insert(invites)
    .values({
      familyId,
      invitedBy: parentId,
      code,
      token: 'join-request', // not used for JWT verification
      expectedRole: 'kid',
      kidSeed,
      initialTopup,
      recipientPhone: phone,
      expiresAt,
      status: 'pending',
    })
    .returning()

  logger.info({ parentId, familyId, phone, requestId: row.id }, 'join_request.created')

  return c.json({
    request: {
      id: row.id,
      phone,
      status: 'pending',
      expiresAt: row.expiresAt,
    },
  }, 201)
})

// ─── GET /join-requests/pending ───────────────────────────────────────
// Kid calls this after login to see if any parent wants to add them.
// Returns all pending join requests for the caller's phone.
joinRequests.get('/join-requests/pending', requireAuth, async (c) => {
  const accountId = authedAccountId(c)

  const [acct] = await db
    .select({ phone: accounts.phone })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!acct) return c.json({ requests: [] })

  const { invites } = await import('../db/schema')
  const rows = await db.query.invites.findMany({
    where: and(
      eq(invites.recipientPhone, acct.phone),
      eq(invites.status, 'pending'),
    ),
  })

  // Enrich with family + parent info.
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const family = await db.query.families.findFirst({ where: eq(families.id, r.familyId) })
      const parent = await db.query.accounts.findFirst({ where: eq(accounts.id, r.invitedBy) })
      const parentPersona = (parent?.persona ?? {}) as { name?: string; avatar?: string }
      return {
        id: r.id,
        familyId: r.familyId,
        familyName: family?.name ?? 'A family',
        familyAvatar: family?.avatar ?? '🏡',
        parentName: parentPersona.name ?? 'A parent',
        parentAvatar: parentPersona.avatar ?? '👤',
        initialTopup: r.initialTopup,
        kidSeed: r.kidSeed,
        expiresAt: r.expiresAt,
      }
    }),
  )

  return c.json({ requests: enriched })
})

// ─── POST /join-requests/:id/accept ──────────────────────────────────
// Kid accepts a join request → added to family, Brains credited.
joinRequests.post('/join-requests/:id/accept', requireAuth, async (c) => {
  const accountId = authedAccountId(c)
  const requestId = c.req.param('id')

  const { invites } = await import('../db/schema')
  const request = await db.query.invites.findFirst({
    where: eq(invites.id, requestId),
  })

  if (!request) return c.json({ error: 'not_found' }, 404)
  if (request.status !== 'pending') return c.json({ error: 'already_used' }, 410)
  if (request.expiresAt < new Date()) return c.json({ error: 'expired' }, 410)

  // Verify the kid's phone matches the request.
  const [acct] = await db
    .select({ phone: accounts.phone })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!acct || acct.phone !== request.recipientPhone) {
    return c.json({ error: 'phone_mismatch' }, 403)
  }

  // Check not already in family.
  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.familyId, request.familyId), eq(memberships.accountId, accountId)))
    .limit(1)
  if (existing.length > 0) return c.json({ error: 'already_in_family' }, 409)

  try {
    await db.transaction(async (tx) => {
      // Set account type to kid.
      await tx
        .update(accounts)
        .set({ accountType: 'kid' })
        .where(eq(accounts.id, accountId))

      // Add to family as kid.
      await tx.insert(memberships).values({
        familyId: request.familyId,
        accountId,
        role: 'kid',
      })

      // Credit initial Brains if any.
      if (request.initialTopup > 0) {
        await tx.insert(ledger).values({
          familyId: request.familyId,
          accountId,
          actorId: request.invitedBy,
          kind: 'topup',
          brainsDelta: request.initialTopup,
          balanceAfter: request.initialTopup,
          metadata: { reason: 'initial_topup', via: 'join_request' },
        })
        await tx
          .update(accounts)
          .set({ cachedBalance: sql`${accounts.cachedBalance} + ${request.initialTopup}` })
          .where(eq(accounts.id, accountId))
      }

      // Mark request as accepted.
      await tx
        .update(invites)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(invites.id, requestId))
    })
  } catch (err) {
    logger.error({ err: String(err) }, 'join_request.accept_failed')
    return c.json({ error: 'accept_failed' }, 500)
  }

  logger.info({ accountId, familyId: request.familyId }, 'join_request.accepted')

  return c.json({
    ok: true,
    familyId: request.familyId,
    role: 'kid',
    accountType: 'kid',
    kidSeed: request.kidSeed,
    initialTopup: request.initialTopup,
  })
})

// ─── POST /join-requests/:id/decline ─────────────────────────────────
joinRequests.post('/join-requests/:id/decline', requireAuth, async (c) => {
  const accountId = authedAccountId(c)
  const requestId = c.req.param('id')

  const { invites } = await import('../db/schema')
  const request = await db.query.invites.findFirst({ where: eq(invites.id, requestId) })
  if (!request) return c.json({ error: 'not_found' }, 404)

  await db
    .update(invites)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(invites.id, requestId))

  return c.json({ ok: true })
})

function generateCode(): string {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  for (let i = 0; i < 6; i++) s += ALPHA[bytes[i] % ALPHA.length]
  return s
}
