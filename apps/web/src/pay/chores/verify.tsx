/**
 * Chore verification — the kid's camera flow.
 * ───────────────────────────────────────────────────────────────────────────
 * VerifyChoreSheet: live camera → capture → POST /chores/:id/verify → animated
 *   verdict. On `approved` the backend has already auto-credited the kid
 *   (Policy A), so we celebrate. On `rejected` the kid can retry. On
 *   `uncertain` it's gone to a parent to check.
 * ChorePickerSheet: lists the kid's open chores so they can pick one to verify
 *   (used from the AI chat entry point).
 *
 * Everything renders inside the `.pv` scope and is built from MoneyPal tokens.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, X, Check, RefreshCw, Clock, ImagePlus, ListChecks, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { startCamera, type CameraHandle } from '../../lib/camera'
import type { Chore, ChoresResponse, VerifyResponse } from '../../components/family/types'
import { Button, Card } from '../components/primitives'

/* ───────────────────────────────────────────── data: kid's verifiable chores */

/** A chore the kid can act on right now (fresh, or AI previously rejected). */
export const VERIFIABLE = ['pending', 'ai_rejected']

export function useKidChores(enabled: boolean) {
  return useQuery({
    queryKey: ['chores'],
    queryFn: () => api<ChoresResponse>('/chores'),
    enabled,
  })
}

/* ───────────────────────────────────────────────────────── VerifyChoreSheet */

type Phase = 'camera' | 'sending' | 'result' | 'error'

