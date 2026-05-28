import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { accounts, cartItems, ledger, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { sendPushToAccount, PushTemplates } from '../services/push'/**
 * Wallet endpoints — Sprint 1 Part 2.
 *
 *   GET  /wallet              balance + last 50 ledger entries
 *   POST /wallet/topup        parent credits Brains to a kid (internal, no Stripe)
 *   POST /wallet/purchase     confirm cart checkout — deduct Brains, clear cart
 */
export const wallet = new Hono<{ Variables: AuthVars }>()
wallet.use('*', requireAuth)

// ─── Helper: resolve familyId for an account ─────────────────────────
async function getFamilyId(accountId: string): Promise<string | null> {
  const row = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  return row[0]?.familyId ?? null
}

// ─── Helper: credit Brains atomically ────────────────────────────────
// Locks the account row, computes new balance, writes ledger + updates
// cachedBalance in one transaction so ledger.balance_after is always correct.
async function creditBrains(opts: {
  familyId: string
  accountId: string
  actorId: string
  brainsDelta: number
  kind: string
  metadata: Record<string, unknown>
}): Promise<{ balanceAfter: number }> {
  return db.transaction(async (tx) => {
    // Lock the account row to prevent concurrent balance drift.
    const [acct] = await tx
      .select({ cachedBalance: accounts.cachedBalance })
      .from(accounts)
      .where(eq(accounts.id, opts.accountId))
      .for('update')

    if (!acct) throw new Error(`account_not_found:${opts.accountId}`)

    const balanceAfter = acct.cachedBalance + opts.brainsDelta

    // Update cached balance.
    await tx
      .update(accounts)
      .set({ cachedBalance: sql`${accounts.cachedBalance} + ${opts.brainsDelta}` })
      .where(eq(accounts.id, opts.accountId))

    // Write ledger row with correct balance_after.
    await tx.insert(ledger).values({
      familyId: opts.familyId,
      accountId: opts.accountId,
      actorId: opts.actorId,
      kind: opts.kind,
      brainsDelta: opts.brainsDelta,
      balanceAfter,
      metadata: opts.metadata,
    })

    return { balanceAfter }
  })
}

// ─── GET /wallet ──────────────────────────────────────────────────────
// Returns the caller's balance + last 50 ledger entries.
// Works for both parent and kid accounts.
wallet.get('/wallet', async (c) => {
  const accountId = authedAccountId(c)

  const [acct] = await db
    .select({ cachedBalance: accounts.cachedBalance })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!acct) return c.json({ error: 'account_not_found' }, 404)

  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100)

  const entries = await db
    .select()
    .from(ledger)
    .where(eq(ledger.accountId, accountId))
    .orderBy(desc(ledger.createdAt))
    .limit(limit)

  return c.json({
    balance: acct.cachedBalance,
    entries,
  })
})

// ─── POST /wallet/topup ───────────────────────────────────────────────
// Parent directly credits Brains to a kid (internal transfer, no Stripe).
// Used for: chore payouts, manual top-ups from the parent dashboard.
// For Stripe-funded top-ups, use POST /payments/topup-intent instead.
//
// Body: { kidAccountId: string, brainsDelta: number, note?: string, kind?: string }
wallet.post('/wallet/topup', async (c) => {
  const actorId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      kidAccountId: z.string().uuid(),
      brainsDelta: z.number().int().min(1).max(100_000),
      note: z.string().max(200).optional(),
      kind: z.enum(['topup', 'chore_payout', 'adjustment']).default('topup'),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { kidAccountId, brainsDelta, note, kind } = parsed.data

  // Verify actor and kid share a family.
  const actorFamily = await getFamilyId(actorId)
  const kidFamily = await getFamilyId(kidAccountId)

  if (!actorFamily || actorFamily !== kidFamily) {
    return c.json({ error: 'not_in_same_family' }, 403)
  }

  try {
    const { balanceAfter } = await creditBrains({
      familyId: actorFamily,
      accountId: kidAccountId,
      actorId,
      brainsDelta,
      kind,
      metadata: { note: note ?? null, source: 'internal_topup' },
    })

    logger.info({ actorId, kidAccountId, brainsDelta, kind, balanceAfter }, 'wallet.topup')

    // Fire push to kid — non-blocking, never fails the request.
    sendPushToAccount(
      kidAccountId,
      PushTemplates.topupReceived(brainsDelta, note),
    ).catch(() => undefined)

    return c.json({ ok: true, balanceAfter, brainsDelta })
  } catch (err) {
    logger.error({ err: String(err), actorId, kidAccountId }, 'wallet.topup_failed')
    return c.json({ error: 'topup_failed' }, 500)
  }
})

