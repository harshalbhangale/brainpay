import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { connectLiveRt, type LiveRtSocket, type LiveDetection } from '../lib/liveRt'
import { startCamera, captureJpeg, type CameraHandle } from '../lib/camera'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../lib/liveAudio'
import { avatarSrc, useAvatar } from '../lib/avatar'
import { Apple, Wallet, CheckCircle2, AlertCircle, XCircle, ShoppingBag, ZoomIn, ZoomOut, ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react'
import { VrmCompanion, type CompanionMood } from './VrmCompanion'

const FRAME_INTERVAL_MS = 1000
const FRAME_MAX_WIDTH = 480
const MAX_ZOOM = 4
const COMP_W = 190
const COMP_H = 300
const POS_KEY = 'brainpal.companionPos'

type Phase = 'connecting' | 'live' | 'error' | 'no_permission'
type Line = { id: number; role: 'you' | 'mika'; text: string }

let lineId = 1

export function LiveSession({ withCamera, onClose }: { withCamera: boolean; onClose: () => void }) {
  const account = useAuthStore((s) => s.account)
  const role: 'parent' | 'kid' = account?.accountType === 'kid' ? 'kid' : 'parent'
  const avatar = useAvatar((s) => s.avatar)

  const [phase, setPhase] = useState<Phase>('connecting')
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detections, setDetections] = useState<LiveDetection[]>([])
  const [transcript, setTranscript] = useState<Line[]>([])
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [zoom, setZoom] = useState(1)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sockRef = useRef<LiveRtSocket | null>(null)
  const cameraRef = useRef<CameraHandle | null>(null)
  const micRef = useRef<MicCaptureHandle | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const micOnRef = useRef(true)
  const speakerOnRef = useRef(true)
  const replyBufRef = useRef('')
  const pendingUserRef = useRef('')
  const cancelledRef = useRef(false)
  const inFlightRef = useRef(false)
  const zoomRef = useRef(1)

  // ── Draggable companion position ────────────────────────────────────
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {
      /* ignore */
    }
    const w = typeof window !== 'undefined' ? window.innerWidth : 390
    const h = typeof window !== 'undefined' ? window.innerHeight : 780
    return { x: (w - COMP_W) / 2, y: h - COMP_H - 150 }
  })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  function onDragStart(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const x = Math.max(0, Math.min(window.innerWidth - COMP_W, e.clientX - dragRef.current.dx))
    const y = Math.max(60, Math.min(window.innerHeight - 120, e.clientY - dragRef.current.dy))
    setPos({ x, y })
  }
  function onDragEnd() {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }

  // ── Connect on mount ────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false
    async function begin() {
      const token = useAuthStore.getState().token
      const player = new PcmPlayer()
      playerRef.current = player
      await player.resume()

      if (withCamera && videoRef.current) {
        try {
          cameraRef.current = await startCamera(videoRef.current)
        } catch {
          setError('Camera access was blocked. Allow camera access and try again.')
          setPhase('no_permission')
          return
        }
      }
      try {
        micRef.current = await startMicCapture((pcm) => {
          if (micOnRef.current && sockRef.current?.isOpen()) sockRef.current.sendMicPcm(pcm)
        })
      } catch {
        setError('Microphone access was blocked. Allow mic access and try again.')
        setPhase('no_permission')
        return
      }
      if (disposed) return

      const sock = connectLiveRt(
        {
          onOpen: () => {
            sock.start(role, 'assist')
            setPhase('live')
          },
          onUserTranscript: (t) => {
            setUserLine(t)
            pendingUserRef.current = t
          },
          onReplyDelta: (t) => {
            replyBufRef.current += t
            setPalLine(replyBufRef.current)
            setSpeaking(true)
          },
          onTurnComplete: () => {
            const u = pendingUserRef.current.trim()
            const r = replyBufRef.current.trim()
            if (u || r) {
              setTranscript((prev) =>
                [
                  ...prev,
                  ...(u ? [{ id: lineId++, role: 'you' as const, text: u }] : []),
                  ...(r ? [{ id: lineId++, role: 'mika' as const, text: r }] : []),
                ].slice(-60),
              )
            }
            pendingUserRef.current = ''
            replyBufRef.current = ''
            setUserLine('')
            setSpeaking(false)
          },
          onInterrupted: () => {
            playerRef.current?.clear()
            setSpeaking(false)
          },
          onPalAudio: (pcm) => {
            if (speakerOnRef.current) playerRef.current?.enqueue(pcm)
          },
          onPalAudioMp3: (mp3) => {
            if (speakerOnRef.current) void playerRef.current?.enqueueEncoded(mp3)
          },
          onDetection: (d) => {
            setDetections((prev) => {
              // Keep distinct items (by name); refresh existing, cap at 5.
              const rest = prev.filter((p) => p.name.toLowerCase() !== d.name.toLowerCase())
              return [...rest, d].slice(-5)
            })
          },
          onError: (m) => {
            setError(m)
            setPhase('error')
          },
        },
        token,
      )
      sockRef.current = sock
    }
    void begin()
    return () => {
      disposed = true
      cancelledRef.current = true
      try { sockRef.current?.end() } catch { /* ignore */ }
      try { sockRef.current?.close() } catch { /* ignore */ }
      micRef.current?.stop()
      cameraRef.current?.stop()
      playerRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Camera frame loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!withCamera || phase !== 'live') return
    cancelledRef.current = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (cancelledRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!inFlightRef.current && video && canvas && sockRef.current?.isOpen()) {
        inFlightRef.current = true
        try {
          const bytes = await captureJpeg(video, canvas, FRAME_MAX_WIDTH, 0.6, zoomRef.current)
          if (bytes) sockRef.current.sendFrame(bytes)
        } finally {
          inFlightRef.current = false
        }
      }
      timer = setTimeout(tick, FRAME_INTERVAL_MS)
    }
    timer = setTimeout(tick, 500)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [withCamera, phase])

  function changeZoom(delta: number) {
    setZoom((z) => {
      const next = Math.max(1, Math.min(MAX_ZOOM, Math.round((z + delta) * 2) / 2))
      zoomRef.current = next
      return next
    })
  }

  function toggleMic() {
    setMicOn((on) => {
      const next = !on
      micOnRef.current = next
      sockRef.current?.setMic(next)
      return next
    })
  }
  function toggleSpeaker() {
    setSpeakerOn((on) => {
      const next = !on
      speakerOnRef.current = next
      sockRef.current?.setSpeaker(next)
      if (!next) playerRef.current?.clear()
      return next
    })
  }

  const statusLabel =
    phase === 'live' ? 'LIVE' : phase === 'connecting' ? 'CONNECTING…' : phase === 'error' ? 'RECONNECT' : 'BLOCKED'
  const title = withCamera ? 'Point & Ask' : 'Talk to Mika'
  const hint = withCamera ? 'Point at anything and ask…' : 'Say something — Mika is listening…'

  const lastDet = detections[detections.length - 1]
  const companionMood: CompanionMood = lastDet
    ? lastDet.verdict === 'great'
      ? 'happy'
      : lastDet.verdict === 'avoid'
        ? 'sad'
        : 'surprised'
    : speaking
      ? 'happy'
      : 'neutral'

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-ink">
      {/* Background */}
      {withCamera ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#06100d] to-[#0b0b0f]" />
      )}

      {/* Draggable companion */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        className="absolute z-20 touch-none select-none"
        style={{ left: pos.x, top: pos.y, width: COMP_W, height: COMP_H, cursor: 'grab' }}
      >
        <VrmCompanion
          src={avatarSrc(avatar)}
          getLevel={() => playerRef.current?.getLevel() ?? 0}
          mood={companionMood}
          className="h-full w-full"
        />
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5 text-white/70 backdrop-blur">
          <GripHorizontal size={14} />
        </div>
      </div>

      {/* Top bar */}
      <div className="relative z-30 flex items-center gap-3 p-4">
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold tracking-wide backdrop-blur ${
            phase === 'live' ? 'bg-accent text-on-accent' : 'bg-black/60 text-ink'
          }`}
        >
          {phase === 'live' && <span className="h-2 w-2 rounded-full bg-black" />}
          {statusLabel}
        </div>
        <div className="font-bold drop-shadow">{title}</div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-ink backdrop-blur active:scale-95"
        >
          <IconX />
        </button>
      </div>

      {/* Zoom control (camera only) */}
      {withCamera && (
        <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-black/50 p-1.5 backdrop-blur">
          <button onClick={() => changeZoom(0.5)} className="flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90" aria-label="Zoom in">
            <ZoomIn size={18} />
          </button>
          <span className="text-[10px] font-bold text-white/80">{zoom.toFixed(1)}×</span>
          <button onClick={() => changeZoom(-0.5)} className="flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90" aria-label="Zoom out">
            <ZoomOut size={18} />
          </button>
        </div>
      )}

      {/* Verdict popups (multiple items) — top-left column */}
      {withCamera && detections.length > 0 && (
        <div className="absolute left-3 right-16 top-20 z-20 flex max-h-[40%] flex-col gap-2 overflow-y-auto">
          {detections.map((d) => (
            <VerdictPopup key={d.detectionId} d={d} />
          ))}
        </div>
      )}

      {/* Permission / error */}
      {(phase === 'no_permission' || phase === 'error') && (
        <div className="relative z-30 mx-auto mt-6 max-w-xs rounded-2xl bg-surface/90 p-4 text-center backdrop-blur">
          <div className="text-sm text-ink">{error ?? 'Something went wrong.'}</div>
          <button onClick={onClose} className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-bold text-on-accent active:scale-95">
            Close
          </button>
        </div>
      )}

      <div className="flex-1" />

      {/* Transcript */}
      <div className="relative z-30 px-4 pb-2">
        {transcriptOpen ? (
          <div className="mb-2 max-h-[45vh] overflow-y-auto rounded-2xl bg-black/70 p-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-white/70">Transcript</span>
              <button onClick={() => setTranscriptOpen(false)} className="flex items-center gap-1 text-xs text-white/70">
                Collapse <ChevronDown size={14} />
              </button>
            </div>
            {transcript.length === 0 ? (
              <div className="py-4 text-center text-xs text-white/50">No conversation yet.</div>
            ) : (
              <div className="space-y-2">
                {transcript.map((l) => (
                  <div key={l.id} className={l.role === 'you' ? 'text-right' : ''}>
                    <span
                      className={`inline-block max-w-[88%] rounded-2xl px-3 py-1.5 text-sm ${
                        l.role === 'you' ? 'bg-white/15 text-ink' : 'border border-accent/40 bg-black/50 italic text-ink'
                      }`}
                    >
                      {l.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {userLine && (
              <div className="ml-auto max-w-[85%] rounded-2xl bg-white/15 px-3.5 py-2 text-sm text-ink backdrop-blur">{userLine}</div>
            )}
            {palLine ? (
              <div className="flex items-end gap-2">
                <div className="max-w-[80%] rounded-2xl border border-accent/50 bg-black/65 px-3.5 py-2.5 text-[15px] italic leading-relaxed text-ink backdrop-blur">
                  {palLine}
                </div>
                <button
                  onClick={() => setTranscriptOpen(true)}
                  className="mb-1 flex shrink-0 items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur"
                >
                  <ChevronUp size={13} /> Transcript
                </button>
              </div>
            ) : (
              phase === 'live' && (
                <div className="flex items-center justify-center gap-2 text-sm text-white/70">
                  {hint}
                  {transcript.length > 0 && (
                    <button onClick={() => setTranscriptOpen(true)} className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur">
                      <ChevronUp size={13} /> Transcript
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="relative z-30 flex items-center justify-center gap-5 p-6">
        <ControlButton active={micOn} onClick={toggleMic} label={micOn ? 'Mic on' : 'Muted'}>
          {micOn ? <IconMic /> : <IconMicOff />}
        </ControlButton>
        <ControlButton active={speakerOn} onClick={toggleSpeaker} label={speakerOn ? 'Sound on' : 'Silent'}>
          {speakerOn ? <IconVolume /> : <IconVolumeOff />}
        </ControlButton>
      </div>
    </div>
  )
}

function ControlButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full backdrop-blur ${active ? 'bg-accent text-on-accent' : 'border border-white/15 bg-black/60 text-ink'}`}>
        {children}
      </span>
      <span className="text-xs font-semibold text-white/80">{label}</span>
    </button>
  )
}

