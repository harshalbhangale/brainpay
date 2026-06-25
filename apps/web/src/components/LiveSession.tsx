import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { connectLiveRt, type LiveRtSocket, type LiveDetection } from '../lib/liveRt'
import { startCamera, captureJpeg, type CameraHandle } from '../lib/camera'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../lib/liveAudio'
import { avatarSrc, useAvatar } from '../lib/avatar'
import { getVoiceKey } from '../lib/voicePrefs'
import { appendVoiceLines } from '../lib/voiceHistory'
import { Apple, Wallet, CheckCircle2, AlertCircle, XCircle, ZoomIn, ZoomOut, ChevronUp, ChevronDown, ShoppingCart, Plus, Check, Trash2, X, Sparkles, PhoneOff } from 'lucide-react'
import { VrmCompanion, type CompanionMood } from './VrmCompanion'

const FRAME_INTERVAL_MS = 1000
const FRAME_MAX_WIDTH = 480
const MAX_ZOOM = 4

type Phase = 'connecting' | 'live' | 'error' | 'no_permission'
type Line = { id: number; role: 'you' | 'mika'; text: string }

let lineId = 1

export function LiveSession({ withCamera, onClose, initialMode = 'assist' }: { withCamera: boolean; onClose: () => void; initialMode?: 'assist' | 'shop' }) {
  const account = useAuthStore((s) => s.account)
  const role: 'parent' | 'kid' = account?.accountType === 'kid' ? 'kid' : 'parent'
  const avatar = useAvatar((s) => s.avatar)

  const [mode, setMode] = useState<'assist' | 'shop'>(initialMode)

  const [phase, setPhase] = useState<Phase>('connecting')
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detections, setDetections] = useState<LiveDetection[]>([])
  const [cart, setCart] = useState<LiveDetection[]>([])
  const [sheet, setSheet] = useState<'none' | 'cart'>('none')
  const [expanded, setExpanded] = useState<LiveDetection | null>(null)
  const [transcript, setTranscript] = useState<Line[]>([])
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [realZoom, setRealZoom] = useState(false)
  const [showAvatar, setShowAvatar] = useState(true)

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
          setRealZoom(!!cameraRef.current.zoomCaps)
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
            const p = (account?.persona ?? {}) as Record<string, unknown>
            const persona = {
              name: p.name, age: p.age, interests: p.interests,
              savingGoal: p.savingGoal ?? p.saving_goal, spend_style: p.spend_style,
            }
            sock.start(role, mode, persona, undefined, getVoiceKey())
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
              const lines = [
                ...(u ? [{ id: lineId++, role: 'you' as const, text: u }] : []),
                ...(r ? [{ id: lineId++, role: 'mika' as const, text: r }] : []),
              ]
              setTranscript((prev) => [...prev, ...lines].slice(-60))
              appendVoiceLines(lines.map((l) => ({ role: l.role, text: l.text })))
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
            const stamped = { ...d, seenAt: Date.now() }
            setDetections((prev) => {
              const rest = prev.filter((p) => p.name.toLowerCase() !== d.name.toLowerCase())
              return [...rest, stamped].slice(-6)
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
  }, [mode])

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

  // Expire coins that haven't been re-seen recently so stale ones disappear.
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - 9000
      setDetections((prev) => prev.filter((d) => (d.seenAt ?? 0) > cutoff))
    }, 2000)
    return () => clearInterval(t)
  }, [])

  function changeZoom(delta: number) {
    setZoom((z) => {
      const next = Math.max(1, Math.min(MAX_ZOOM, Math.round((z + delta) * 2) / 2))
      const cam = cameraRef.current
      if (cam?.zoomCaps) {
        // Real camera zoom — map 1..MAX to the track's native range.
        const { min, max } = cam.zoomCaps
        cam.setZoom(min + ((next - 1) / (MAX_ZOOM - 1)) * (max - min))
        zoomRef.current = 1 // frames already zoomed by the sensor
      } else {
        zoomRef.current = next // digital zoom (crop on capture + scale preview)
      }
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

  function inCart(d: LiveDetection) {
    return cart.some((c) => c.name.toLowerCase() === d.name.toLowerCase())
  }
  function toggleCart(d: LiveDetection) {
    setCart((prev) =>
      prev.some((c) => c.name.toLowerCase() === d.name.toLowerCase())
        ? prev.filter((c) => c.name.toLowerCase() !== d.name.toLowerCase())
        : [...prev, d],
    )
  }
  function dismissDetection(id: string) {
    setDetections((prev) => prev.filter((d) => d.detectionId !== id))
  }
  const cartTotal = cart.reduce((s, c) => s + (c.coinDelta || 0), 0)

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
            style={{ transform: `scale(${realZoom ? 1 : zoom})` }}
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#06100d] to-[#0b0b0f]" />
      )}

      {/* Avatar stage — big & centered by default (bottom-center over camera) */}
      {showAvatar && (
        <div className={withCamera ? 'pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center' : 'pointer-events-none absolute inset-0 z-20 flex items-center justify-center'}>
          <div
            className="relative"
            style={withCamera ? { width: 300, height: 430 } : { width: 'min(86vw, 380px)', height: 'min(66vh, 560px)' }}
          >
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-grad-aurora opacity-25 blur-[80px]" />
            <VrmCompanion
              src={avatarSrc(avatar)}
              getLevel={() => playerRef.current?.getLevel() ?? 0}
              mood={companionMood}
              className="relative h-full w-full"
            />
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="relative z-30 flex items-center gap-3 p-4">
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold tracking-wide backdrop-blur ${
            phase === 'live' ? 'text-on-accent glow-accent' : 'bg-black/60 text-ink'
          }`}
          style={phase === 'live' ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}
        >
          {phase === 'live' && <span className="h-2 w-2 rounded-full bg-black/70 animate-glow" />}
          {statusLabel}
        </div>
        <div className="font-bold drop-shadow">{title}</div>
        <div className="flex-1" />
        {withCamera && (
          <div className="flex rounded-full bg-black/60 p-1 backdrop-blur">
            <button
              onClick={() => { if (mode !== 'assist') { setMode('assist'); setPhase('connecting'); setDetections([]) } }}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ${mode === 'assist' ? 'text-on-accent' : 'text-white/70'}`}
              style={mode === 'assist' ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}
            >
              Ask
            </button>
            <button
              onClick={() => { if (mode !== 'shop') { setMode('shop'); setPhase('connecting'); setDetections([]) } }}
              className={`press rounded-full px-3 py-1.5 text-xs font-bold ${mode === 'shop' ? 'text-on-accent' : 'text-white/70'}`}
              style={mode === 'shop' ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}
            >
              🛒 Shop
            </button>
          </div>
        )}
        {withCamera && (
          <button
            onClick={() => setSheet('cart')}
            className="press relative flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-sm font-bold text-ink backdrop-blur"
            aria-label="Cart"
          >
            <ShoppingCart size={16} />
            {cart.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-extrabold text-on-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>
                {cart.length}
              </span>
            )}
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-ink backdrop-blur"
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

      {/* Scanned items — coins pinned on the item (tap to expand) */}
      {withCamera &&
        detections.map((d, i) => {
          const anchored = d.anchor && d.anchor.x != null && d.anchor.y != null
          const style: React.CSSProperties = anchored
            ? { left: `${d.anchor!.x * 100}%`, top: `${d.anchor!.y * 100}%`, transform: 'translate(-50%, -50%)' }
            : { left: 14, top: 96 + i * 64 }
          return (
            <div key={d.detectionId} className="absolute z-20" style={style}>
              <ItemCoin d={d} inCart={inCart(d)} onClick={() => setExpanded(d)} />
            </div>
          )
        })}

      {/* Permission / error */}
      {(phase === 'no_permission' || phase === 'error') && (
        <div className="animate-pop-in grad-border relative z-30 mx-auto mt-6 max-w-xs rounded-2xl p-4 text-center backdrop-blur" style={{ backgroundImage: 'var(--grad-card)' }}>
          <div className="text-sm text-ink">{error ?? 'Something went wrong.'}</div>
          <button onClick={onClose} className="press mt-3 rounded-full px-5 py-2 text-sm font-bold text-on-accent glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>
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

      {/* Expanded item card */}
      {expanded && (
        <ExpandedCard
          d={expanded}
          inCart={inCart(expanded)}
          onAdd={() => {
            toggleCart(expanded)
            dismissDetection(expanded.detectionId)
            setExpanded(null)
          }}
          onDismiss={() => {
            dismissDetection(expanded.detectionId)
            setExpanded(null)
          }}
          onClose={() => setExpanded(null)}
        />
      )}

      {/* Cart sheet */}
      {sheet === 'cart' && (
        <CartSheet cart={cart} total={cartTotal} onRemove={toggleCart} onClose={() => setSheet('none')} />
      )}

      {/* Controls — call-style bar */}
      <div className="relative z-30 flex items-center justify-center gap-4 px-6 pb-7 pt-3">
        <ControlButton active={showAvatar} onClick={() => setShowAvatar((v) => !v)} label={showAvatar ? 'Avatar' : 'Hidden'}>
          <Sparkles size={24} strokeWidth={2.2} />
        </ControlButton>
        <ControlButton active={micOn} onClick={toggleMic} label={micOn ? 'Mic on' : 'Muted'}>
          {micOn ? <IconMic /> : <IconMicOff />}
        </ControlButton>
        <ControlButton active={speakerOn} onClick={toggleSpeaker} label={speakerOn ? 'Sound on' : 'Silent'}>
          {speakerOn ? <IconVolume /> : <IconVolumeOff />}
        </ControlButton>
        <button onClick={onClose} aria-label="End session" className="press-lg flex flex-col items-center gap-1.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: 'var(--danger)', boxShadow: '0 12px 30px -8px rgba(255,93,108,0.65)' }}>
            <PhoneOff size={24} strokeWidth={2.4} />
          </span>
          <span className="text-xs font-semibold text-white/80">End</span>
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="press-lg flex flex-col items-center gap-1.5">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full backdrop-blur ${active ? 'text-on-accent glow-accent' : 'border border-white/15 bg-black/60 text-ink'}`} style={active ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}>
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

function pts(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n)}`
}

/* Small tappable coin: colour = verdict, shows the points delta. */
function ItemCoin({ d, inCart, onClick }: { d: LiveDetection; inCart: boolean; onClick: () => void }) {
  const v = VERDICTS[d.verdict] ?? VERDICTS.okay
  return (
    <button
      onClick={onClick}
      className="animate-pop-in relative flex h-14 w-14 flex-col items-center justify-center rounded-full text-white shadow-lg active:scale-90"
      style={{ background: `radial-gradient(circle at 50% 35%, ${v.color}, ${v.color}cc)`, boxShadow: `0 0 0 2px ${v.color}, 0 6px 16px ${v.color}55` }}
      title={d.name}
    >
      <span className="text-sm font-extrabold leading-none">{pts(d.coinDelta)}</span>
      <span className="text-[8px] font-semibold uppercase opacity-80">pts</span>
      {inCart && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black ring-2" style={{ '--tw-ring-color': v.color } as React.CSSProperties}>
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

/* Full card for a tapped item, with facts + add/dismiss. */
function ExpandedCard({ d, inCart, onAdd, onDismiss, onClose }: { d: LiveDetection; inCart: boolean; onAdd: () => void; onDismiss: () => void; onClose: () => void }) {
  const v = VERDICTS[d.verdict] ?? VERDICTS.okay
  const good = d.verdict === 'great'
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="animate-rise grad-border relative w-full max-w-md rounded-t-3xl p-5 pb-8 text-ink shadow-pop" style={{ backgroundImage: 'var(--grad-card)', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface2" />
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: v.color }}>
            <span className="text-base font-extrabold">{pts(d.coinDelta)}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-extrabold">{d.name}</span>
              {d.estimatedPrice && <span className="shrink-0 text-sm text-muted">{d.estimatedPrice}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide" style={{ color: v.color }}>
              <v.Icon size={14} /> {v.label} · {pts(d.coinDelta)} pts
            </div>
          </div>
        </div>

        {d.facts && d.facts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.facts.map((f, i) => (
              <span key={i} className="rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-ink">{f}</span>
            ))}
          </div>
        )}

        {d.healthNote && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-surface2 p-3 text-sm">
            <Apple size={16} className="mt-0.5 shrink-0 text-accent" /> {d.healthNote}
          </div>
        )}
        {d.budgetNote && (
          <div className="mt-2 flex items-start gap-2 rounded-2xl bg-surface2 p-3 text-sm">
            <Wallet size={16} className="mt-0.5 shrink-0 text-warn" /> {d.budgetNote}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onDismiss} className="press glass flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold text-ink">
            <X size={16} /> Skip
          </button>
          <button
            onClick={onAdd}
            className={`press flex flex-[1.4] items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold ${
              inCart ? 'glass text-ink' : good ? 'text-on-accent glow-accent' : 'bg-warn/20 text-warn'
            }`}
            style={!inCart && good ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}
          >
            <Plus size={16} /> {good ? 'Add to cart' : 'Add anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CartSheet({ cart, total, onRemove, onClose }: { cart: LiveDetection[]; total: number; onRemove: (d: LiveDetection) => void; onClose: () => void }) {
  const [done, setDone] = useState(false)
  async function checkout() {
    // Apple Pay / Google Pay via the Payment Request API where available.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PR: any = (window as any).PaymentRequest
      if (PR) {
        const req = new PR(
          [{ supportedMethods: 'https://apple.com/apple-pay', data: { version: 3, merchantIdentifier: 'merchant.com.brainpal.pay', merchantCapabilities: ['supports3DS'], supportedNetworks: ['visa', 'mastercard'], countryCode: 'AU' } }],
          { total: { label: 'BrainPal', amount: { currency: 'AUD', value: '0.00' } } },
        )
        await req.show().then((r: any) => r.complete('success')).catch(() => undefined)
      }
    } catch {
      /* ignore — fall through to demo success */
    }
    setDone(true)
    setTimeout(onClose, 1400)
  }
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="animate-rise grad-border relative w-full max-w-md rounded-t-3xl p-5 text-ink shadow-pop" style={{ backgroundImage: 'var(--grad-card)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface2" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Your cart</h3>
          <button onClick={onClose} className="press glass flex h-8 w-8 items-center justify-center rounded-full text-muted"><X size={16} /></button>
        </div>
        {done ? (
          <div className="py-10 text-center">
            <div className="animate-scale-in mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-on-accent glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}><Check size={28} strokeWidth={3} /></div>
            <div className="font-bold">Paid! Great choices 🎉</div>
          </div>
        ) : cart.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">Nothing in the cart yet. Scan items and add the good ones!</div>
        ) : (
          <>
            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {cart.map((c) => {
                const v = VERDICTS[c.verdict] ?? VERDICTS.okay
                return (
                  <div key={c.detectionId} className="flex items-center gap-3 rounded-2xl bg-surface2 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: v.color }}>{pts(c.coinDelta)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                    {c.estimatedPrice && <span className="text-xs text-muted">{c.estimatedPrice}</span>}
                    <button onClick={() => onRemove(c)} className="text-muted hover:text-danger"><Trash2 size={16} /></button>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface2 px-4 py-3">
              <span className="text-sm font-semibold text-muted">Health points</span>
              <span className="text-lg font-extrabold" style={{ color: total >= 0 ? 'var(--color-accent)' : 'var(--color-danger)' }}>{pts(total)}</span>
            </div>
            <button onClick={checkout} className="press-lg sheen mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-extrabold text-on-accent glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>
               Pay
            </button>
          </>
        )}
      </div>
    </div>
  )
}
