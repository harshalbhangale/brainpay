import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db'
import { accounts, families, ledger, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'

/**
 * Family endpoints — the household is the top-level entity.
 *   POST /family            create a family (caller becomes primary_parent)
 *   GET  /family            current user's family + members + per-kid summary
 *   GET  /family/members    same as /family but flatter (kids only, with balances)
 *   GET  /family/feed       reverse-chrono ledger across the whole family
 */
export const family = new Hono<{ Variables: AuthVars }>()
family.use('*', requireAuth)

family.post('/family', async (c) => {
  const accountId = authedAccountId(c)
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; avatar?: string }
  const name = body.name?.trim()
  const avatar = body.avatar?.trim() || '🏡'
  if (!name) return c.json({ error: 'name_required' }, 400)

  // Reject if user already has a family membership (P0: one family per parent).
  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  if (existing.length > 0) return c.json({ error: 'already_in_family' }, 409)

  try {
    const [fam] = await db.insert(families).values({ name, avatar }).returning()
    await db.insert(memberships).values({
      familyId: fam.id,
      accountId,
      role: 'primary_parent',
    })
    return c.json({ family: fam })
  } catch (err) {
    logger.error({ err: String(err) }, 'family.create_failed')
    return c.json({ error: 'create_failed' }, 500)
  }
})

family.get('/family', async (c) => {
  const accountId = authedAccountId(c)
  const row = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  if (!row.length) return c.json({ family: null, members: [] })

  const familyId = row[0].familyId

  const fam = await db.query.families.findFirst({ where: eq(families.id, familyId) })

  // All members + their balances.
  const members = await db
    .select({
      accountId: memberships.accountId,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      phone: accounts.phone,
      accountType: accounts.accountType,
      persona: accounts.persona,
      cachedBalance: accounts.cachedBalance,
      lastLocation: accounts.lastLocation,
    })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(eq(memberships.familyId, familyId))

  // Today's event count per member (for kid cards).
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const eventCounts = await db
    .select({
      accountId: ledger.accountId,
      count: sql<number>`count(*)::int`,
    })
    .from(ledger)
    .where(and(eq(ledger.familyId, familyId), gte(ledger.createdAt, startOfToday)))
    .groupBy(ledger.accountId)

  const countMap = new Map(eventCounts.map((r) => [r.accountId, r.count]))

  return c.json({
    family: fam,
    members: members.map((m) => ({
      accountId: m.accountId,
      role: m.role,
      phone: m.phone,
      accountType: m.accountType,
      persona: m.persona,
      cachedBalance: m.cachedBalance,
      todayEventCount: countMap.get(m.accountId) ?? 0,
      lastLocation: m.lastLocation,
    })),
  })
})

family.get('/family/members', async (c) => {
  const accountId = authedAccountId(c)
  const row = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  if (!row.length) return c.json({ members: [] })

  const members = await db
    .select({
      accountId: memberships.accountId,
      role: memberships.role,
      persona: accounts.persona,
      cachedBalance: accounts.cachedBalance,
      accountType: accounts.accountType,
    })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(eq(memberships.familyId, row[0].familyId))

  return c.json({ members })
})

family.get('/family/feed', async (c) => {
  const accountId = authedAccountId(c)
  const row = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  if (!row.length) return c.json({ entries: [] })

  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)
  const kidFilter = c.req.query('kidId')

  const where = kidFilter
    ? and(eq(ledger.familyId, row[0].familyId), eq(ledger.accountId, kidFilter))
    : eq(ledger.familyId, row[0].familyId)

  const entries = await db
    .select()
    .from(ledger)
    .where(where)
    .orderBy(desc(ledger.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json({ entries })
})
