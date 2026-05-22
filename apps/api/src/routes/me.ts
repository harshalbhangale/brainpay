import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts, families, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'

/**
 * GET  /me     → current account + active membership + family (if any)
 * PATCH /me    → update persona / accountType during onboarding
 */
export const me = new Hono<{ Variables: AuthVars }>()
me.use('*', requireAuth)

me.get('/me', async (c) => {
  const accountId = authedAccountId(c)
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  })
  if (!account) return c.json({ error: 'account_not_found' }, 404)

  // Find first active membership + family.
  const memberRow = await db
    .select({
      familyId: memberships.familyId,
      role: memberships.role,
      familyName: families.name,
      familyAvatar: families.avatar,
    })
    .from(memberships)
    .leftJoin(families, eq(families.id, memberships.familyId))
    .where(eq(memberships.accountId, accountId))
    .limit(1)

  const membership = memberRow[0] ?? null

  return c.json({
    account: {
      id: account.id,
      phone: account.phone,
      accountType: account.accountType,
      persona: account.persona,
      cachedBalance: account.cachedBalance,
    },
    family: membership
      ? {
          id: membership.familyId,
          name: membership.familyName,
          avatar: membership.familyAvatar,
          role: membership.role,
        }
      : null,
  })
})

me.patch('/me', async (c) => {
  const accountId = authedAccountId(c)
  const body = await c.req.json().catch(() => ({})) as {
    accountType?: 'parent' | 'kid' | 'extended'
    persona?: Record<string, unknown>
  }

  const updates: Record<string, unknown> = {}
  if (body.accountType) updates.accountType = body.accountType
  if (body.persona) updates.persona = body.persona

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'no_updates' }, 400)
  }

  try {
    const [updated] = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, accountId))
      .returning()

    if (!updated) return c.json({ error: 'account_not_found' }, 404)

    return c.json({
      account: {
        id: updated.id,
        phone: updated.phone,
        accountType: updated.accountType,
        persona: updated.persona,
        cachedBalance: updated.cachedBalance,
      },
    })
  } catch (err) {
    logger.error({ err: String(err) }, 'me.patch_failed')
    return c.json({ error: 'update_failed' }, 500)
  }
})
