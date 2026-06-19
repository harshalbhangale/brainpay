import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { Buffer } from 'buffer'
import { useAudioRecorder } from '@siteed/audio-studio'
import { env } from '@/lib/env'
import { getStoredToken } from '@/stores/auth'
import {
  configureAudioForRecording,
  requestMicPermission,
} from '@/lib/audio-mode'

/**
 * useGeminiLive — real-time camera + voice via the Vertex Gemini Live bridge.
 *
 * This is the "Grok Speak + camera" experience: the phone streams camera
 * frames + mic audio to /live-rt, and PAL streams back voice + transcript +
 * item detections (floating coin). Mic and speaker can be muted independently.
 *
 * Audio (fixed by Gemini Live):
 *   - mic out : PCM16, 16 kHz, mono → tagged [0x03]
 *   - PAL in  : PCM16, 24 kHz, mono ← tagged [0x04]
 */

const MIC_SAMPLE_RATE = 16000
const OUT_SAMPLE_RATE = 24000
const MIC_INTERVAL_MS = 120
// Flush playback once we've buffered ~0.4s of PAL audio to keep latency low.
const PLAY_FLUSH_BYTES = OUT_SAMPLE_RATE * 2 * 0.4

const TAG_FRAME = 0x01
const TAG_MIC_AUDIO = 0x03
const TAG_OUT_AUDIO = 0x04

export type LivePhase = 'idle' | 'connecting' | 'live' | 'error' | 'no_permission'

export type LiveDetection = {
  detectionId: string
  name: string
  category: string
  coinDelta: number
  emoji: string
  confidence: number
}

type Options = { role: 'parent' | 'kid'; mode?: 'shop' | 'assist' }

/** Minimal 44-byte WAV header for PCM16 mono. */
function wavFromPcm(pcm: Uint8Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  const dataLen = pcm.length
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLen, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // audio format = PCM
  header.writeUInt16LE(1, 22) // channels = mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataLen, 40)
  return Buffer.concat([header, Buffer.from(pcm)])
}