export function VerifyChoreSheet({ chore, onClose }: { chore: Chore; onClose: () => void }) {
  const qc = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<CameraHandle | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('camera')
  const [camReady, setCamReady] = useState(false)
  const [camError, setCamError] = useState(false)
  const [result, setResult] = useState<VerifyResponse | null>(null)

  const verify = useMutation({
    mutationFn: (photoBase64: string) =>
      api<VerifyResponse>(`/chores/${chore.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ photoBase64, mimeType: 'image/jpeg' }),
      }),
    onSuccess: (res) => {
      setResult(res)
      setPhase('result')
      qc.invalidateQueries({ queryKey: ['chores'] })
      qc.invalidateQueries({ queryKey: ['pay', 'wallet'] })
      qc.invalidateQueries({ queryKey: ['pay', 'family'] })
    },
    onError: () => setPhase('error'),
  })

  // Start / stop the live camera while we're in the capture phase.
  useEffect(() => {
    if (phase !== 'camera') return
    let cancelled = false
    setCamReady(false)
    setCamError(false)
    const v = videoRef.current
    if (!v) return
    startCamera(v)
      .then((handle) => {
        if (cancelled) {
          handle.stop()
          return
        }
        camRef.current = handle
        setCamReady(true)
      })
      .catch(() => {
        if (!cancelled) setCamError(true)
      })
    return () => {
      cancelled = true
      camRef.current?.stop()
      camRef.current = null
    }
  }, [phase])

  const submitBase64 = useCallback(
    (base64: string) => {
      camRef.current?.stop()
      camRef.current = null
      setPhase('sending')
      verify.mutate(base64)
    },
    [verify],
  )

  function capture() {
    const v = videoRef.current
    const cv = canvasRef.current
    if (!v || !cv || !v.videoWidth) return
    const maxW = 640
    const scale = Math.min(1, maxW / v.videoWidth)
    cv.width = Math.round(v.videoWidth * scale)
    cv.height = Math.round(v.videoHeight * scale)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, cv.width, cv.height)
    const dataUrl = cv.toDataURL('image/jpeg', 0.7)
    const base64 = dataUrl.split(',')[1]
    if (base64) submitBase64(base64)
  }

  // Fallback when the live camera is unavailable (permissions / no device):
  // the OS camera/file picker via a capture input.
  function ingestFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const base64 = reader.result.split(',')[1]
      if (base64) submitBase64(base64)
    }
    reader.readAsDataURL(file)
  }

  function retry() {
    setResult(null)
    setPhase('camera')
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: '#0b0c0f' }} role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex flex-none items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Verify chore
          </div>
          <div className="truncate text-lg font-extrabold text-white">{chore.title}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="pv-press flex h-10 w-10 flex-none items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-5">
        {phase === 'camera' && (
          <CameraStage
            videoRef={videoRef}
            ready={camReady}
            error={camError}
            reward={chore.rewardBrains}
            onCapture={capture}
            onPickFile={() => fileRef.current?.click()}
          />
        )}
        {phase === 'sending' && <SendingStage />}
        {phase === 'result' && result && (
          <ResultStage result={result} reward={chore.rewardBrains} onRetry={retry} onClose={onClose} />
        )}
        {phase === 'error' && <ErrorStage onRetry={retry} onClose={onClose} />}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => ingestFile(e.target.files?.[0])}
      />
    </div>
  )
}

function CameraStage({
  videoRef,
  ready,
  error,
  reward,
  onCapture,
  onPickFile,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  ready: boolean
  error: boolean
  reward: number
  onCapture: () => void
  onPickFile: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col items-center">
      <div
        className="relative w-full flex-1 overflow-hidden rounded-[28px]"
        style={{ background: '#16181d', boxShadow: '0 20px 60px -20px rgba(0,0,0,0.8)' }}
      >
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ opacity: ready ? 1 : 0, transition: 'opacity .3s' }} />

        {/* Framing guide */}
        {ready && (
          <div className="pointer-events-none absolute inset-6 rounded-[20px]" style={{ border: '2px dashed rgba(255,255,255,0.35)' }} />
        )}

        {/* Loading / permission states */}
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Camera size={34} className="animate-pulse" />
            <span className="text-sm font-semibold">Starting the camera…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <ImagePlus size={34} />
            <span className="text-sm font-semibold">We couldn't open the live camera here.</span>
            <Button variant="accent" leadingIcon={Camera} onClick={onPickFile}>
              Take a photo instead
            </Button>
          </div>
        )}

        {/* Reward chip */}
        <div className="absolute left-5 top-5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(8px)' }}>
          <Sparkles size={15} /> {aud(reward)}
        </div>
      </div>

      <p className="mt-4 max-w-xs text-center text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
        Point the camera at your finished chore, then tap to let PAL check it.
      </p>

      {/* Shutter */}
      <div className="mt-4 flex flex-none items-center justify-center pb-[max(12px,env(safe-area-inset-bottom))]">
        <button
          onClick={onCapture}
          disabled={!ready}
          aria-label="Capture photo"
          className="pv-press-lg flex h-[72px] w-[72px] items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: '#fff', boxShadow: '0 0 0 4px rgba(255,255,255,0.25)' }}
        >
          <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full" style={{ background: '#fff', border: '3px solid #0b0c0f' }}>
            <Camera size={26} style={{ color: '#0b0c0f' }} />
          </span>
        </button>
      </div>
    </div>
  )
}

function SendingStage() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="pv-scale-in relative flex h-24 w-24 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <span className="animate-spin-slow absolute inset-[-3px] rounded-full opacity-70 blur-[3px]" style={{ background: 'conic-gradient(from 0deg, #8ab4ff, #b69cff, #8ab4ff)' }} />
        <Sparkles size={40} className="relative text-white" />
      </div>
      <div>
        <div className="text-lg font-extrabold text-white">PAL is checking your photo…</div>
        <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.6)', animationDelay: '0ms' }} />
          <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.6)', animationDelay: '160ms' }} />
          <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.6)', animationDelay: '320ms' }} />
        </div>
      </div>
    </div>
  )
}

function ResultStage({ result, reward, onRetry, onClose }: { result: VerifyResponse; reward: number; onRetry: () => void; onClose: () => void }) {
  if (result.verdict === 'approved') {
    return (
      <Card className="pv-pop w-full max-w-sm p-7 text-center">
        <Confetti />
        <div className="pv-scale-in mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--pv-pos-soft)', color: 'var(--pv-pos)' }}>
          <Check size={44} strokeWidth={3} />
        </div>
        <div className="pv-h2 mt-5">Nice work! 🎉</div>
        <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>{result.reason}</p>
        <div className="pv-amount mt-5 text-4xl pv-text-accent">+{aud(reward)}</div>
        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>added to your wallet</p>
        <div className="mt-6">
          <Button variant="primary" size="lg" full onClick={onClose}>Done</Button>
        </div>
      </Card>
    )
  }

  if (result.verdict === 'uncertain') {
    return (
      <Card className="pv-pop w-full max-w-sm p-7 text-center">
        <div className="pv-scale-in mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
          <Clock size={40} />
        </div>
        <div className="pv-h2 mt-5">Sent to a parent 👀</div>
        <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>{result.reason}</p>
        <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>They'll check it and you'll get a ping.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="soft" full onClick={onRetry}>Try a new photo</Button>
          <Button variant="primary" full onClick={onClose}>Okay</Button>
        </div>
      </Card>
    )
  }

  // rejected
  return (
    <Card className="pv-pop w-full max-w-sm p-7 text-center">
      <div className="pv-scale-in mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
        <RefreshCw size={38} />
      </div>
      <div className="pv-h2 mt-5">Not quite yet</div>
      <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>{result.reason}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="soft" full onClick={onClose}>Close</Button>
        <Button variant="accent" full leadingIcon={Camera} onClick={onRetry}>Try again</Button>
      </div>
    </Card>
  )
}

function ErrorStage({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <Card className="pv-pop w-full max-w-sm p-7 text-center">
      <div className="pv-h2">Something went wrong</div>
      <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>We couldn't reach PAL. Check your connection and try again.</p>
      <div className="mt-6 flex gap-2">
        <Button variant="soft" full onClick={onClose}>Close</Button>
        <Button variant="accent" full leadingIcon={Camera} onClick={onRetry}>Try again</Button>
      </div>
    </Card>
  )
}

/** A light, tasteful confetti burst for the win moment. */
function Confetti() {
  const bits = Array.from({ length: 14 })
  const colors = ['#8ab4ff', '#b69cff', '#7ef0b0', '#ffd27a', '#ff9db0']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((_, i) => {
        const left = (i / bits.length) * 100
        const delay = (i % 5) * 60
        const color = colors[i % colors.length].trim()
        return (
          <span
            key={i}
            className="pv-confetti absolute top-0 h-2 w-2 rounded-[2px]"
            style={{ left: `${left}%`, background: color, animationDelay: `${delay}ms` }}
          />
        )
      })}
    </div>
  )
}

/* ───────────────────────────────────────────────────────── ChorePickerSheet */

/**
 * Bottom sheet that lists the kid's verifiable chores. Picking one opens the
 * VerifyChoreSheet. Used from the AI chat ("Verify a chore") entry point.
 */
export function ChorePickerSheet({ onClose }: { onClose: () => void }) {
  const q = useKidChores(true)
  const [active, setActive] = useState<Chore | null>(null)
  const open = (q.data?.chores ?? []).filter((ch) => VERIFIABLE.includes(ch.status))

  if (active) {
    return <VerifyChoreSheet chore={active} onClose={() => { setActive(null); onClose() }} />
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)' }} onClick={onClose} />
      <div className="pv-rise relative w-full max-w-[460px] rounded-t-[var(--pv-r-2xl)] p-6 pb-[max(24px,env(safe-area-inset-bottom))]" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
        <div className="flex items-center justify-between">
          <h2 className="pv-h2">Verify a chore</h2>
          <button onClick={onClose} aria-label="Close" className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}><X size={18} /></button>
        </div>

        {q.isLoading ? (
          <p className="mt-6 text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>Loading…</p>
        ) : open.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 px-4 py-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}><ListChecks size={20} /></span>
            <span className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>No chores to verify right now. </span>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {open.map((ch) => (
              <button key={ch.id} onClick={() => setActive(ch)} className="pv-press flex items-center justify-between gap-3 rounded-2xl p-4 text-left" style={{ background: 'var(--pv-surface-2)' }}>
                <div className="min-w-0">
                  <div className="truncate font-bold">{ch.title}</div>
                  {ch.status === 'ai_rejected' && <div className="text-xs font-semibold" style={{ color: 'var(--pv-neg)' }}>Try again</div>}
                </div>
                <span className="flex items-center gap-1.5 pv-amount text-sm pv-text-accent"><Camera size={15} /> {aud(ch.rewardBrains)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