const sw = { strokeWidth: 2, stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const
function IconX() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...sw}><path d="M18 6 6 18M6 6l12 12" /></svg>
}
function IconMic() {
  return <svg width="26" height="26" viewBox="0 0 24 24" {...sw}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
}
function IconMicOff() {
  return <svg width="26" height="26" viewBox="0 0 24 24" {...sw}><path d="m2 2 20 20M9 9v1a3 3 0 0 0 5 2M15 9.3V5a3 3 0 0 0-5.7-1.3M5 10a7 7 0 0 0 10.7 6M19 10a7 7 0 0 1-.1 1.2M12 17v4" /></svg>
}
function IconVolume() {
  return <svg width="26" height="26" viewBox="0 0 24 24" {...sw}><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
}
function IconVolumeOff() {
  return <svg width="26" height="26" viewBox="0 0 24 24" {...sw}><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" /></svg>
}

const VERDICTS = {
  great: { color: '#12b76a', label: 'Great pick', Icon: CheckCircle2 },
  okay: { color: '#f59e0b', label: 'Okay', Icon: AlertCircle },
  avoid: { color: '#ff5c5c', label: 'Think twice', Icon: XCircle },
} as const

function VerdictPopup({ d }: { d: LiveDetection }) {
  const v = VERDICTS[d.verdict] ?? VERDICTS.okay
  return (
    <div className="animate-pop-in flex items-start gap-3 rounded-2xl bg-black/70 p-3 backdrop-blur" style={{ boxShadow: `inset 0 0 0 1.5px ${v.color}66` }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${v.color}26` }}>
        <ShoppingBag size={20} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-white">{d.name}</span>
          {d.estimatedPrice && <span className="shrink-0 text-xs text-white/60">{d.estimatedPrice}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: v.color }}>
          <v.Icon size={13} /> {v.label}
        </div>
        {d.healthNote && (
          <div className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-white/80">
            <Apple size={13} className="mt-0.5 shrink-0" /> {d.healthNote}
          </div>
        )}
        {d.budgetNote && (
          <div className="mt-0.5 flex items-start gap-1.5 text-xs leading-snug text-white/80">
            <Wallet size={13} className="mt-0.5 shrink-0" /> {d.budgetNote}
          </div>
        )}
      </div>
    </div>
  )
}