export function useGeminiLive({ role, mode = 'shop' }: Options) {
  const [phase, setPhase] = useState<LivePhase>('idle')
  const [detections, setDetections] = useState<Map<string, LiveDetection>>(new Map())
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const micOnRef = useRef(true)
  const replyBufRef = useRef('')

  // ── PAL audio playback queue ───────────────────────────────────────
  const pcmBufRef = useRef<Uint8Array[]>([])
  const pcmBytesRef = useRef(0)
  const playQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const playerRef = useRef<AudioPlayer | null>(null)

  const recorder = useAudioRecorder()

  const flushPlayback = useCallback(async () => {
    if (pcmBufRef.current.length === 0) return
    const total = pcmBytesRef.current
    const merged = new Uint8Array(total)
    let off = 0
    for (const c of pcmBufRef.current) { merged.set(c, off); off += c.length }
    pcmBufRef.current = []
    pcmBytesRef.current = 0

    const wav = wavFromPcm(merged, OUT_SAMPLE_RATE)
    const path = `${FileSystem.cacheDirectory}pal-live-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
    try {
      await FileSystem.writeAsStringAsync(path, wav.toString('base64'), {
        encoding: FileSystem.EncodingType.Base64,
      })
      playQueueRef.current.push(path)
      void drainQueue()
    } catch { /* ignore */ }
  }, [])

  const drainQueue = useCallback(async () => {
    if (playingRef.current) return
    const next = playQueueRef.current.shift()
    if (!next) return
    playingRef.current = true
    try {
      if (playerRef.current) { try { playerRef.current.remove() } catch {} }
      const player = createAudioPlayer({ uri: next })
      playerRef.current = player
      player.play()
      const sub = player.addListener('playbackStatusUpdate', (st) => {
        if (st?.didJustFinish) {
          sub.remove()
          try { player.remove() } catch {}
          if (playerRef.current === player) playerRef.current = null
          FileSystem.deleteAsync(next, { idempotent: true }).catch(() => undefined)
          playingRef.current = false
          void drainQueue()
        }
      })
    } catch {
      playingRef.current = false
      void drainQueue()
    }
  }, [])

  const clearPlayback = useCallback(() => {
    pcmBufRef.current = []
    pcmBytesRef.current = 0
    playQueueRef.current = []
    try { playerRef.current?.remove() } catch {}
    playerRef.current = null
    playingRef.current = false
  }, [])

  // ── Incoming WS messages ───────────────────────────────────────────
  const handleJson = useCallback((msg: any) => {
    switch (msg?.type) {
      case 'detection':
        setDetections((prev) => {
          const next = new Map(prev)
          next.set(msg.detectionId, {
            detectionId: msg.detectionId,
            name: msg.name ?? 'item',
            category: msg.category ?? '',
            coinDelta: msg.coinDelta ?? 0,
            emoji: msg.emoji ?? '🛒',
            confidence: msg.confidence ?? 0,
          })
          return next
        })
        break
      case 'transcript.user':
        setUserLine(msg.text ?? '')
        break
      case 'reply.delta':
        replyBufRef.current += msg.text ?? ''
        setPalLine(replyBufRef.current)
        break
      case 'turn.complete':
        void flushPlayback()
        replyBufRef.current = ''
        break
      case 'interrupted':
        clearPlayback()
        break
      case 'error':
        setPhase('error')
        break
    }
  }, [flushPlayback, clearPlayback])

  // ── Mic streaming ──────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    await configureAudioForRecording()
    try {
      await recorder.startRecording({
        sampleRate: MIC_SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: MIC_INTERVAL_MS,
        onAudioStream: async (e) => {
          if (!micOnRef.current) return
          const ws = wsRef.current
          if (!ws || ws.readyState !== WebSocket.OPEN) return
          // data is base64 (string) for pcm_16bit raw output; handle typed arrays too.
          let pcm: Uint8Array
          if (typeof e.data === 'string') {
            pcm = Uint8Array.from(Buffer.from(e.data, 'base64'))
          } else {
            const ta = e.data as Int16Array | Float32Array
            pcm = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)
          }
          const out = new Uint8Array(1 + pcm.length)
          out[0] = TAG_MIC_AUDIO
          out.set(pcm, 1)
          ws.send(out.buffer)
        },
      })
    } catch { /* ignore */ }
  }, [recorder])

  // ── Connect ────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!(await requestMicPermission())) { setPhase('no_permission'); return }
    setPhase('connecting')

    const token = await getStoredToken()
    const url = env.wsUrl.replace('/live', '/live-rt')
    const ws = new WebSocket(`${url}?token=${token ?? ''}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'session.start', role, mode }))
      setPhase('live')
      void startMic()
    }
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const view = new Uint8Array(event.data)
        if (view[0] === TAG_OUT_AUDIO) {
          const pcm = view.subarray(1)
          pcmBufRef.current.push(pcm)
          pcmBytesRef.current += pcm.length
          if (pcmBytesRef.current >= PLAY_FLUSH_BYTES) void flushPlayback()
        }
        return
      }
      try { handleJson(JSON.parse(event.data as string)) } catch { /* ignore */ }
    }
    ws.onerror = () => setPhase('error')
    ws.onclose = () => setPhase((p) => (p === 'error' ? p : 'idle'))
  }, [role, mode, startMic, flushPlayback, handleJson])

  // ── Send a camera frame (JPEG bytes) ───────────────────────────────
  const sendFrame = useCallback((jpeg: Uint8Array) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const out = new Uint8Array(1 + jpeg.length)
    out[0] = TAG_FRAME
    out.set(jpeg, 1)
    ws.send(out.buffer)
  }, [])

  // ── Mute toggles ───────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      const next = !on
      micOnRef.current = next
      try { wsRef.current?.send(JSON.stringify({ type: 'mic', on: next })) } catch {}
      return next
    })
  }, [])

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((on) => {
      const next = !on
      try { wsRef.current?.send(JSON.stringify({ type: 'speaker', on: next })) } catch {}
      if (!next) clearPlayback()
      return next
    })
  }, [clearPlayback])

  const stop = useCallback(async () => {
    try { await recorder.stopRecording() } catch { /* ignore */ }
    try { wsRef.current?.send(JSON.stringify({ type: 'session.end' })) } catch {}
    try { wsRef.current?.close() } catch {}
    wsRef.current = null
    clearPlayback()
    setPhase('idle')
  }, [recorder, clearPlayback])

  useEffect(() => () => { void stop() }, [stop])

  return {
    phase,
    detections: Array.from(detections.values()),
    palLine,
    userLine,
    micOn,
    speakerOn,
    connect,
    stop,
    sendFrame,
    toggleMic,
    toggleSpeaker,
  }
}
