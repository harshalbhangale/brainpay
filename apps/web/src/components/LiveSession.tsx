import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { connectLiveRt, type LiveRtSocket, type LiveDetection } from '../lib/liveRt'
import { startCamera, captureJpeg, type CameraHandle } from '../lib/camera'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../lib/liveAudio'
import { Sparkles, Apple, Wallet, CheckCircle2, AlertCircle, XCircle, ShoppingBag } from 'lucide-react'

const FRAME_INTERVAL_MS = 1000
const FRAME_MAX_WIDTH = 480

type Phase = 'connecting' | 'live' | 'error' | 'no_permission'

/**
 * LiveSession — full-screen real-time PAL overlay for the web chat.
 *
 * `withCamera` true  → "point at anything and ask" (camera frames + voice)
 * `withCamera` false → voice-only conversation (animated orb)
 *
 * Streams camera JPEG + mic PCM16 16k to /live-rt and plays back PAL's
 * PCM16 24k voice, with live captions and mic/speaker toggles.
 */
export function LiveSession({ withCamera, onClose }: { withCamera: boolean; onClose: () => void }) {
  const account = useAuthStore((s) => s.account)
  const role: 'parent' | 'kid' = account?.accountType === 'kid' ? 'kid' : 'parent'

  const [phase, setPhase] = useState<Phase>('connecting')
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detections, setDetections] = useState<LiveDetection[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sockRef = useRef<LiveRtSocket | null>(null)
  const cameraRef = useRef<CameraHandle | null>(null)
  const micRef = useRef<MicCaptureHandle | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const micOnRef = useRef(true)
  const speakerOnRef = useRef(true)
  const replyBufRef = useRef('')
  const cancelledRef = useRef(false)
  const inFlightRef = useRef(false)

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
          onUserTranscript: (t) => setUserLine(t),
          onReplyDelta: (t) => {
            replyBufRef.current += t
            setPalLine(replyBufRef.current)
            setSpeaking(true)
          },
          onTurnComplete: () => {
            replyBufRef.current = ''
            setSpeaking(false)
          },
          onInterrupted: () => {
            playerRef.current?.clear()
            setSpeaking(false)
          },
          onPalAudio: (pcm) => {
            if (speakerOnRef.current) playerRef.current?.enqueue(pcm)
          },
          onDetection: (d) => {
            setDetections((prev) => {
              // de-dupe by product name; newest wins, keep last 3
              const rest = prev.filter((p) => p.name.toLowerCase() !== d.name.toLowerCase())
              return [...rest, d].slice(-3)
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
          const bytes = await captureJpeg(video, canvas, FRAME_MAX_WIDTH)
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
  const title = withCamera ? 'Point & Ask' : 'Talk to PAL'
  const hint = withCamera ? 'Point at anything and ask PAL about it…' : 'Say something — PAL is listening…'

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-ink">
      {/* Background: camera feed or voice orb */}
      {withCamera ? (
        <>
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#06100d] to-[#0b0b0f]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <div
                className={`absolute h-60 w-60 rounded-full bg-accent/20 ${speaking ? 'animate-ping' : 'animate-pulse'}`}
              />
              <div className="absolute h-44 w-44 rounded-full bg-accent/10" />
              <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-[#3ddc84] to-[#16a07f] shadow-[0_0_70px_rgba(61,220,132,0.45)]">
                <Sparkles size={52} strokeWidth={2} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="relative flex items-center gap-3 p-4">
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

      {/* Permission / error state */}
      {(phase === 'no_permission' || phase === 'error') && (
        <div className="relative z-10 mx-auto mt-6 max-w-xs rounded-2xl bg-surface/90 p-4 text-center backdrop-blur">
          <div className="text-sm text-ink">{error ?? 'Something went wrong.'}</div>
          <button
            onClick={onClose}
            className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-bold text-on-accent active:scale-95"
          >
            Close
          </button>
        </div>
      )}

      <div className="flex-1" />

      {/* Health + budget verdict popups */}
      {withCamera && detections.length > 0 && (
        <div className="relative z-10 space-y-2 px-4 pb-2">
          {detections.map((d) => (
            <VerdictPopup key={d.detectionId} d={d} />
          ))}
        </div>
      )}

      {/* Captions */}
      <div className="relative z-10 space-y-2 px-5 pb-2">
        {userLine && (
          <div className="ml-auto max-w-[85%] rounded-2xl bg-white/15 px-3.5 py-2 text-sm text-ink backdrop-blur">
            {userLine}
          </div>
        )}
        {palLine ? (
          <div className="max-w-[90%] rounded-2xl border border-accent/50 bg-black/65 px-3.5 py-2.5 text-[15px] italic leading-relaxed text-ink backdrop-blur">
            {palLine}
          </div>
        ) : (
          phase === 'live' && <div className="text-center text-sm text-white/70">{hint}</div>
        )}
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center justify-center gap-5 p-6">
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

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95">
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full backdrop-blur ${
          active ? 'bg-accent text-on-accent' : 'border border-white/15 bg-black/60 text-ink'
        }`}
      >
        {children}
      </span>
      <span className="text-xs font-semibold text-white/80">{label}</span>
    </button>
  )
}

/* ── Inline icons (no icon dependency in the web app) ──────────────── */
const sw = { strokeWidth: 2, stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function IconX() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...sw}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function IconMic() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...sw}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
    </svg>
  )
}
function IconMicOff() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...sw}>
      <path d="m2 2 20 20M9 9v1a3 3 0 0 0 5 2M15 9.3V5a3 3 0 0 0-5.7-1.3M5 10a7 7 0 0 0 10.7 6M19 10a7 7 0 0 1-.1 1.2M12 17v4" />
    </svg>
  )
}
function IconVolume() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...sw}>
      <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  )
}
function IconVolumeOff() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...sw}>
      <path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" />
    </svg>
  )
}

const VERDICTS = {
  great: { color: '#12b76a', label: 'Great pick', Icon: CheckCircle2 },
  okay: { color: '#f59e0b', label: 'Okay', Icon: AlertCircle },
  avoid: { color: '#ff5c5c', label: 'Think twice', Icon: XCircle },
} as const

function VerdictPopup({ d }: { d: LiveDetection }) {
  const v = VERDICTS[d.verdict] ?? VERDICTS.okay
  return (
    <div
      className="animate-pop-in flex items-start gap-3 rounded-2xl bg-black/70 p-3 backdrop-blur"
      style={{ boxShadow: `inset 0 0 0 1.5px ${v.color}66` }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${v.color}26` }}
      >
        <ShoppingBag size={20} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-white">{d.name}</span>
          {d.estimatedPrice && <span className="text-xs text-white/60">{d.estimatedPrice}</span>}
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
