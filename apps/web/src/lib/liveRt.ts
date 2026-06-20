import { env } from './env'

/**
 * Browser client for the Gemini Live bridge (/live-rt).
 *
 * This is the "point the camera at anything and talk to PAL" experience: the
 * browser streams camera frames + mic audio up, and PAL streams voice +
 * transcripts back down.
 *
 * Wire protocol (matches apps/api/src/ws/gemini-live-bridge.ts):
 *   C → S : { type: 'session.start', role, mode }
 *           [0x01][JPEG bytes]    — camera frame
 *           [0x03][PCM16 16k]     — mic audio chunk
 *           { type: 'mic', on }   { type: 'speaker', on }
 *           { type: 'interrupt' } { type: 'session.end' }
 *   S → C : { type: 'session.connected' }
 *           { type: 'transcript.user', text }
 *           { type: 'reply.delta', text }
 *           { type: 'turn.complete' } | { type: 'interrupted' }
 *           { type: 'detection', ... }  { type: 'error', message }
 *           [0x04][PCM16 24k]     — PAL audio chunk
 */

const TAG_FRAME = 0x01
const TAG_MIC_AUDIO = 0x03
const TAG_OUT_AUDIO = 0x04
const TAG_OUT_MP3 = 0x05

export type LiveRole = 'parent' | 'kid'
export type LiveMode = 'assist' | 'shop'

export type LiveDetection = {
  detectionId: string
  name: string
  category: string
  verdict: 'great' | 'okay' | 'avoid'
  healthNote: string
  budgetNote: string
  estimatedPrice: string
  emoji: string
  coinDelta: number
  confidence: number
}

export type LiveRtHandlers = {
  onOpen?: () => void
  onConnected?: () => void
  onUserTranscript?: (text: string) => void
  onReplyDelta?: (text: string) => void
  onTurnComplete?: () => void
  onInterrupted?: () => void
  onPalAudio?: (pcm: Int16Array) => void
  onPalAudioMp3?: (mp3: ArrayBuffer) => void
  onDetection?: (d: LiveDetection) => void
  onError?: (message: string) => void
  onClose?: () => void
}

export type LiveRtSocket = {
  start: (role: LiveRole, mode: LiveMode) => void
  sendFrame: (jpeg: Uint8Array) => void
  sendMicPcm: (pcm: Int16Array) => void
  setMic: (on: boolean) => void
  setSpeaker: (on: boolean) => void
  interrupt: () => void
  end: () => void
  close: () => void
  isOpen: () => boolean
}

export function connectLiveRt(handlers: LiveRtHandlers, token?: string | null): LiveRtSocket {
  // The /live-rt bridge lives next to /live on the same host.
  const base = env.wsUrl.replace('/live', '/live-rt')
  const url = token ? `${base}?token=${encodeURIComponent(token)}` : base

  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => handlers.onOpen?.()
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = () => handlers.onError?.('Connection error')

  ws.onmessage = (e) => {
    const data = e.data
    if (data instanceof ArrayBuffer) {
      const view = new Uint8Array(data)
      if (view.length > 1 && view[0] === TAG_OUT_AUDIO) {
        // Copy past the tag byte so the Int16 view is 2-byte aligned.
        const payload = view.slice(1)
        const pcm = new Int16Array(payload.buffer, 0, payload.byteLength >> 1)
        handlers.onPalAudio?.(pcm)
      } else if (view.length > 1 && view[0] === TAG_OUT_MP3) {
        // ElevenLabs MP3 for one sentence — hand the raw bytes to the player.
        handlers.onPalAudioMp3?.(view.slice(1).buffer)
      }
      return
    }

    let msg: { type?: string; [k: string]: unknown }
    try {
      msg = JSON.parse(data as string)
    } catch {
      return
    }

    switch (msg.type) {
      case 'session.connected':
        handlers.onConnected?.()
        break
      case 'transcript.user':
        handlers.onUserTranscript?.((msg.text as string) ?? '')
        break
      case 'reply.delta':
        handlers.onReplyDelta?.((msg.text as string) ?? '')
        break
      case 'turn.complete':
        handlers.onTurnComplete?.()
        break
      case 'interrupted':
        handlers.onInterrupted?.()
        break
      case 'detection':
        handlers.onDetection?.(msg as unknown as LiveDetection)
        break
      case 'error':
        handlers.onError?.((msg.message as string) ?? 'Live session error')
        break
    }
  }

  const sendJson = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }

  return {
    start: (role, mode) => sendJson({ type: 'session.start', role, mode }),
    sendFrame: (jpeg) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const out = new Uint8Array(1 + jpeg.length)
      out[0] = TAG_FRAME
      out.set(jpeg, 1)
      ws.send(out.buffer)
    },
    sendMicPcm: (pcm) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
      const out = new Uint8Array(1 + bytes.length)
      out[0] = TAG_MIC_AUDIO
      out.set(bytes, 1)
      ws.send(out.buffer)
    },
    setMic: (on) => sendJson({ type: 'mic', on }),
    setSpeaker: (on) => sendJson({ type: 'speaker', on }),
    interrupt: () => sendJson({ type: 'interrupt' }),
    end: () => sendJson({ type: 'session.end' }),
    close: () => ws.close(),
    isOpen: () => ws.readyState === WebSocket.OPEN,
  }
}
