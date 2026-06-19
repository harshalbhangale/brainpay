import { randomUUID, createHash } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

const BASE_URL = process.env.API_BASE_URL || 'https://api.brainpal.com.au'
const JWT_SECRET = process.env.API_JWT_SECRET!
const key = () => new TextEncoder().encode(JWT_SECRET)

// ─── In-memory auth code store (codes live <60s) ──────────────────────
interface AuthCode {
  code: string
  accountId: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  scope: string
  expiresAt: number
}

const codes = new Map<string, AuthCode>()

export function storeAuthCode(opts: Omit<AuthCode, 'code' | 'expiresAt'>): string {
  const code = randomUUID()
  codes.set(code, { ...opts, code, expiresAt: Date.now() + 60_000 })
  return code
}

export function consumeAuthCode(code: string, codeVerifier: string): AuthCode | null {
  const entry = codes.get(code)
  if (!entry) return null
  codes.delete(code)
  if (Date.now() > entry.expiresAt) return null
  // Verify PKCE S256
  const expected = base64url(createHash('sha256').update(codeVerifier).digest())
  if (expected !== entry.codeChallenge) return null
  return entry
}

// ─── Refresh tokens (in-memory for now, move to DB for multi-instance) ─
interface RefreshEntry {
  token: string
  accountId: string
  clientId: string
  scope: string
}

const refreshTokens = new Map<string, RefreshEntry>()

export function createRefreshToken(accountId: string, clientId: string, scope: string): string {
  const token = randomUUID()
  refreshTokens.set(token, { token, accountId, clientId, scope })
  return token
}

export function consumeRefreshToken(token: string): RefreshEntry | null {
  const entry = refreshTokens.get(token)
  if (!entry) return null
  refreshTokens.delete(token) // Rotate: old token is single-use
  return entry
}

// ─── Access tokens (short-lived JWTs) ─────────────────────────────────
export async function mintAccessToken(accountId: string, scope: string): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = 3600 // 1 hour
  const token = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setSubject(accountId)
    .setIssuer(BASE_URL)
    .setAudience(`${BASE_URL}/mcp`)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(key())
  return { token, expiresIn }
}

export async function verifyAccessToken(token: string): Promise<{ accountId: string; scope: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ['HS256'],
      issuer: BASE_URL,
      audience: `${BASE_URL}/mcp`,
    })
    return { accountId: payload.sub!, scope: (payload.scope as string) ?? '' }
  } catch {
    return null
  }
}

// ─── CIMD validation ──────────────────────────────────────────────────
export async function validateClientId(clientId: string): Promise<{ redirectUris: string[] } | null> {
  // clientId is a URL — fetch it and validate
  if (!clientId.startsWith('https://')) return null
  try {
    const res = await fetch(clientId, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const doc = await res.json() as { client_id?: string; redirect_uris?: string[] }
    // Self-referential check
    if (doc.client_id !== clientId) return null
    return { redirectUris: doc.redirect_uris ?? [] }
  } catch {
    return null
  }
}

export function redirectUriAllowed(requestedUri: string, allowedUris: string[]): boolean {
  // Exact match for https URIs
  if (allowedUris.includes(requestedUri)) return true
  // Loopback: ignore port per RFC 8252 §7.3
  try {
    const req = new URL(requestedUri)
    if (req.protocol !== 'http:') return false
    const isLoopback = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.hostname === '[::1]'
    if (!isLoopback) return false
    return allowedUris.some((uri) => {
      try {
        const a = new URL(uri)
        return a.protocol === 'http:' &&
          (a.hostname === 'localhost' || a.hostname === '127.0.0.1' || a.hostname === '[::1]') &&
          a.pathname === req.pathname
      } catch { return false }
    })
  } catch { return false }
}

// ─── Helpers ──────────────────────────────────────────────────────────
function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

// Cleanup expired codes periodically
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of codes) {
    if (now > v.expiresAt) codes.delete(k)
  }
}, 60_000)
