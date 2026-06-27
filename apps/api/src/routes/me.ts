import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts, families, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { reverseGeocode } from '../services/geocode'

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

// ─── POST /me/location ────────────────────────────────────────────────
// Stores the caller's latest device location AND appends it to a capped,
// de-duped movement trail (kept inside the same lastLocation JSON, so it rides
// along in /family with no schema change). The trail powers the family map's
// animated journey view — only real, recorded points, never fabricated.
type TrailPoint = { lat: number; lng: number; at: string; place?: string | null }

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

me.post('/me/location', async (c) => {
  const accountId = authedAccountId(c)
  const body = (await c.req.json().catch(() => ({}))) as { lat?: number; lng?: number; accuracy?: number }
  const { lat, lng, accuracy } = body
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'invalid_location' }, 400)
  }
  try {
    const place = await reverseGeocode(lat, lng)
    const at = new Date().toISOString()

    // Append to the movement trail only when the device has actually moved
    // (>25m) or enough time passed (>2min), so the trail stays meaningful.
    const prev = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
    const prevLoc = (prev?.lastLocation ?? null) as { trail?: TrailPoint[] } | null
    const trail: TrailPoint[] = Array.isArray(prevLoc?.trail) ? prevLoc!.trail! : []
    const last = trail[trail.length - 1]
    const moved =
      !last ||
      haversineMeters(last.lat, last.lng, lat, lng) > 25 ||
      Date.now() - Date.parse(last.at) > 120_000
    const nextTrail = moved ? [...trail, { lat, lng, at, place }].slice(-60) : trail

    await db
      .update(accounts)
      .set({ lastLocation: { lat, lng, accuracy: accuracy ?? null, place, at, trail: nextTrail } })
      .where(eq(accounts.id, accountId))
    return c.json({ ok: true })
  } catch (err) {
    logger.error({ err: String(err) }, 'me.location_failed')
    return c.json({ error: 'update_failed' }, 500)
  }
})

// ─── PATCH /me/push-token ─────────────────────────────────────────────
// Stores the Expo push token for this account.
// Called once on first app open after notification permission is granted.
me.patch('/me/push-token', async (c) => {
  const accountId = authedAccountId(c)
  const body = await c.req.json().catch(() => ({})) as { token?: string }
  const token = body.token?.trim()

  if (!token || !token.startsWith('ExponentPushToken[')) {
    return c.json({ error: 'invalid_push_token' }, 400)
  }

  try {
    await db
      .update(accounts)
      .set({ pushToken: token })
      .where(eq(accounts.id, accountId))

    logger.info({ accountId }, 'me.push_token_stored')
    return c.json({ ok: true })
  } catch (err) {
    logger.error({ err: String(err) }, 'me.push_token_failed')
    return c.json({ error: 'update_failed' }, 500)
  }
})
