import type { WebSocket } from 'ws'
import { logger } from '../logger'

/**
 * Per-connection live session state.
 * v1 lives in-process (ALB stickiness ON). v1.1+: move to Redis.
 *   TODO(scale): replace in-process Map with Redis when desired-count > 1.
 */
export type SessionState = {
  sessionId: string
  kidId: string
  current: { itemId: string; hits: number; misses: number } | null
  active: { detectionId: string; itemId: string } | null
  lastSpokeAt: Record<string, number> // itemId -> ms epoch
  framesSent: number
  detections: number
  reactions: number
}

const sessions = new Map<WebSocket, SessionState>()

export function onConnect(ws: WebSocket, kidId: string) {
  const sessionId = crypto.randomUUID()
  const state: SessionState = {
    sessionId,
    kidId,
    current: null,
    active: null,
    lastSpokeAt: {},
    framesSent: 0,
    detections: 0,
    reactions: 0,
  }
  sessions.set(ws, state)
  ws.send(JSON.stringify({ type: 'session.started', sessionId }))
  logger.info({ sessionId, kidId }, 'ws.connected')
}

export function onMessage(_ws: WebSocket, _data: Buffer) {
  // TODO(day-7): decode tag → frame path; JSON → control path (interrupt, session.end).
}

export function onClose(ws: WebSocket) {
  const state = sessions.get(ws)
  sessions.delete(ws)
  if (state) logger.info({ sessionId: state.sessionId }, 'ws.closed')
}
