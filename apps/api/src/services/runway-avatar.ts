/**
 * Runway Characters (GWM-1) — real-time conversational avatar for StudyPal
 * interviews.
 * ───────────────────────────────────────────────────────────────────────────
 * Wraps the Runway realtime-session REST API. A "Session" is a live WebRTC
 * (LiveKit) connection between one student and the persistent avatar (e.g. the
 * "Simon Principal" character). The avatar's appearance, voice, personality and
 * knowledge base live on the avatar itself (managed in the Runway dashboard /
 * API), so creating a session only needs the avatar id.
 *
 * The API key is server-side only and is NEVER returned to the client — we mint
 * a session here, poll it to READY, consume it for short-lived LiveKit
 * credentials, and return only those credentials for the browser to join.
 *
 * IMPORTANT timing constraints (validated against the live API):
 *  - The `sessionKey` returned at READY is valid for only ~60s, so we MUST
 *    create → poll → consume within a single request.
 *  - Consume credentials are one-time use; a dropped WebRTC connection needs a
 *    brand-new session (see `createAvatarSession`).
 *  - A session lasts at most ~5 minutes — the client shows a countdown and
 *    offers a clean reconnect.
 */
import { loadEnv } from '../env'
import { logger } from '../logger'

export type RunwaySession = {
  sessionId: string
  /** LiveKit server url, e.g. wss://runway-xxxx.livekit.cloud */
  serverUrl: string
  /** LiveKit access token for the room. */
  token: string
  /** LiveKit room name. */
  roomName: string
  /** The avatar id this session is bound to (handy for the client). */
  avatarId: string
  /** The avatar's display name (e.g. "Lucy", "Ava"), best-effort. */
  tutorName?: string
}

export class RunwayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'RunwayError'
  }
}

/** The configured avatar pool — RUNWAY_AVATAR_ID may be a single id or a
 * comma-separated list of ids (we pick one per interview). */
