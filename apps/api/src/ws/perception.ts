import type { WebSocket } from 'ws'
import type { PerceptionItem } from '@brainpal/shared'
import { detectItems } from '../services/bedrock'
import { getVerdict } from '../services/llm'
import { speakReaction } from './voice'
import { loadEnv } from '../env'
import { logger } from '../logger'

const env = loadEnv()

/**
 * Per-connection perception state.
 * Detailed Spec § 4.3 hysteresis: 1 hit to appear, 5 misses to clear.
 * Supports multiple concurrent detections (up to MAX_CONCURRENT_DETECTIONS).
 *   TODO(scale): move to Redis when desired-count > 1.
 */

const MAX_CONCURRENT_DETECTIONS = 5

type CandidateItem = {
  itemId: string
  hits: number
  misses: number
  latest: PerceptionItem
}

type ActiveDetection = {
  detectionId: string
  itemId: string
  voiceAbort: AbortController | null
}

export type SessionState = {
  sessionId: string
  // Candidates being tracked (hysteresis buffer)
  candidates: Map<string, CandidateItem>
  // Currently active (appeared) detections
  active: Map<string, ActiveDetection>
  lastSpokeAt: Record<string, number>
  framesSent: number
  detections: number
  reactions: number
}

const HITS_TO_APPEAR = 1
const MISSES_TO_CLEAR = 5
const COOLDOWN_MS = 30_000
const CONFIDENCE_THRESHOLD = 0.4

const sessions = new WeakMap<WebSocket, SessionState>()

export function newSession(ws: WebSocket): SessionState {
  const state: SessionState = {
    sessionId: crypto.randomUUID(),
    candidates: new Map(),
    active: new Map(),
    lastSpokeAt: {},
    framesSent: 0,
    detections: 0,
    reactions: 0,
  }
  sessions.set(ws, state)
  return state
}

export function getSession(ws: WebSocket): SessionState | undefined {
  return sessions.get(ws)
}

export function dropSession(ws: WebSocket) {
  const s = sessions.get(ws)
  if (s) {
    for (const det of s.active.values()) {
      det.voiceAbort?.abort()
    }
  }
  sessions.delete(ws)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function emojiFor(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('drink') || c.includes('beverage') || c.includes('soda')) return '🥤'
  if (c.includes('snack') || c.includes('candy') || c.includes('chocolate') || c.includes('cookie')) return '🍫'
  if (c.includes('dairy') || c.includes('milk') || c.includes('yogurt')) return '🥛'
  if (c.includes('fruit') || c.includes('produce') || c.includes('vegetable')) return '🍎'
  if (c.includes('meal') || c.includes('food')) return '🍱'
  if (c.includes('electronics') || c.includes('tech') || c.includes('phone') || c.includes('laptop')) return '📱'
  if (c.includes('book') || c.includes('magazine')) return '📖'
  if (c.includes('toy') || c.includes('game') || c.includes('lego') || c.includes('plush')) return '🧸'
  if (c.includes('clothing') || c.includes('clothes') || c.includes('shoe')) return '👕'
  if (c.includes('stationery') || c.includes('pen') || c.includes('pencil')) return '✏️'
  if (c.includes('household') || c.includes('cleaning')) return '🏠'
  if (c.includes('sport') || c.includes('ball')) return '⚽'
  return '🛒'
}

function splitBrandProduct(name: string): { brand: string; product: string } {
  // Loose heuristic: first word(s) are brand if Title-Cased, rest is product.
  const parts = name.split(' ')
  if (parts.length <= 1) return { brand: '', product: name }
  return { brand: parts[0], product: parts.slice(1).join(' ') }
}

