/**
 * LiveSession (light) — point-and-ask camera + voice with Mika.
 * ───────────────────────────────────────────────────────────────────────────
 * Same realtime pipeline as the dark app (liveRt + liveAudio + camera + VRM),
 * restyled to `.pv`. Camera mode keeps a viewfinder treatment (translucent dark
 * controls for legibility over arbitrary footage); voice mode and all sheets are
 * full light premium. Active states use the lime accent.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Apple, Wallet, CheckCircle2, AlertCircle, XCircle, ZoomIn, ZoomOut, ChevronUp, ChevronDown,
  ShoppingCart, Plus, Check, Trash2, X, Sparkles, PhoneOff, Mic, MicOff, Volume2, VolumeX, Camera, CameraOff,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { connectLiveRt, type LiveRtSocket, type LiveDetection } from '../../lib/liveRt'
import { startCamera, captureJpeg, type CameraHandle } from '../../lib/camera'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../../lib/liveAudio'
import { useAvatar } from '../../lib/avatar'
import { getVoiceKey } from '../../lib/voicePrefs'
import { appendVoiceLines } from '../../lib/voiceHistory'
import { useSessionStore } from '../lib/sessions'
import { Companion, type CompanionMood } from '../../components/Companion'

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
  // Camera can be toggled off mid-session to "just talk to the avatar". The
  // hardware track is only disabled (not stopped) so it flips back instantly
  // without a second getUserMedia (which would break the stream on iOS).
  const [cameraOn, setCameraOn] = useState(true)
  const showCamera = withCamera && cameraOn

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sockRef = useRef<LiveRtSocket | null>(null)
  const cameraRef = useRef<CameraHandle | null>(null)
  const micRef = useRef<MicCaptureHandle | null>(null)
  // The combined (camera + mic) capture stream, when in camera mode. Owned here
  // so a single getUserMedia powers both — a second call kills the camera on iOS.
  const mediaRef = useRef<MediaStream | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const micOnRef = useRef(true)
  const speakerOnRef = useRef(true)
  const replyBufRef = useRef('')
  const pendingUserRef = useRef('')
  const cancelledRef = useRef(false)
  const inFlightRef = useRef(false)
  const zoomRef = useRef(1)
  // Records this live session into the History log (lazily, on the first turn).
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    let disposed = false
    async function begin() {
      const token = useAuthStore.getState().token
      const player = new PcmPlayer()
      playerRef.current = player
      await player.resume()

      const onPcm = (pcm: Int16Array) => {
        if (micOnRef.current && sockRef.current?.isOpen()) sockRef.current.sendMicPcm(pcm)
      }

      if (withCamera && videoRef.current) {
        // ONE combined capture for camera + mic. Acquiring them in two separate
        // getUserMedia calls makes iOS Safari drop the camera track (black feed).
        let combined: MediaStream
        try {
          combined = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          })
        } catch {
          setError('Camera & microphone access was blocked. Allow access and try again.')
          setPhase('no_permission')
          return
        }
        if (disposed) { combined.getTracks().forEach((t) => t.stop()); return }
        mediaRef.current = combined
        try {
          cameraRef.current = await startCamera(videoRef.current, combined)
          setRealZoom(!!cameraRef.current.zoomCaps)
          micRef.current = await startMicCapture(onPcm, combined)
        } catch {
          setError('Camera setup failed. Try again.')
          setPhase('no_permission')
          return
        }
      } else {
        try {
          micRef.current = await startMicCapture(onPcm)
        } catch {
          setError('Microphone access was blocked. Allow mic access and try again.')
          setPhase('no_permission')
          return
        }
      }
      if (disposed) return

      const sock = connectLiveRt(
        {
          onOpen: () => {
            const p = (account?.persona ?? {}) as Record<string, unknown>
            const persona = { name: p.name, age: p.age, interests: p.interests, savingGoal: p.savingGoal ?? p.saving_goal, spend_style: p.spend_style }
            sock.start(role, mode, persona, undefined, getVoiceKey())
            setPhase('live')
          },
          onUserTranscript: (t) => { setUserLine(t); pendingUserRef.current = t },
          onReplyDelta: (t) => { replyBufRef.current += t; setPalLine(replyBufRef.current); setSpeaking(true) },
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
              // Mirror into the History sessions log (text/voice/camera/avatar).
              if (!sessionIdRef.current) {
                sessionIdRef.current = useSessionStore.getState().start(
                  showCamera ? 'camera' : 'voice',
                  showCamera ? 'Point & Ask' : 'Talk to Mika',
                )
              }
              useSessionStore.getState().append(sessionIdRef.current, lines.map((l) => ({ role: l.role, text: l.text })))
            }
            pendingUserRef.current = ''
            replyBufRef.current = ''
            setUserLine('')
            setSpeaking(false)
          },
          onInterrupted: () => { playerRef.current?.clear(); setSpeaking(false) },
          onPalAudio: (pcm) => { if (speakerOnRef.current) playerRef.current?.enqueue(pcm) },
          onPalAudioMp3: (mp3) => { if (speakerOnRef.current) void playerRef.current?.enqueueEncoded(mp3) },
          onDetection: (d) => {
            const stamped = { ...d, seenAt: Date.now() }
            setDetections((prev) => {
              const rest = prev.filter((p) => p.name.toLowerCase() !== d.name.toLowerCase())
              return [...rest, stamped].slice(-6)
            })
          },
          onError: (m) => { setError(m); setPhase('error') },
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
      mediaRef.current?.getTracks().forEach((t) => t.stop())
      mediaRef.current = null
      playerRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (!showCamera || phase !== 'live') return
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
    return () => { if (timer) clearTimeout(timer) }
  }, [showCamera, phase])

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
        const { min, max } = cam.zoomCaps
        cam.setZoom(min + ((next - 1) / (MAX_ZOOM - 1)) * (max - min))
        zoomRef.current = 1
      } else {
        zoomRef.current = next
      }
      return next
    })
  }

  function toggleMic() {
    setMicOn((on) => { const next = !on; micOnRef.current = next; sockRef.current?.setMic(next); return next })
  }
  // Flip the camera on/off without re-acquiring the stream (iOS-safe).
  function toggleCamera() {
    if (!withCamera) return
    setCameraOn((on) => {
      const next = !on
      const track = mediaRef.current?.getVideoTracks?.()[0]
      if (track) track.enabled = next
      return next
    })
  }
  function toggleSpeaker() {
    setSpeakerOn((on) => { const next = !on; speakerOnRef.current = next; sockRef.current?.setSpeaker(next); if (!next) playerRef.current?.clear(); return next })
  }

  const statusLabel = phase === 'live' ? 'LIVE' : phase === 'connecting' ? 'CONNECTING…' : phase === 'error' ? 'RECONNECT' : 'BLOCKED'
  const title = showCamera ? 'Point & Ask' : 'Talk to Mika'
  const hint = showCamera ? 'Point at anything and ask…' : 'Say something — Mika is listening…'

  const lastDet = detections[detections.length - 1]
  const companionMood: CompanionMood = lastDet
    ? lastDet.verdict === 'great' ? 'happy' : lastDet.verdict === 'avoid' ? 'sad' : 'surprised'
    : speaking ? 'happy' : 'neutral'

  // Overlay chips: dark glass over the camera viewfinder, light surfaces in voice mode.
  const chipBg = showCamera ? 'rgba(0,0,0,0.55)' : 'var(--pv-surface)'
  const chipFg = showCamera ? '#ffffff' : 'var(--pv-ink)'
  const chipShadow = showCamera ? undefined : 'var(--pv-shadow-sm)'
  const subtleFg = showCamera ? 'rgba(255,255,255,0.72)' : 'var(--pv-ink-3)'

  function inCart(d: LiveDetection) { return cart.some((c) => c.name.toLowerCase() === d.name.toLowerCase()) }
  function toggleCart(d: LiveDetection) {
    setCart((prev) => (prev.some((c) => c.name.toLowerCase() === d.name.toLowerCase()) ? prev.filter((c) => c.name.toLowerCase() !== d.name.toLowerCase()) : [...prev, d]))
  }
  function dismissDetection(id: string) { setDetections((prev) => prev.filter((d) => d.detectionId !== id)) }
  const cartTotal = cart.reduce((s, c) => s + (c.coinDelta || 0), 0)

  return (
    <div
      className="pv fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: showCamera ? '#000' : 'radial-gradient(900px 520px at 50% -8%, var(--pv-accent-soft), transparent 60%), linear-gradient(180deg, var(--pv-bg) 0%, var(--pv-bg-2) 100%)', color: showCamera ? '#fff' : 'var(--pv-ink)' }}
    >
      {withCamera && (
        <>
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover transition-all duration-300" style={{ transform: `scale(${realZoom ? 1 : zoom})`, opacity: showCamera ? 1 : 0 }} />
          <canvas ref={canvasRef} className="hidden" />
          {showCamera && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.3), transparent 30%, transparent 60%, rgba(0,0,0,0.6))' }} />}
        </>
      )}

      {/* Avatar stage */}
      {showAvatar && (
        <div className={showCamera ? 'pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center' : 'pointer-events-none absolute inset-0 z-20 flex items-center justify-center'}>
          <div className="relative" style={showCamera ? { width: 300, height: 430 } : { width: 'min(86vw, 380px)', height: 'min(66vh, 560px)' }}>
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]" style={{ background: 'var(--pv-accent-soft)', opacity: showCamera ? 0.4 : 1 }} />
            <Companion avatar={avatar} getLevel={() => playerRef.current?.getLevel() ?? 0} mood={companionMood} className="relative h-full w-full" />
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="relative z-30 flex items-center gap-3 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold tracking-wide" style={phase === 'live' ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: chipBg, color: chipFg, boxShadow: chipShadow }}>
          {phase === 'live' && <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(0,0,0,0.6)' }} />}
          {statusLabel}
        </div>
        <div className="font-bold">{title}</div>
        <div className="flex-1" />
        {showCamera && (
          <div className="flex rounded-full p-1" style={{ background: 'rgba(0,0,0,0.55)' }}>
            <button onClick={() => { if (mode !== 'assist') { setMode('assist'); setPhase('connecting'); setDetections([]) } }} className="pv-press rounded-full px-3 py-1.5 text-xs font-bold" style={mode === 'assist' ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { color: 'rgba(255,255,255,0.7)' }}>Ask</button>
            <button onClick={() => { if (mode !== 'shop') { setMode('shop'); setPhase('connecting'); setDetections([]) } }} className="pv-press rounded-full px-3 py-1.5 text-xs font-bold" style={mode === 'shop' ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { color: 'rgba(255,255,255,0.7)' }}>🛒 Shop</button>
          </div>
        )}
        {showCamera && (
          <button onClick={() => setSheet('cart')} className="pv-press relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold" style={{ background: chipBg, color: chipFg }} aria-label="Cart">
            <ShoppingCart size={16} />
            {cart.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>{cart.length}</span>}
          </button>
        )}
        <button onClick={onClose} aria-label="Close" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: chipBg, color: chipFg, boxShadow: chipShadow }}><X size={20} /></button>
      </div>

      {/* Zoom control */}
      {showCamera && (
        <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full p-1.5" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <button onClick={() => changeZoom(0.5)} className="flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90" aria-label="Zoom in"><ZoomIn size={18} /></button>
          <span className="text-[10px] font-bold text-white/80">{zoom.toFixed(1)}×</span>
          <button onClick={() => changeZoom(-0.5)} className="flex h-9 w-9 items-center justify-center rounded-full text-white active:scale-90" aria-label="Zoom out"><ZoomOut size={18} /></button>
        </div>
      )}

      {/* Scanned coins */}
      {showCamera && detections.map((d, i) => {
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
        <div className="pv-pop relative z-30 mx-auto mt-6 max-w-xs rounded-2xl p-4 text-center" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-lg)' }}>
          <div className="text-sm">{error ?? 'Something went wrong.'}</div>
          <button onClick={onClose} className="pv-press mt-3 rounded-full px-5 py-2 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>Close</button>
        </div>
      )}

      <div className="flex-1" />

      {/* Transcript / captions */}
      <div className="relative z-30 px-4 pb-2">
        {transcriptOpen ? (
          <div className="pv-no-scrollbar mb-2 max-h-[45vh] overflow-y-auto rounded-2xl p-3" style={{ background: showCamera ? 'rgba(0,0,0,0.7)' : 'var(--pv-surface)', color: chipFg, boxShadow: chipShadow }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: subtleFg }}>Transcript</span>
              <button onClick={() => setTranscriptOpen(false)} className="flex items-center gap-1 text-xs" style={{ color: subtleFg }}>Collapse <ChevronDown size={14} /></button>
            </div>
            {transcript.length === 0 ? (
              <div className="py-4 text-center text-xs" style={{ color: subtleFg }}>No conversation yet.</div>
            ) : (
              <div className="space-y-2">
                {transcript.map((l) => (
                  <div key={l.id} className={l.role === 'you' ? 'text-right' : ''}>
                    <span className="inline-block max-w-[88%] rounded-2xl px-3 py-1.5 text-sm" style={l.role === 'you' ? { background: showCamera ? 'rgba(255,255,255,0.15)' : 'var(--pv-surface-2)' } : { background: showCamera ? 'rgba(0,0,0,0.4)' : 'var(--pv-surface-2)', fontStyle: 'italic' }}>{l.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {userLine && <div className="ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-sm" style={{ background: showCamera ? 'rgba(255,255,255,0.15)' : 'var(--pv-surface-2)', color: chipFg }}>{userLine}</div>}
            {palLine ? (
              <div className="flex items-end gap-2">
                <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px] italic leading-relaxed" style={{ background: chipBg, color: chipFg, boxShadow: chipShadow }}>{palLine}</div>
                <button onClick={() => setTranscriptOpen(true)} className="mb-1 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px]" style={{ background: chipBg, color: subtleFg }}><ChevronUp size={13} /> Transcript</button>
              </div>
            ) : (
              phase === 'live' && (
                <div className="flex items-center justify-center gap-2 text-sm" style={{ color: subtleFg }}>
                  {hint}
                  {transcript.length > 0 && <button onClick={() => setTranscriptOpen(true)} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]" style={{ background: chipBg, color: subtleFg }}><ChevronUp size={13} /> Transcript</button>}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {expanded && (
        <ExpandedCard d={expanded} inCart={inCart(expanded)} onAdd={() => { toggleCart(expanded); dismissDetection(expanded.detectionId); setExpanded(null) }} onDismiss={() => { dismissDetection(expanded.detectionId); setExpanded(null) }} onClose={() => setExpanded(null)} />
      )}

      {sheet === 'cart' && <CartSheet cart={cart} total={cartTotal} onRemove={toggleCart} onClose={() => setSheet('none')} />}

      {/* Controls */}
      <div className="relative z-30 flex items-center justify-center gap-4 px-6 pb-7 pt-3" style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}>
        <ControlButton active={showAvatar} dark={showCamera} onClick={() => setShowAvatar((v) => !v)} label={showAvatar ? 'Avatar' : 'Hidden'}><Sparkles size={24} strokeWidth={2.2} /></ControlButton>
        {withCamera && (
          <ControlButton active={cameraOn} dark={showCamera} onClick={toggleCamera} label={cameraOn ? 'Camera' : 'Just talk'}>{cameraOn ? <Camera size={24} /> : <CameraOff size={24} />}</ControlButton>
        )}
        <ControlButton active={micOn} dark={showCamera} onClick={toggleMic} label={micOn ? 'Mic on' : 'Muted'}>{micOn ? <Mic size={24} /> : <MicOff size={24} />}</ControlButton>
        <ControlButton active={speakerOn} dark={showCamera} onClick={toggleSpeaker} label={speakerOn ? 'Sound on' : 'Silent'}>{speakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}</ControlButton>
        <button onClick={onClose} aria-label="End session" className="pv-press-lg flex flex-col items-center gap-1.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: 'var(--pv-neg)', boxShadow: '0 12px 30px -8px rgba(229,72,77,0.6)' }}><PhoneOff size={24} strokeWidth={2.4} /></span>
          <span className="text-xs font-semibold" style={{ color: subtleFg }}>End</span>
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, dark, onClick, label, children }: { active: boolean; dark: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  const inactive = dark ? { background: 'rgba(0,0,0,0.55)', color: '#fff' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }
  return (
    <button onClick={onClick} className="pv-press-lg flex flex-col items-center gap-1.5">
      <span className="flex h-16 w-16 items-center justify-center rounded-full" style={active ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : inactive}>{children}</span>
      <span className="text-xs font-semibold" style={{ color: dark ? 'rgba(255,255,255,0.8)' : 'var(--pv-ink-3)' }}>{label}</span>
    </button>
  )
}

const VERDICTS = {
  great: { color: '#12a150', label: 'Great pick', Icon: CheckCircle2 },
  okay: { color: '#d98e04', label: 'Okay', Icon: AlertCircle },
  avoid: { color: '#e5484d', label: 'Think twice', Icon: XCircle },
} as const

function pts(n: number): string { return `${n >= 0 ? '+' : '−'}${Math.abs(n)}` }

function ItemCoin({ d, inCart, onClick }: { d: LiveDetection; inCart: boolean; onClick: () => void }) {
  const v = VERDICTS[d.verdict] ?? VERDICTS.okay
  return (
    <button onClick={onClick} className="pv-pop relative flex h-14 w-14 flex-col items-center justify-center rounded-full text-white active:scale-90" style={{ background: `radial-gradient(circle at 50% 35%, ${v.color}, ${v.color}cc)`, boxShadow: `0 0 0 2px ${v.color}, 0 6px 16px ${v.color}55` }} title={d.name}>
      <span className="text-sm font-extrabold leading-none">{pts(d.coinDelta)}</span>
      <span className="text-[8px] font-semibold uppercase opacity-80">pts</span>
      {inCart && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black ring-2" style={{ ['--tw-ring-color' as string]: v.color }}><Check size={12} strokeWidth={3} /></span>}
    </button>
  )
}

function ExpandedCard({ d, inCart, onAdd, onDismiss, onClose }: { d: LiveDetection; inCart: boolean; onAdd: () => void; onDismiss: () => void; onClose: () => void }) {
  const v = VERDICTS[d.verdict] ?? VERDICTS.okay
  const good = d.verdict === 'great'
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.5)', backdropFilter: 'blur(4px)' }} />
      <div onClick={(e) => e.stopPropagation()} className="pv-rise relative w-full max-w-md rounded-t-[28px] p-5" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-lg)', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: 'var(--pv-surface-3)' }} />
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: v.color }}><span className="text-base font-extrabold">{pts(d.coinDelta)}</span></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-extrabold">{d.name}</span>
              {d.estimatedPrice && <span className="shrink-0 text-sm" style={{ color: 'var(--pv-ink-3)' }}>{d.estimatedPrice}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide" style={{ color: v.color }}><v.Icon size={14} /> {v.label} · {pts(d.coinDelta)} pts</div>
          </div>
        </div>

        {d.facts && d.facts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.facts.map((f, i) => (<span key={i} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--pv-surface-2)' }}>{f}</span>))}
          </div>
        )}
        {d.healthNote && <div className="mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm" style={{ background: 'var(--pv-surface-2)' }}><Apple size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--pv-pos)' }} /> {d.healthNote}</div>}
        {d.budgetNote && <div className="mt-2 flex items-start gap-2 rounded-2xl p-3 text-sm" style={{ background: 'var(--pv-surface-2)' }}><Wallet size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--pv-warn)' }} /> {d.budgetNote}</div>}

        <div className="mt-4 flex gap-2">
          <button onClick={onDismiss} className="pv-press flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold" style={{ background: 'var(--pv-surface-2)' }}><X size={16} /> Skip</button>
          <button onClick={onAdd} className="pv-press-lg flex flex-[1.4] items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold" style={inCart ? { background: 'var(--pv-surface-2)' } : good ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'rgba(217,142,4,0.18)', color: 'var(--pv-warn)' }}><Plus size={16} /> {good ? 'Add to cart' : 'Add anyway'}</button>
        </div>
      </div>
    </div>
  )
}

function CartSheet({ cart, total, onRemove, onClose }: { cart: LiveDetection[]; total: number; onRemove: (d: LiveDetection) => void; onClose: () => void }) {
  const [done, setDone] = useState(false)
  async function checkout() {
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
    } catch { /* ignore — demo success */ }
    setDone(true)
    setTimeout(onClose, 1400)
  }
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.5)', backdropFilter: 'blur(4px)' }} />
      <div onClick={(e) => e.stopPropagation()} className="pv-rise relative w-full max-w-md rounded-t-[28px] p-5" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-lg)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: 'var(--pv-surface-3)' }} />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="pv-h2">Your cart</h3>
          <button onClick={onClose} className="pv-press flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)' }}><X size={16} /></button>
        </div>
        {done ? (
          <div className="py-10 text-center">
            <div className="pv-scale-in mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}><Check size={28} strokeWidth={3} /></div>
            <div className="font-bold">Paid! Great choices 🎉</div>
          </div>
        ) : cart.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>Nothing in the cart yet. Scan items and add the good ones!</div>
        ) : (
          <>
            <div className="pv-no-scrollbar max-h-[40vh] space-y-2 overflow-y-auto">
              {cart.map((c) => {
                const v = VERDICTS[c.verdict] ?? VERDICTS.okay
                return (
                  <div key={c.detectionId} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--pv-surface-2)' }}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: v.color }}>{pts(c.coinDelta)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                    {c.estimatedPrice && <span className="text-xs" style={{ color: 'var(--pv-ink-3)' }}>{c.estimatedPrice}</span>}
                    <button onClick={() => onRemove(c)} style={{ color: 'var(--pv-ink-3)' }}><Trash2 size={16} /></button>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'var(--pv-surface-2)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink-2)' }}>Health points</span>
              <span className="pv-amount text-lg" style={{ color: total >= 0 ? 'var(--pv-pos)' : 'var(--pv-neg)' }}>{pts(total)}</span>
            </div>
            <button onClick={checkout} className="pv-press-lg pv-sheen mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>Pay</button>
          </>
        )}
      </div>
    </div>
  )
}
