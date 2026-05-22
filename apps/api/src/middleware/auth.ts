import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Context, MiddlewareHandler } from 'hono'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Validates Supabase JWT from `Authorization: Bearer <token>` and attaches
 * `accountId` to context for downstream handlers.
 *
 * Supabase signs JWTs with a project-specific HS256 key (legacy) or RS256
 * via JWKS. We support both: prefer JWKS when SUPABASE_JWT_JWKS_URL is set,
 * fall back to a shared secret via SUPABASE_JWT_SECRET.
 *
 * For the prototype we accept the access_token from supabase-js as-is —
 * Supabase Postgres RLS already enforces row-level scoping, so the API
 * just needs the verified `sub` (= accounts.id).
 */

const env = loadEnv()

// Use Supabase's JWKS — every project exposes one at /auth/v1/.well-known/jwks.json
const JWKS_URL = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL))
  return jwks
}

export type AuthVars = {
  accountId: string
  phone: string | null
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'unauthenticated' }, 401)

  try {
    // jwtVerify with JWKS works for both HS256 (using shared secret) and
    // RS256 (using JWKS). For HS256-signed tokens jose will fail to find a
    // matching key in the JWKS — caller can set SUPABASE_JWT_SECRET as a
    // fallback path. We try JWKS first.
    const jwtSecret = process.env.SUPABASE_JWT_SECRET
    let payload: Record<string, unknown>

    if (jwtSecret) {
      const enc = new TextEncoder().encode(jwtSecret)
      const verified = await jwtVerify(token, enc, { algorithms: ['HS256'] })
      payload = verified.payload as Record<string, unknown>
    } else {
      const verified = await jwtVerify(token, getJwks())
      payload = verified.payload as Record<string, unknown>
    }

    const sub = payload.sub as string | undefined
    if (!sub) return c.json({ error: 'invalid_token' }, 401)

    c.set('accountId', sub)
    c.set('phone', (payload.phone as string | undefined) ?? null)
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