// ─── POST /wallet/purchase ────────────────────────────────────────────
// Confirms a cart checkout — deducts net Brains, clears cart, writes ledger.
// Called after NFC tap confirms payment on the device.
//
// Body: { amountCents: number }  — real dollar amount the kid typed
wallet.post('/wallet/purchase', async (c) => {
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      amountCents: z.number().int().min(0).max(50_000),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { amountCents } = parsed.data

  const familyId = await getFamilyId(accountId)
  if (!familyId) return c.json({ error: 'no_family' }, 403)

  // Load active cart items (not expired).
  const now = new Date()
  const items = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.accountId, accountId)))

  const activeItems = items.filter((i) => new Date(i.expiresAt) > now)

  if (activeItems.length === 0) {
    return c.json({ error: 'cart_empty' }, 400)
  }

  // Net Brains delta across all cart items.
  const netBrainsDelta = activeItems.reduce((sum, i) => sum + i.brainsDelta, 0)

  try {
    const { balanceAfter } = await db.transaction(async (tx) => {
      // Lock account.
      const [acct] = await tx
        .select({ cachedBalance: accounts.cachedBalance })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update')

      if (!acct) throw new Error('account_not_found')

      const newBalance = acct.cachedBalance + netBrainsDelta

      // Update balance.
      await tx
        .update(accounts)
        .set({ cachedBalance: sql`${accounts.cachedBalance} + ${netBrainsDelta}` })
        .where(eq(accounts.id, accountId))

      // Write one ledger row per cart item.
      for (const item of activeItems) {
        const runningBalance = acct.cachedBalance + item.brainsDelta
        await tx.insert(ledger).values({
          familyId,
          accountId,
          actorId: accountId,
          kind: 'cart_checkout',
          brainsDelta: item.brainsDelta,
          balanceAfter: runningBalance,
          metadata: {
            itemName: item.itemName,
            itemEmoji: item.itemEmoji,
            palQuote: item.palQuote,
            amountCents,
            detectionId: item.detectionId,
          },
        })
      }

      // Clear the cart.
      await tx
        .delete(cartItems)
        .where(eq(cartItems.accountId, accountId))

      return { balanceAfter: newBalance }
    })

    logger.info(
      { accountId, itemCount: activeItems.length, netBrainsDelta, balanceAfter, amountCents },
      'wallet.purchase',
    )

    return c.json({
      ok: true,
      itemCount: activeItems.length,
      netBrainsDelta,
      balanceAfter,
      amountCents,
    })
  } catch (err) {
    logger.error({ err: String(err), accountId }, 'wallet.purchase_failed')
    return c.json({ error: 'purchase_failed' }, 500)
  }
})


// ─── GET /cart ────────────────────────────────────────────────────────
// Returns the caller's active cart items (not expired).
wallet.get('/cart', async (c) => {
  const accountId = authedAccountId(c)
  const now = new Date()

  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.accountId, accountId))
    .orderBy(desc(cartItems.createdAt))

  const active = items.filter((i) => new Date(i.expiresAt) > now)

  return c.json({
    items: active.map((i) => ({
      id: i.id,
      itemName: i.itemName,
      itemEmoji: i.itemEmoji,
      brainsDelta: i.brainsDelta,
      palQuote: i.palQuote,
    })),
  })
})
