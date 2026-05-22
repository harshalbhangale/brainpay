import type { Context, MiddlewareHandler } from 'hono'
import { logger } from '../logger'
import { verifyToken } from '../services/jwt'

/**
 * Validates BrainPal-issued HS256 JWT from `Authorization: Bearer <token>`
 * and attaches { accountId, phone } to context.
 *
 * No Supabase Auth involved — we mint our own tokens in /auth/otp/check.
 */

export type AuthVars = {
  accountId: string
  phone: string | null
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'unauthenticated' }, 401)

  try {
    const { accountId, phone } = await verifyToken(token)
    c.set('accountId', accountId)
    c.set('phone', phone)
    await next()
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 200) }, 'auth.verify_failed')
    return c.json({ error: 'invalid_token' }, 401)
  }
}

/** Helper for handlers to read the authed accountId. */
export function authedAccountId(c: Context<{ Variables: AuthVars }>): string {
  return c.get('accountId')
}
