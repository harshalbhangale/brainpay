import { SignJWT, jwtVerify } from 'jose'

/**
 * BrainPal-issued JWTs.
 *
 * We mint our own HS256 tokens signed with API_JWT_SECRET, instead of
 * relying on Supabase Auth. The token's `sub` is accounts.id, which the
 * existing routes use as `accountId`.
 *
 * Format:
 *   header.payload.signature  (compact JWS, alg=HS256)
 *   payload: { sub: <accountId>, phone: <e164>, iat, exp }
 *
 * Default lifetime: 30 days. The mobile app stores the token in
 * SecureStore and re-mints by re-running the OTP flow when it expires.
 */

const SECRET = process.env.API_JWT_SECRET
const ISSUER = 'brainpal-api'
const AUDIENCE = 'brainpal-app'
const TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

function getKey(): Uint8Array {
  if (!SECRET || SECRET.length < 32) {
    throw new Error('API_JWT_SECRET missing or too short (need ≥32 chars)')
  }
  return new TextEncoder().encode(SECRET)
}

export async function mintToken(input: {
  accountId: string
  phone: string
}): Promise<{ token: string; expiresAt: number }> {
  const key = getKey()
  const now = Math.floor(Date.now() / 1000)
  const exp = now + TTL_SECONDS
  const token = await new SignJWT({ phone: input.phone })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.accountId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key)
  return { token, expiresAt: exp }
}

export type VerifiedToken = {
  accountId: string
  phone: string | null
}

export async function verifyToken(token: string): Promise<VerifiedToken> {
  const key = getKey()
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  })
  const sub = payload.sub
  if (!sub) throw new Error('missing_sub')
  return { accountId: sub, phone: (payload.phone as string | undefined) ?? null }
}
