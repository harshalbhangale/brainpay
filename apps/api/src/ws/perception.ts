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
 * Detailed Spec § 4.3 hysteresis: 3 hits to appear, 5 misses to clear.
 *   TODO(scale): move to Redis when desired-count > 1.
 */
export type SessionState = {
  sessionId: string
  current: { itemId: string; hits: number; misses: number; latest: PerceptionItem } | null
  active: { detectionId: string; itemId: string } | null
  lastSpokeAt: Record<string, number>
  voiceAbort: AbortController | null
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
    current: null,
    active: null,
    lastSpokeAt: {},
    voiceAbort: null,
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
  if (s?.voiceAbort) s.voiceAbort.abort()
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

/** Process one frame: call Gemini, run hysteresis, emit detection events, kick off voice. */
export async function onFrame(ws: WebSocket, jpegBytes: Uint8Array): Promise<void> {
  const state = sessions.get(ws)
  if (!state) return

  state.framesSent++
  const result = await detectItems(jpegBytes)
  const top = result.items[0]

  // Debug breadcrumb so CloudWatch shows what Gemini is seeing every frame.
  logger.info(
    {
      sessionId: state.sessionId,
      frame: state.framesSent,
      top: top ? { name: top.name, category: top.category, score: top.healthScore, conf: top.confidence } : null,
    },
    'perception.frame',
  )

  if (!top || top.confidence < CONFIDENCE_THRESHOLD) {
    bumpMiss(ws, state)
    return
  }

  const itemId = slugify(top.name)
  if (state.current?.itemId === itemId) {
    state.current.hits += 1
    state.current.misses = 0
    state.current.latest = top
  } else {
    state.current = { itemId, hits: 1, misses: 0, latest: top }
  }

  if (state.current.hits >= HITS_TO_APPEAR && state.active?.itemId !== itemId) {
    // Clear any previously-active detection so the client overlay swaps.
    if (state.active) {
      ws.send(JSON.stringify({ type: 'detection.cleared', detectionId: state.active.detectionId }))
    }
    if (state.voiceAbort) state.voiceAbort.abort()

    const detectionId = crypto.randomUUID()
    state.active = { detectionId, itemId }
    state.detections += 1

    const { brand, product } = splitBrandProduct(top.name)
    const [bx, by, bw, bh] = top.bbox
    const anchor: [number, number] = [bx + bw / 2, by + bh / 2]

    const palCtx = { name: top.name, category: top.category, healthScore: top.healthScore }

    // Fire verdict + voice in parallel — verdict enriches the detection event,
    // voice streams audio. Neither blocks the other.
    const [verdict] = await Promise.all([
      getVerdict(palCtx),
      // voice fires below after we send detection.appeared
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

    // Cooldown gate: don't speak again about the same item for 30s.
    const last = state.lastSpokeAt[itemId] ?? 0
    if (env.VOICE_ENABLED && Date.now() - last >= COOLDOWN_MS) {
      state.lastSpokeAt[itemId] = Date.now()
      state.reactions += 1
      const abort = new AbortController()
      state.voiceAbort = abort
      speakReaction(ws, detectionId, palCtx, abort).catch((err) =>
        logger.error({ err: String(err), detectionId }, 'voice.crashed'),
      )
    } else if (!env.VOICE_ENABLED) {
      logger.info({ detectionId, item: top.name }, 'voice.disabled_skipped')
    }
  } else {
    // Same item, still hits-but-not-yet-appeared OR already active: just update anchor.
    if (state.active?.itemId === itemId) {
      const [bx, by, bw, bh] = top.bbox
      ws.send(
        JSON.stringify({
          type: 'detection.updated',
          detectionId: state.active.detectionId,
          anchor: [bx + bw / 2, by + bh / 2],
        }),
      )
    }
  }
}

function bumpMiss(ws: WebSocket, state: SessionState) {
  if (!state.current) return
  state.current.misses += 1
  if (state.current.misses < MISSES_TO_CLEAR) return

  if (state.active) {
    ws.send(JSON.stringify({ type: 'detection.cleared', detectionId: state.active.detectionId }))
    if (state.voiceAbort) state.voiceAbort.abort()
    state.active = null
    state.voiceAbort = null
  }
  state.current = null
}

export function interrupt(ws: WebSocket) {
  const state = sessions.get(ws)
  if (state?.voiceAbort) state.voiceAbort.abort()
}
