import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WsServerMessage } from '@brainpal/shared'
import { connectLive, type LiveSocket } from '../lib/ws'
import { captureJpeg, startCamera, type CameraHandle } from '../lib/camera'
import { SpeechPlayer } from '../lib/audio'
import { audSigned } from '../lib/format'
import { useAuthStore } from '../stores/auth'
import { useCartStore } from '../stores/cart'

const FRAME_INTERVAL_MS = 700
const FRAME_MAX_WIDTH = 384

type TrafficLight = 'green' | 'amber' | 'red'

type Verdict = {
  trafficLight: TrafficLight
  ingredientsSummary: string
  whyBad?: string
  whyGood?: string
  healthContext: string
  estimatedPrice?: string
}

type Detection = {
  detectionId: string
  brand: string
  product: string
  coinDelta: number
  emoji: string
  anchor: [number, number]
  verdict?: Verdict
}

const TL: Record<TrafficLight, { ring: string; label: string }> = {
  green: { ring: '#3ddc84', label: '🟢 Good choice' },
  amber: { ring: '#ffb627', label: '🟡 Okay' },
  red: { ring: '#ff5c5c', label: '🔴 Think twice' },
}

export function LiveCamera() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const cartIncrement = useCartStore((s) => s.increment)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sockRef = useRef<LiveSocket | null>(null)
  const cameraRef = useRef<CameraHandle | null>(null)
  const playerRef = useRef<SpeechPlayer>(new SpeechPlayer())
  const playingRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const cancelledRef = useRef(false)

  const [started, setStarted] = useState(false)
  const [connected, setConnected] = useState(false)
  const [framesSent, setFramesSent] = useState(0)
  const [detections, setDetections] = useState<Map<string, Detection>>(new Map())
  const [palLines, setPalLines] = useState<Map<string, string>>(new Map())
  const [activeSheet, setActiveSheet] = useState<Detection | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleJson(msg: WsServerMessage) {
    switch (msg.type) {
      case 'detection.appeared': {
        const det: Detection = {
          detectionId: msg.detectionId,
          brand: msg.brand,
          product: msg.product,
          coinDelta: msg.coinDelta,
          emoji: msg.emoji,
          anchor: msg.anchor,
          verdict: msg.verdict,
        }
        setDetections((prev) => new Map(prev).set(det.detectionId, det))
        break
      }
      case 'detection.updated':
        setDetections((prev) => {
          const det = prev.get(msg.detectionId)
          if (!det) return prev
          return new Map(prev).set(msg.detectionId, { ...det, anchor: msg.anchor })
        })
        break
      case 'detection.cleared':
        setDetections((prev) => {
          const next = new Map(prev)
          next.delete(msg.detectionId)
          return next
        })
        setActiveSheet((s) => (s?.detectionId === msg.detectionId ? null : s))
        break
      case 'speech.started':
        playingRef.current = msg.detectionId
        playerRef.current.start(msg.detectionId)
        break
      case 'speech.ended':
        if (msg.text) setPalLines((prev) => new Map(prev).set(msg.detectionId, msg.text as string))
        playerRef.current.play(msg.detectionId)
        break
      case 'error':
        setError(msg.message)
        break
    }
  }

  // Start camera + socket — must follow a user tap (camera/audio gesture rule).
  async function begin() {
    setError(null)
    const video = videoRef.current
    if (!video) return
    try {
      cameraRef.current = await startCamera(video)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Camera permission denied')
      return
    }
    setStarted(true)
    sockRef.current = connectLive(
      {
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
        onError: () => setConnected(false),
        onJson: handleJson,
        onAudioChunk: (_seq, mp3) => {
          const id = playingRef.current
          if (id) playerRef.current.push(id, mp3)
        },
      },
      token,
    )
  }

  // Frame capture loop.
  useEffect(() => {
    if (!started) return
    cancelledRef.current = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (cancelledRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!inFlightRef.current && video && canvas && sockRef.current?.isOpen()) {
        inFlightRef.current = true
        try {
          const bytes = await captureJpeg(video, canvas, FRAME_MAX_WIDTH)
          if (bytes) {
            sockRef.current.sendFrame(bytes)
            setFramesSent((n) => n + 1)
          }
        } finally {
          inFlightRef.current = false
        }
      }
      timer = setTimeout(tick, FRAME_INTERVAL_MS)
    }
    timer = setTimeout(tick, 400)
    return () => {
      cancelledRef.current = true
      if (timer) clearTimeout(timer)
    }
  }, [started])

  // Teardown on unmount.
  useEffect(() => {
    const player = playerRef.current
    return () => {
      cancelledRef.current = true
      sockRef.current?.close()
      cameraRef.current?.stop()
      player.reset()
    }
  }, [])

  function addToCart() {
    cartIncrement(1)
    setActiveSheet(null)
    sockRef.current?.sendInterrupt('item_changed')
  }

  const detectionList = [...detections.values()]

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Camera preview */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Detection chips anchored to normalized positions */}
      {detectionList.map((det) => {
        const tl = det.verdict ? TL[det.verdict.trafficLight] : null
        return (
          <button
            key={det.detectionId}
            onClick={() => setActiveSheet(det)}
            style={{
              left: `${det.anchor[0] * 100}%`,
              top: `${det.anchor[1] * 100}%`,
              borderColor: tl?.ring ?? '#ffffff',
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-black/70 px-3 py-2 text-sm font-semibold text-white backdrop-blur"
          >
            <span className="mr-1">{det.emoji}</span>
            {det.product || det.brand || 'Item'}
            <span className="ml-2 text-accent">
              {audSigned(det.coinDelta)}
            </span>
          </button>
        )
      })}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
        >
          ← Back
        </button>
        <div className="rounded-full bg-black/60 px-3 py-2 text-xs text-white backdrop-blur">
          {started ? (connected ? `● live · ${framesSent} frames` : '○ connecting…') : 'idle'}
        </div>
      </div>

      {/* Start overlay (camera + audio need a user gesture) */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/80 p-8 text-center">
          <div className="text-2xl font-extrabold text-white">Point at a product</div>
          <p className="max-w-xs text-sm text-white/70">
            We'll ask your camera for permission, then stream frames to PAL for a live verdict.
          </p>
          <button
            onClick={begin}
            className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-black active:scale-[0.98]"
          >
            Start scanning
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {/* Verdict sheet */}
      {activeSheet && (
        <VerdictSheet
          detection={activeSheet}
          palLine={palLines.get(activeSheet.detectionId)}
          onClose={() => setActiveSheet(null)}
          onAdd={addToCart}
        />
      )}
    </div>
  )
}

function VerdictSheet({
  detection,
  palLine,
  onClose,
  onAdd,
}: {
  detection: Detection
  palLine?: string
  onClose: () => void
  onAdd: () => void
}) {
  const v = detection.verdict
  const tl = v ? TL[v.trafficLight] : null

  return (
    <div className="absolute inset-0 z-10 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[80%] w-full overflow-y-auto rounded-t-3xl bg-surface p-5"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface2" />

        <div
          className="mb-3 flex items-center gap-3 rounded-2xl p-4"
          style={{ backgroundColor: tl ? `${tl.ring}1a` : undefined }}
        >
          <span className="text-4xl">{detection.emoji}</span>
          <div className="flex-1">
            {tl && (
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: tl.ring }}>
                {tl.label}
              </div>
            )}
            <div className="text-base font-bold text-ink">
              {[detection.brand, detection.product].filter(Boolean).join(' · ') || 'Item'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-accent">
              {audSigned(detection.coinDelta)}
            </div>
            <div className="text-[10px] uppercase text-muted">reward</div>
          </div>
        </div>

        {palLine && (
          <div className="mb-3 rounded-2xl bg-surface2 p-4 text-sm italic text-ink">"{palLine}"</div>
        )}

        {v?.estimatedPrice && <Row icon="💰" label="Estimated price" value={v.estimatedPrice} />}
        {v?.ingredientsSummary && <Row icon="🔬" label="What's in it" value={v.ingredientsSummary} />}
        {v?.whyBad && <Row icon="⚠️" label="Why it's not great" value={v.whyBad} tone="bad" />}
        {v?.whyGood && <Row icon="✅" label="Why it's a good pick" value={v.whyGood} tone="good" />}
        {v?.healthContext && <Row icon="🧬" label="For you specifically" value={v.healthContext} />}

        <div className="mt-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-surface2 py-4 font-bold text-ink active:scale-[0.98]"
          >
            Skip it {audSigned(2)}
          </button>
          <button
            onClick={onAdd}
            className="flex-1 rounded-full bg-accent py-4 font-bold text-black active:scale-[0.98]"
          >
            Add to cart {audSigned(detection.coinDelta)}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon: string
  label: string
  value: string
  tone?: 'good' | 'bad'
}) {
  const bg = tone === 'bad' ? 'bg-danger/10' : tone === 'good' ? 'bg-accent/10' : 'bg-surface2'
  return (
    <div className={`mb-2 flex items-start gap-3 rounded-2xl ${bg} p-3`}>
      <span className="w-7 text-center text-lg">{icon}</span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="text-sm leading-5 text-ink">{value}</div>
      </div>
    </div>
  )
}
