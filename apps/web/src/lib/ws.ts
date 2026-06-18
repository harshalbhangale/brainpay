import { WS_TAG_AUDIO, WS_TAG_FRAME, type WsServerMessage } from '@brainpal/shared'
import { env } from './env'

/**
 * Browser WebSocket client for the live camera session (/live).
 *
 * Wire protocol is identical to the mobile client and is defined once in
 * @brainpal/shared (the same contract the API enforces):
 *   C -> S : [0x01][JPEG bytes]
 *   S -> C : JSON text frames, or [0x02][uint32 BE seq][MP3 chunk]
 */
export type LiveHandlers = {
  onJson?: (msg: WsServerMessage) => void
  onAudioChunk?: (seq: number, mp3: Uint8Array) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: unknown) => void
}

export type LiveSocket = {
  sendFrame: (jpeg: Uint8Array) => void
  sendInterrupt: (reason: 'tap' | 'item_changed') => void
  end: () => void
  close: () => void
  isOpen: () => boolean
}

export function connectLive(handlers: LiveHandlers, token?: string | null): LiveSocket {
  // Browsers can't set WS headers, so the token rides as a query param.
  // The /live endpoint currently ignores it (open during the demo).
  const url = token ? `${env.wsUrl}?token=${encodeURIComponent(token)}` : env.wsUrl
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => handlers.onOpen?.()
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = (e) => handlers.onError?.(e)

  ws.onmessage = (e) => {
    const data = e.data
    if (typeof data === 'string') {
      try {
        handlers.onJson?.(JSON.parse(data) as WsServerMessage)
      } catch {
        // ignore malformed JSON
      }
      return
    }
    const view = new Uint8Array(data as ArrayBuffer)
    if (view.length < 5 || view[0] !== WS_TAG_AUDIO) return
    const seq = ((view[1] << 24) | (view[2] << 16) | (view[3] << 8) | view[4]) >>> 0
    handlers.onAudioChunk?.(seq, view.slice(5))
  }

  return {
    sendFrame: (jpeg) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const out = new Uint8Array(1 + jpeg.length)
      out[0] = WS_TAG_FRAME
      out.set(jpeg, 1)
      ws.send(out.buffer)
    },
    sendInterrupt: (reason) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'interrupt', reason }))
    },
    end: () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'session.end' }))
    },
    close: () => ws.close(),
    isOpen: () => ws.readyState === WebSocket.OPEN,
  }
}
