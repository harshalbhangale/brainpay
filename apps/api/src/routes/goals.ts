import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { goals, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'

/**
 * Goals API.
 *   GET  /goals          list goals for the current account
 *   POST /goals          create a new goal (abandons existing active goal)
 */
export const goalsRoutes = new Hono<{ Variables: AuthVars }>()
goalsRoutes.use('*', requireAuth)

goalsRoutes.get('/goals', async (c) => {
  const accountId = authedAccountId(c)

  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.accountId, accountId))
    .orderBy(goals.createdAt)

  return c.json({ goals: rows })
})

goalsRoutes.post('/goals', async (c) => {
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      name: z.string().min(1).max(100).trim(),
      targetBrains: z.number().int().min(1).max(1_000_000),
      emoji: z.string().max(10).default('🎯'),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { name, targetBrains, emoji } = parsed.data

  // Get family ID.
  const [memberRow] = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)

  if (!memberRow) return c.json({ error: 'no_family' }, 403)

  // Abandon existing active goal.
  await db
    .update(goals)
    .set({ status: 'abandoned' })
    .where(and(eq(goals.accountId, accountId), eq(goals.status, 'active')))

  const [goal] = await db
    .insert(goals)
    .values({
      familyId: memberRow.familyId,
      accountId,
      name,
      targetBrains,
      currentBrains: 0,
      emoji,
      status: 'active',
    })
    .returning()

  logger.info({ accountId, goalId: goal.id, name }, 'goals.created')
  return c.json({ goal }, 201)
})
