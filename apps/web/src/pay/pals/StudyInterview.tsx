/**
 * StudyInterview — the Tavus video tutor (chapter-scoped, webcam-proctored).
 * ───────────────────────────────────────────────────────────────────────────
 * Flow: pick a chapter (or "weak spots") → grant camera/mic → join the Tavus
 * conversation (real-time replica tutor in a Daily room) → on end we score from
 * the captured transcript and show results + a gentle focus note. If Tavus is
 * unavailable the backend returns provider:'legacy' and we offer the lesson chat.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DailyCall } from '@daily-co/daily-js'
import {
  ChevronLeft, ChevronRight, Mic, Video, Trophy, Sparkles, Check, X, ShieldCheck, Eye, BookOpen, PhoneOff,
} from 'lucide-react'
import { api } from '../../lib/api'
import { Button } from '../components/primitives'

type Chapter = { chapter: string; total: number; due: number; mastered: number }
type Topic = { id: string; title: string; emoji: string }
type Phase = 'intro' | 'starting' | 'live' | 'fallback' | 'scoring' | 'done' | 'error'
type TranscriptLine = { role: string; text: string }
type Focus = { lookingPct?: number; flags?: string[]; notes?: string }
type Result = { brainsEarned?: number; score?: number | null; summary?: string | null; keepPractising?: string[]; focus?: Focus | null }
type StartResp = { interviewId: string; provider: 'tavus' | 'legacy'; conversationUrl?: string; token?: string | null }

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-3 px-4 pb-2 pt-2">
      {onBack ? (
        <button onClick={onBack} aria-label="Back" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
          <ChevronLeft size={20} />
        </button>
      ) : <div className="w-10" />}
      <h2 className="pv-title flex-1 truncate text-center">{title}</h2>
      <div className="flex w-10 justify-end">{right}</div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">{children}</div>
}


export function InterviewView({ topicId, onBack, onChat }: { topicId: string; onBack: () => void; onChat?: () => void }) {
  const qc = useQueryClient()
  const { data: topicData } = useQuery({ queryKey: ['study-topic', topicId], queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`) })
  const { data: chaptersData } = useQuery({ queryKey: ['study-chapters', topicId], queryFn: () => api<{ chapters: Chapter[] }>(`/study/topics/${topicId}/chapters`) })
  const topic = topicData?.topic
  const chapters = (chaptersData?.chapters ?? []).filter((ch) => ch.total > 0)

  const [phase, setPhase] = useState<Phase>('intro')
  const [chapter, setChapter] = useState<string | null>(null) // null = weak spots
  const [session, setSession] = useState<{ interviewId: string; url: string; token: string | null } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setPhase('starting')
    setError(null)
    // Proctored test → camera + mic are required.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      setError('I need your camera and microphone for the interview. Please allow them and try again.')
      setPhase('error')
      return
    }
    try {
      const res = await api<StartResp>(`/study/topics/${topicId}/interview`, {
        method: 'POST',
        body: JSON.stringify({ chapter: chapter ?? undefined }),
      })
      if (res.provider === 'tavus' && res.conversationUrl) {
        setSession({ interviewId: res.interviewId, url: res.conversationUrl, token: res.token ?? null })
        setPhase('live')
      } else {
        setSession({ interviewId: res.interviewId, url: '', token: null })
        setPhase('fallback')
      }
    } catch {
      setError('Could not start the interview. Please try again.')
      setPhase('error')
    }
  }


  async function finish(payload: { transcript: TranscriptLine[]; durationSecs: number; focus?: Focus }) {
    if (!session) return
    setPhase('scoring')
    try {
      const res = await api<Result>(`/study/interviews/${session.interviewId}/complete`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setResult(res)
    } catch {
      setResult({ brainsEarned: 0 })
    }
    qc.invalidateQueries({ queryKey: ['study-stats'] })
    qc.invalidateQueries({ queryKey: ['study-topic', topicId] })
    setPhase('done')
  }

  // ── INTRO ────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="pv-rise mb-6 flex flex-col items-center text-center">
            <div className="animate-float relative mb-4 flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
              <span className="text-5xl">🎓</span>
            </div>
            <h1 className="pv-h1">Talk it through with a tutor</h1>
            <p className="pv-body mt-1.5 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>
              A real video tutor will ask you to explain {topic?.emoji} {topic?.title} out loud and give feedback.
            </p>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--pv-accent-soft)', color: 'var(--pv-ink)' }}>
            <Video size={16} /> Your camera stays on so the tutor can keep you focused.
          </div>

          <p className="pv-label mb-2 mt-5">Pick what to review</p>
          <div className="flex flex-col gap-2.5">
            <ChapterRow label="Weak spots" sub="Concepts you haven't mastered yet" active={chapter === null} onClick={() => setChapter(null)} />
            {chapters.map((ch) => (
              <ChapterRow key={ch.chapter} label={ch.chapter} sub={`${ch.total} concepts · ${ch.due} to review`} active={chapter === ch.chapter} onClick={() => setChapter(ch.chapter)} />
            ))}
          </div>
        </div>
        <div className="flex-none px-6 pb-6 pt-2">
          <Button variant="accent" size="lg" full leadingIcon={Mic} onClick={start}>Start interview</Button>
        </div>
      </>
    )
  }


  // ── STARTING / SCORING ───────────────────────────────────────────────
  if (phase === 'starting' || phase === 'scoring') {
    return (
      <>
        <Header title="AI Interview" />
        <Centered>
          <Spinner />
          <p className="pv-title mt-4">{phase === 'starting' ? 'Waking up your tutor…' : 'Scoring your answers…'}</p>
        </Centered>
      </>
    )
  }

  // ── ERROR ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <Centered>
          <p className="pv-body mb-4" style={{ color: 'var(--pv-ink-2)' }}>{error ?? 'Something went wrong.'}</p>
          <Button variant="accent" size="lg" onClick={() => setPhase('intro')}>Try again</Button>
        </Centered>
      </>
    )
  }

  // ── FALLBACK (Tavus unavailable) ─────────────────────────────────────
  if (phase === 'fallback') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <Centered>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            <Video size={26} style={{ color: 'var(--pv-ink-3)' }} />
          </div>
          <p className="pv-h2">Video tutor is resting</p>
          <p className="pv-body mt-1.5 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>
            The live video tutor isn't available right now. You can still chat with this lesson in text.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="soft" onClick={onBack}>Back</Button>
            {onChat && <Button variant="accent" leadingIcon={BookOpen} onClick={onChat}>Chat with lesson</Button>}
          </div>
        </Centered>
      </>
    )
  }


  // ── DONE (results) ───────────────────────────────────────────────────
  if (phase === 'done') {
    const scorePct = typeof result?.score === 'number' ? result.score * 10 : null
    const flags = result?.focus?.flags ?? []
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {(result?.brainsEarned ?? 0) > 0 && <Confetti />}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="animate-trophy flex h-28 w-28 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
            <Trophy size={44} />
          </div>
          <h2 className="pv-h1">Interview complete!</h2>
          {result?.summary && <p className="pv-body max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>{result.summary}</p>}
          {scorePct != null && <p className="text-sm font-semibold pv-text-accent">Score: {result?.score}/10</p>}
          {(result?.brainsEarned ?? 0) > 0 && (
            <p className="rounded-full px-5 py-2.5 font-bold pv-text-accent" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>+{result!.brainsEarned} 🧠 earned</p>
          )}
          {result?.keepPractising && result.keepPractising.length > 0 && (
            <div className="mt-1 w-full max-w-xs text-left">
              <p className="pv-label mb-1">Keep practising</p>
              {result.keepPractising.map((k, i) => <p key={i} className="text-sm">• {k}</p>)}
            </div>
          )}
          {flags.length > 0 && (
            <div className="mt-1 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}>
              <Eye size={14} style={{ color: 'var(--pv-warn)' }} /> Try to keep your eyes on the screen next time.
            </div>
          )}
        </div>
        <div className="flex-none px-6 pb-6">
          <Button variant="accent" size="lg" full onClick={onBack}>Back to subject</Button>
        </div>
      </div>
    )
  }

  // ── LIVE (Tavus video) ───────────────────────────────────────────────
  return (
    <>
      <Header
        title="AI Interview"
        right={<span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--pv-pos)' }}><ShieldCheck size={13} /> Proctored</span>}
      />
      {session && <TavusStage url={session.url} token={session.token} onEnd={finish} />}
    </>
  )
}


// ─────────────────────────────────────────────────────────── Tavus stage
function TavusStage({ url, token, onEnd }: { url: string; token: string | null; onEnd: (p: { transcript: TranscriptLine[]; durationSecs: number; focus?: Focus }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callRef = useRef<DailyCall | null>(null)
  const transcriptRef = useRef<TranscriptLine[]>([])
  const flagsRef = useRef<string[]>([])
  const endedRef = useRef(false)
  const startedRef = useRef(Date.now())

  function end() {
    if (endedRef.current) return
    endedRef.current = true
    const durationSecs = Math.round((Date.now() - startedRef.current) / 1000)
    const flags = Array.from(new Set(flagsRef.current)).slice(0, 8)
    try { callRef.current?.destroy() } catch { /* ignore */ }
    onEnd({ transcript: transcriptRef.current.slice(-80), durationSecs, focus: flags.length ? { flags } : undefined })
  }

  useEffect(() => {
    let disposed = false
    function onAppMessage(ev: { data?: Record<string, unknown> }) {
      const d = (ev?.data ?? {}) as Record<string, unknown>
      const type = String(d.event_type ?? d.message_type ?? '')
      const props = (d.properties ?? {}) as Record<string, unknown>
      if (/utterance|transcription/i.test(type)) {
        const role = String(props.role ?? d.role ?? 'tutor')
        const text = String(props.speech ?? props.text ?? d.text ?? '')
        if (text.trim()) transcriptRef.current.push({ role: role === 'user' ? 'kid' : role === 'replica' ? 'tutor' : role, text })
      } else if (/perception/i.test(type)) {
        const note = String(props.analysis ?? props.summary ?? '')
        if (note.trim()) flagsRef.current.push(note.slice(0, 100))
      }
    }
    ;(async () => {
      const Daily = (await import('@daily-co/daily-js')).default
      if (disposed || !containerRef.current) return
      const call = Daily.createFrame(containerRef.current, {
        showLeaveButton: false,
        iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '24px' },
      })
      callRef.current = call
      call.on('app-message', onAppMessage as never)
      call.on('left-meeting', () => end())
      try {
        await call.join({ url, ...(token ? { token } : {}) })
      } catch {
        end()
      }
    })()
    return () => {
      disposed = true
      try { callRef.current?.destroy() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token])


  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden rounded-[24px]" style={{ background: 'var(--pv-surface-3)', boxShadow: 'var(--pv-shadow-lg)' }} />
      <div className="flex flex-none items-center justify-center pt-4">
        <button onClick={end} aria-label="End interview" className="pv-press-lg flex flex-col items-center gap-1.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: 'var(--pv-neg)', boxShadow: '0 12px 30px -8px rgba(229,72,77,0.6)' }}>
            <PhoneOff size={24} strokeWidth={2.4} />
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>End</span>
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── small bits
function ChapterRow({ label, sub, active, onClick }: { label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pv-press flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
      style={active
        ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
        : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--pv-surface-2)' }}>
        <Sparkles size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="pv-title text-sm">{label}</div>
        <div className="text-xs font-medium" style={{ color: active ? 'inherit' : 'var(--pv-ink-3)', opacity: active ? 0.85 : 1 }}>{sub}</div>
      </div>
      <ChevronRight size={16} style={{ opacity: 0.6 }} />
    </button>
  )
}

function Spinner() {
  return (
    <div className="relative h-14 w-14">
      <div className="absolute inset-0 rounded-full" style={{ border: '3px solid var(--pv-surface-3)' }} />
      <div className="absolute inset-0 animate-spin rounded-full" style={{ border: '3px solid transparent', borderTopColor: 'var(--pv-accent)' }} />
    </div>
  )
}

function Confetti() {
  const colors = ['#c5f441', '#8b7cff', '#34d399', '#38bdf8', '#ffb24a', '#ff7eb6']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 36 }).map((_, i) => {
        const size = 6 + Math.random() * 8
        return <span key={i} className="animate-confetti absolute top-0 rounded-sm" style={{ left: `${Math.random() * 100}%`, width: size, height: size, backgroundColor: colors[i % colors.length], animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${1.5 + Math.random() * 1.5}s` }} />
      })}
    </div>
  )
}
