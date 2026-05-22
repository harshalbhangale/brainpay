import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Context, MiddlewareHandler } from 'hono'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Validates Supabase JWT from `Authorization: Bearer <token>` and attaches
 * `accountId` to context for downstream handlers.
 *
 * Supabase projects can issue HS256 (legacy shared secret) or asymmetric
 * (ES256/RS256 via JWKS) tokens depending on whether the project has been
 * migrated to the new key system. We inspect the JWT header `alg` and
 * route to the right verifier.
 */

const env = loadEnv()

// Supabase JWKS lives at the project's HTTPS API URL, not the Postgres
// connection string. SUPABASE_URL in this codebase holds the postgres URL
// for Drizzle; the HTTPS URL is in SUPABASE_API_URL. Fall back to
// SUPABASE_URL only when it actually starts with https:// (older deploys
// where SUPABASE_URL was overloaded).
const apiUrl =
  env.SUPABASE_API_URL ??
  (env.SUPABASE_URL.startsWith('https://') ? env.SUPABASE_URL : null)

if (!apiUrl) {
  // Boot loud — every authed request would 401 otherwise.
  throw new Error(
    'auth middleware: SUPABASE_API_URL missing (must be https://...). ' +
      'SUPABASE_URL alone is the Drizzle postgres URL and cannot serve JWKS.',
  )
}

const JWKS_URL = `${apiUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
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

  // Inspect the JWT header to choose the right verification path.
  let alg: string | undefined
  try {
    const headerJson = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString(),
    )
    alg = headerJson.alg
  } catch {
    return c.json({ error: 'invalid_token' }, 401)
  }

  try {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET
    let payload: Record<string, unknown>

    if (alg === 'HS256') {
      if (!jwtSecret) {
        logger.error({ alg }, 'auth.missing_hs256_secret')
        return c.json({ error: 'invalid_token' }, 401)
      }
      const enc = new TextEncoder().encode(jwtSecret)
      const verified = await jwtVerify(token, enc, { algorithms: ['HS256'] })
      payload = verified.payload as Record<string, unknown>
    } else {
      // ES256 / RS256 — use the project's JWKS.
      const verified = await jwtVerify(token, getJwks())
      payload = verified.payload as Record<string, unknown>
    }

    const sub = payload.sub as string | undefined
    if (!sub) return c.json({ error: 'invalid_token' }, 401)

    c.set('accountId', sub)
    c.set('phone', (payload.phone as string | undefined) ?? null)
    await next()
  } catch (err) {
    logger.warn(
      { err: String(err).slice(0, 200), alg, jwksUrl: JWKS_URL },
      'auth.verify_failed',
    )
    return c.json({ error: 'invalid_token' }, 401)
  }
}

/** Helper for handlers to read the authed accountId. */
export function authedAccountId(c: Context<{ Variables: AuthVars }>): string {
  return c.get('accountId')
}