/** Process one frame: call Gemini, run hysteresis per item, emit detection events, kick off voice. */
export async function onFrame(ws: WebSocket, jpegBytes: Uint8Array): Promise<void> {
  const state = sessions.get(ws)
  if (!state) return

  state.framesSent++
  const result = await detectItems(jpegBytes)

  // Debug breadcrumb so CloudWatch shows what Gemini is seeing every frame.
  logger.info(
    {
      sessionId: state.sessionId,
      frame: state.framesSent,
      items: result.items.map((i) => ({ name: i.name, conf: i.confidence, score: i.healthScore })),
    },
    'perception.frame',
  )

  // Build set of item IDs seen this frame (above confidence threshold).
  const seenItemIds = new Set<string>()
  for (const item of result.items) {
    if (item.confidence >= CONFIDENCE_THRESHOLD) {
      seenItemIds.add(slugify(item.name))
    }
  }

  // ── Update candidates ──────────────────────────────────────────────
  // Increment hits for seen items, misses for unseen.
  for (const item of result.items) {
    if (item.confidence < CONFIDENCE_THRESHOLD) continue
    const itemId = slugify(item.name)
    const existing = state.candidates.get(itemId)
    if (existing) {
      existing.hits += 1
      existing.misses = 0
      existing.latest = item
    } else {
      state.candidates.set(itemId, { itemId, hits: 1, misses: 0, latest: item })
    }
  }

  // Bump misses for candidates not seen this frame.
  for (const [itemId, candidate] of state.candidates) {
    if (!seenItemIds.has(itemId)) {
      candidate.misses += 1
    }
  }

  // ── Promote candidates to active detections ────────────────────────
  for (const [itemId, candidate] of state.candidates) {
    if (candidate.hits >= HITS_TO_APPEAR && !state.active.has(itemId)) {
      // Cap concurrent detections.
      if (state.active.size >= MAX_CONCURRENT_DETECTIONS) continue

      const detectionId = crypto.randomUUID()
      const top = candidate.latest
      state.detections += 1

      const { brand, product } = splitBrandProduct(top.name)
      const [bx, by, bw, bh] = top.bbox
      const anchor: [number, number] = [bx + bw / 2, by + bh / 2]

      const palCtx = { name: top.name, category: top.category, healthScore: top.healthScore }

      const [verdict] = await Promise.all([
        getVerdict(palCtx),
        Promise.resolve(),
      ])

      ws.send(
        JSON.stringify({
          type: 'detection.appeared',
          detectionId,
          itemId,
          brand,
          product,
          coinDelta: top.healthScore,
          emoji: emojiFor(top.category),
          bbox: top.bbox,
          anchor,
          verdict,
        }),
      )
      logger.info(
        { sessionId: state.sessionId, detectionId, name: top.name, score: top.healthScore },
        'detection.appeared',
      )

      const abort = new AbortController()
      state.active.set(itemId, { detectionId, itemId, voiceAbort: abort })

      // Cooldown gate: don't speak again about the same item for 30s.
      const last = state.lastSpokeAt[itemId] ?? 0
      if (env.VOICE_ENABLED && Date.now() - last >= COOLDOWN_MS) {
        state.lastSpokeAt[itemId] = Date.now()
        state.reactions += 1
        speakReaction(ws, detectionId, palCtx, abort).catch((err) =>
          logger.error({ err: String(err), detectionId }, 'voice.crashed'),
        )
      } else if (!env.VOICE_ENABLED) {
        logger.info({ detectionId, item: top.name }, 'voice.disabled_skipped')
      }
    } else if (state.active.has(itemId)) {
      // Already active — update anchor position.
      const det = state.active.get(itemId)!
      const top = candidate.latest
      const [bx, by, bw, bh] = top.bbox
      ws.send(
        JSON.stringify({
          type: 'detection.updated',
          detectionId: det.detectionId,
          anchor: [bx + bw / 2, by + bh / 2],
        }),
      )
    }
  }

  // ── Clear stale detections ─────────────────────────────────────────
  for (const [itemId, candidate] of state.candidates) {
    if (candidate.misses >= MISSES_TO_CLEAR) {
      const det = state.active.get(itemId)
      if (det) {
        ws.send(JSON.stringify({ type: 'detection.cleared', detectionId: det.detectionId }))
        det.voiceAbort?.abort()
        state.active.delete(itemId)
      }
      state.candidates.delete(itemId)
    }
  }
}


export function interrupt(ws: WebSocket) {
  const state = sessions.get(ws)
  if (!state) return
  for (const det of state.active.values()) {
    det.voiceAbort?.abort()
  }
}
