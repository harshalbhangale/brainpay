import type { WebSocket } from 'ws'
import { logger } from '../logger'
import { decodeFrame } from './framing'
import { dropSession, interrupt, newSession, onFrame } from './perception'

/**
 * Per-connection WS handler.
 * Auth is intentionally OFF in prototype mode — see index.ts.
 */

export function onConnect(ws: WebSocket) {
  const state = newSession(ws)
  ws.send(JSON.stringify({ type: 'session.started', sessionId: state.sessionId }))
  logger.info({ sessionId: state.sessionId }, 'ws.connected')
}

export function onMessage(ws: WebSocket, data: Buffer) {
  // Binary tag dispatch.
  if (data.length > 0 && data[0] === 0x01) {
    const jpeg = decodeFrame(new Uint8Array(data))
    if (jpeg) {
      // Fire-and-forget; perception runs concurrently with next frame's arrival.
      onFrame(ws, jpeg).catch((err) => logger.error({ err: String(err) }, 'frame.handler_failed'))
    }
    return
  }

  // JSON control path.
  try {
    const msg = JSON.parse(data.toString()) as { type?: string }
    switch (msg.type) {
      case 'interrupt':
        interrupt(ws)
        break
      case 'session.end':
        ws.close()
        break
      default:
        logger.debug({ type: msg.type }, 'ws.unknown_message')
    }
  } catch {
    logger.debug('ws.non_json_message')
  }
}

export function onClose(ws: WebSocket) {
  dropSession(ws)
  logger.info('ws.closed')
}