function avatarPool(): string[] {
  const env = loadEnv()
  return (env.RUNWAY_AVATAR_ID ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Whether Runway avatar interviews are configured (key + at least one avatar). */
export function runwayConfigured(): boolean {
  const env = loadEnv()
  return !!(env.RUNWAYML_API_SECRET && avatarPool().length > 0)
}

/**
 * Pick which avatar (character) to use for a session. With a `seed` (e.g. the
 * interview id) the choice is deterministic, so the first session and any
 * reconnect land on the SAME character. Without a seed it's a uniform random
 * pick — with two avatars configured that's ≈50/50.
 */
export function pickAvatarId(seed?: string): string {
  const ids = avatarPool()
  if (ids.length === 0) throw new RunwayError('Runway not configured (RUNWAY_AVATAR_ID missing)')
  if (ids.length === 1) return ids[0]
  let idx: number
  if (seed) {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
    idx = h % ids.length
  } else {
    idx = Math.floor(Math.random() * ids.length)
  }
  return ids[idx]
}

function cfg() {
  const env = loadEnv()
  if (!env.RUNWAYML_API_SECRET) throw new RunwayError('Runway not configured (RUNWAYML_API_SECRET missing)')
  const avatarIds = avatarPool()
  if (avatarIds.length === 0) throw new RunwayError('Runway not configured (RUNWAY_AVATAR_ID missing)')
  return {
    base: env.RUNWAY_API_BASE.replace(/\/$/, ''),
    version: env.RUNWAY_API_VERSION,
    key: env.RUNWAYML_API_SECRET,
    avatarIds,
  }
}

// Avatar display names (e.g. "Lucy", "Ava") are stable, so cache them across the
// process to avoid an extra GET on every session.
const avatarNameCache = new Map<string, string>()
async function getAvatarName(base: string, version: string, key: string, avatarId: string): Promise<string | undefined> {
  const cached = avatarNameCache.get(avatarId)
  if (cached) return cached
  try {
    const r = await rwFetch(base, `/v1/avatars/${avatarId}`, key, version, { method: 'GET' })
    const raw = (r.json as { name?: unknown }).name
    if (typeof raw === 'string' && raw.trim()) {
      const pretty = raw.trim().replace(/\b\w/g, (ch) => ch.toUpperCase())
      avatarNameCache.set(avatarId, pretty)
      return pretty
    }
  } catch { /* name is best-effort — the client falls back to a generic label */ }
  return undefined
}

async function rwFetch(
  base: string,
  path: string,
  bearer: string,
  version: string,
  init: RequestInit = {},
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${bearer}`,
      'X-Runway-Version': version,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* non-json (e.g. error page) */ }
  return { status: res.status, json, text }
}

/**
 * Create a fresh, ready-to-join avatar session.
 * Creates the realtime session, polls until READY, and consumes it for LiveKit
 * credentials — all within the ~60s sessionKey window. Returns credentials the
 * browser uses to join directly. Call this again to reconnect (sessions are
 * one-time use and capped at ~5 minutes).
 */
export async function createAvatarSession(opts: { avatarId?: string; seed?: string } = {}): Promise<RunwaySession> {
  const { base, version, key } = cfg()
  const avatarId = opts.avatarId || pickAvatarId(opts.seed)

  // 1) Create the session (authenticated with the API key).
  const created = await rwFetch(base, '/v1/realtime_sessions', key, version, {
    method: 'POST',
    body: JSON.stringify({ model: 'gwm1_avatars', avatar: { type: 'custom', avatarId } }),
  })
  if (created.status >= 300 || typeof created.json.id !== 'string') {
    logger.warn({ status: created.status, body: created.text.slice(0, 300) }, 'runway.create_failed')
    throw new RunwayError(`Runway create session failed: ${created.status} ${created.text.slice(0, 160)}`, created.status)
  }
  const sessionId = created.json.id as string

  // 2) Poll until READY (typically 1–3s). Bail on FAILED. ~60s budget.
  let sessionKey: string | undefined
  for (let i = 0; i < 60; i++) {
    const s = await rwFetch(base, `/v1/realtime_sessions/${sessionId}`, key, version, { method: 'GET' })
    const status = s.json.status as string | undefined
    if (status === 'READY') {
      sessionKey = s.json.sessionKey as string
      break
    }
    if (status === 'FAILED' || status === 'CANCELLED') {
      logger.warn({ sessionId, status, failure: s.json.failure }, 'runway.session_failed')
      throw new RunwayError(`Runway session ${status}: ${JSON.stringify(s.json.failure ?? {}).slice(0, 160)}`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!sessionKey) {
    throw new RunwayError('Runway session timed out waiting for READY', 504)
  }

  // 3) Consume immediately for one-time LiveKit credentials. NB: this call must
  // authenticate with the short-lived sessionKey, NOT the API key.
  const consumed = await rwFetch(base, `/v1/realtime_sessions/${sessionId}/consume`, sessionKey, version, {
    method: 'POST',
    body: '{}',
  })
  if (consumed.status >= 300 || typeof consumed.json.url !== 'string' || typeof consumed.json.token !== 'string') {
    logger.warn({ sessionId, status: consumed.status, body: consumed.text.slice(0, 300) }, 'runway.consume_failed')
    throw new RunwayError(`Runway consume failed: ${consumed.status} ${consumed.text.slice(0, 160)}`, consumed.status)
  }

  const tutorName = await getAvatarName(base, version, key, avatarId)

  return {
    sessionId,
    serverUrl: consumed.json.url as string,
    token: consumed.json.token as string,
    roomName: (consumed.json.roomName as string) ?? sessionId,
    avatarId,
    tutorName,
  }
}


// ─── Knowledge base (documents attached to the single avatar) ───────────

/**
 * Attach a fresh knowledge document to the avatar, replacing whatever was
 * linked before. Used to ground the interviewer in the current interview's
 * blueprint (Phase 1 / Option A).
 *
 * NB: knowledge attaches to the AVATAR (global), so with a single shared avatar
 * this is last-writer-wins across concurrent interviews — acceptable for now.
 * Best-effort: never throws (a knowledge failure shouldn't kill the interview).
 */
export async function attachAvatarKnowledge(content: string, name = 'StudyPal Interview Blueprint', avatarId?: string): Promise<boolean> {
  try {
    const { base, version, key, avatarIds } = cfg()
    const target = avatarId || avatarIds[0]

    // Capture currently-linked docs so we can clean them up afterwards.
    const before = await rwFetch(base, `/v1/avatars/${target}`, key, version, { method: 'GET' })
    const oldIds = Array.isArray((before.json as { documentIds?: unknown }).documentIds)
      ? ((before.json as { documentIds?: string[] }).documentIds as string[])
      : []

    // Create the new document (tied to the avatar).
    const created = await rwFetch(base, '/v1/documents', key, version, {
      method: 'POST',
      body: JSON.stringify({ avatarId: target, name, content: content.slice(0, 180_000) }),
    })
    const docId = (created.json as { id?: string }).id
    if (created.status >= 300 || !docId) {
      logger.warn({ status: created.status, body: created.text.slice(0, 200) }, 'runway.document_create_failed')
      return false
    }

    // Make it the avatar's sole active knowledge (replaces prior set).
    const linked = await rwFetch(base, `/v1/avatars/${target}`, key, version, {
      method: 'PATCH',
      body: JSON.stringify({ documentIds: [docId] }),
    })
    if (linked.status >= 300) {
      logger.warn({ status: linked.status, body: linked.text.slice(0, 200) }, 'runway.avatar_link_failed')
      return false
    }

    // Tidy up superseded documents (best-effort).
    for (const id of oldIds) {
      if (id === docId) continue
      void rwFetch(base, `/v1/documents/${id}`, key, version, { method: 'DELETE' }).catch(() => undefined)
    }
    logger.info({ docId }, 'runway.knowledge_attached')
    return true
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 160) }, 'runway.attach_knowledge_failed')
    return false
  }
}

/** Update an avatar's personality (one-time setup of the viva interviewer). */
export async function setAvatarPersonality(personality: string, avatarId?: string): Promise<boolean> {
  try {
    const { base, version, key, avatarIds } = cfg()
    const target = avatarId || avatarIds[0]
    const res = await rwFetch(base, `/v1/avatars/${target}`, key, version, {
      method: 'PATCH',
      body: JSON.stringify({ personality }),
    })
    if (res.status >= 300) {
      logger.warn({ status: res.status, body: res.text.slice(0, 200) }, 'runway.personality_update_failed')
      return false
    }
    return true
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 160) }, 'runway.set_personality_failed')
    return false
  }
}
