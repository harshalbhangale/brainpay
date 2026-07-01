import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { accounts, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'

/**
 * Card controls — REAL, persisted card policy (not a card issuer).
 * ───────────────────────────────────────────────────────────────────────────
 * BrainPal has no card processor; the PAN/expiry/CVV are presentation-only.
 * But the CONTROLS are real and durable: freeze, channel toggles, daily limit,
 * and category blocks persist in the account's `persona.cardSettings` (a jsonb
 * column that already exists — no migration needed). A kid manages their own
 * card; a parent manages any kid in their family.
 *
 *   GET /cards/:accountId    read settings (defaults if never set)
 *   PUT /cards/:accountId    merge a partial update (also used by "issue card")
 */
export const cards = new Hono<{ Variables: AuthVars }>()
cards.use('*', requireAuth)

export type CardSettings = {
  issued: boolean
  frozen: boolean
  online: boolean
  atm: boolean
  contactless: boolean
  dailyLimit: number
  blocks: string[]
  /** Visual skin id (see web cardSkins) + custom name printed on the card. */
  design: string
  label: string
}

const DEFAULTS: CardSettings = {
  issued: true,
  frozen: false,
  online: true,
  atm: true,
  contactless: true,
  dailyLimit: 100,
  blocks: [],
  design: 'ink',
  label: '',
}

const patchSchema = z.object({
  issued: z.boolean().optional(),
  frozen: z.boolean().optional(),
  online: z.boolean().optional(),
  atm: z.boolean().optional(),
  contactless: z.boolean().optional(),
  dailyLimit: z.coerce.number().int().min(0).max(100000).optional(),
  blocks: z.array(z.string().max(40)).max(20).optional(),
  design: z.string().max(40).optional(),
  label: z.string().max(40).optional(),
})

/** Actor may touch :accountId if it's their own, or they're a parent in the
 *  same family as that account. Returns true when allowed. */
async function canManage(actorId: string, accountId: string): Promise<boolean> {
  if (actorId === accountId) return true
  const [actor] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, actorId))
    .limit(1)
  if (!actor || !['primary_parent', 'co_parent'].includes(actor.role)) return false
  const [target] = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  return !!target && target.familyId === actor.familyId
}

function readSettings(persona: unknown): CardSettings {
  const cs = (persona as { cardSettings?: Partial<CardSettings> } | null)?.cardSettings
  return { ...DEFAULTS, ...(cs ?? {}) }
}

cards.get('/cards/:accountId', async (c) => {
  const actorId = authedAccountId(c)
  const accountId = c.req.param('accountId')
  if (!(await canManage(actorId, accountId))) return c.json({ error: 'not_allowed' }, 403)

  const [row] = await db.select({ persona: accounts.persona }).from(accounts).where(eq(accounts.id, accountId)).limit(1)
  if (!row) return c.json({ error: 'account_not_found' }, 404)
  return c.json({ settings: readSettings(row.persona) })
})

cards.put('/cards/:accountId', async (c) => {
  const actorId = authedAccountId(c)
  const accountId = c.req.param('accountId')
  if (!(await canManage(actorId, accountId))) return c.json({ error: 'not_allowed' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)

  const [row] = await db.select({ persona: accounts.persona }).from(accounts).where(eq(accounts.id, accountId)).limit(1)
  if (!row) return c.json({ error: 'account_not_found' }, 404)

  const current = readSettings(row.persona)
  const next: CardSettings = { ...current, ...parsed.data }
  const persona = { ...((row.persona as Record<string, unknown>) ?? {}), cardSettings: next }

  await db.update(accounts).set({ persona }).where(eq(accounts.id, accountId))
  logger.info({ actorId, accountId, patch: Object.keys(parsed.data) }, 'cards.update')
  return c.json({ settings: next })
})
