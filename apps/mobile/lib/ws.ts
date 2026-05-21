import { env } from './env'

/**
 * Prototype WS client — no auth token (server is open while we demo).
 *
 * Usage:
 *   const sock = connectLive({
 *     onJson: (msg) => ...,
 *     onAudioChunk: (seq, mp3) => ...,
 *     onOpen / onClose / onError,
 *   })
 *   sock.sendFrame(jpegBytes)
 *   sock.sendInterrupt('tap')
 *   sock.close()
 */

export type LiveHandlers = {
  onJson?: (msg: any) => void
  onAudioChunk?: (seq: number, mp3: Uint8Array) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: unknown) => void
}

export type LiveSocket = {
  sendFrame: (jpeg: Uint8Array) => void
  sendInterrupt: (reason: 'tap' | 'item_changed') => void
  close: () => void
  isOpen: () => boolean
}

export function connectLive(handlers: LiveHandlers): LiveSocket {
  const ws = new WebSocket(env.wsUrl)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => handlers.onOpen?.()
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = (e) => handlers.onError?.(e)

  ws.onmessage = (e) => {
    const data = e.data
    if (typeof data === 'string') {
      try {
        handlers.onJson?.(JSON.parse(data))
      } catch {
        // ignore
      }
      return
    }
    // Binary: [tag][...] — 0x02 = audio chunk, [seq u32 BE][mp3]
    const view = new Uint8Array(data as ArrayBuffer)
    if (view.length < 5) return
    const tag = view[0]
    if (tag !== 0x02) return
    const seq = (view[1] << 24) | (view[2] << 16) | (view[3] << 8) | view[4]
    handlers.onAudioChunk?.(seq, view.slice(5))
  }

  return {
    sendFrame: (jpeg: Uint8Array) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const out = new Uint8Array(1 + jpeg.length)
      out[0] = 0x01
      out.set(jpeg, 1)
      ws.send(out.buffer)
    },
    sendInterrupt: (reason) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'interrupt', reason }))
    },
    close: () => ws.close(),
    isOpen: () => ws.readyState === WebSocket.OPEN,
  }
}
