import type { MiddlewareHandler } from 'hono'

/**
 * Validates Supabase JWT from Authorization: Bearer <token>.
 * Attaches { userId, kidId } to c.var.
 * Implemented day 2.
 */
export const requireAuth: MiddlewareHandler = async (_c, next) => {
  // TODO(day-2): jose.jwtVerify with Supabase project's JWKS, populate c.var.
  await next()
}
