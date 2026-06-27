/**
 * StudyInterview — the Tavus video tutor (chapter-scoped, webcam-proctored).
 * ───────────────────────────────────────────────────────────────────────────
 * Flow: pick a chapter (or "weak spots") → grant camera/mic → join the Tavus
 * conversation (real-time replica tutor in a Daily room) → on end we score from
 * the captured transcript and show results + a gentle focus note. If Tavus is
 * unavailable the backend returns provider:'legacy' and we offer the lesson chat.
 */
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DailyCall } from '@daily-co/daily-js'
import {
  ChevronLeft, ChevronRight, Mic, MicOff, Video, Trophy, Sparkles, Check, X, ShieldCheck, Eye, BookOpen, PhoneOff,
  Clock, VideoOff, History,
} from 'lucide-react'
import { api } from '../../lib/api'
import { Button } from '../components/primitives'
import { BrainsPill } from '../components/Brains'
import { useSessionStore } from '../lib/sessions'
import { InterviewLoader } from './InterviewLoader'

// The Runway avatar stage pulls in the LiveKit/Runway client — load it lazily
// so it stays out of the main bundle until an interview actually starts.
const RunwayStage = lazy(() => import('./RunwayStage').then((m) => ({ default: m.RunwayStage })))

type Chapter = { chapter: string; total: number; due: number; mastered: number }
type Topic = { id: string; title: string; emoji: string }
type Phase = 'intro' | 'starting' | 'live' | 'fallback' | 'scoring' | 'done' | 'error'
type TranscriptLine = { role: string; text: string }
type Focus = { lookingPct?: number; flags?: string[]; notes?: string }
type Result = { brainsEarned?: number; score?: number | null; summary?: string | null; keepPractising?: string[]; focus?: Focus | null }
type RunwayCreds = { sessionId: string; serverUrl: string; token: string; roomName: string; avatarId?: string }
type StartResp = {
  interviewId: string
  provider: 'tavus' | 'legacy' | 'runway'
  conversationUrl?: string
  token?: string | null
  runway?: RunwayCreds
}

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

function LiveLoading() {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: 'linear-gradient(160deg, #15161b 0%, #0b0c0f 100%)', height: '100dvh' }}>
      <InterviewLoader variant="dark" />
    </div>
  )
}


export function InterviewView({ topicId, initialChapter, onBack, onChat }: { topicId: string; initialChapter?: string; onBack: () => void; onChat?: () => void }) {
  const qc = useQueryClient()
  const { data: topicData } = useQuery({ queryKey: ['study-topic', topicId], queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`) })
  const { data: chaptersData } = useQuery({ queryKey: ['study-chapters', topicId], queryFn: () => api<{ chapters: Chapter[] }>(`/study/topics/${topicId}/chapters`) })
  const topic = topicData?.topic
  const chapters = (chaptersData?.chapters ?? []).filter((ch) => ch.total > 0)

  const [phase, setPhase] = useState<Phase>('intro')
  const [chapter, setChapter] = useState<string | null>(initialChapter ?? null) // null = weak spots
  const [session, setSession] = useState<{ interviewId: string; provider: 'tavus' | 'runway'; url: string; token: string | null; runway?: RunwayCreds } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  async function start() {
    setPhase('starting')
    setError(null)
    // Proctored test → camera + mic are required.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch (err) {
      setError('I need your camera and microphone for the interview. Please allow them and try again.')
      setErrorDetail(`getUserMedia: ${errText(err)}`)
      setPhase('error')
      return
    }
    try {
      const res = await api<StartResp>(`/study/topics/${topicId}/interview`, {
        method: 'POST',
        body: JSON.stringify({ chapter: chapter ?? undefined }),
      })
      if (res.provider === 'runway' && res.runway) {
        setSession({ interviewId: res.interviewId, provider: 'runway', url: '', token: null, runway: res.runway })
        setPhase('live')
      } else if (res.provider === 'tavus' && res.conversationUrl) {
        setSession({ interviewId: res.interviewId, provider: 'tavus', url: res.conversationUrl, token: res.token ?? null })
        setPhase('live')
      } else {
        setSession({ interviewId: res.interviewId, provider: 'tavus', url: '', token: null })
        setPhase('fallback')
      }
    } catch (err) {
      setError('Could not start the interview. Please try again.')
      setErrorDetail(`start: ${errText(err)}`)
      setPhase('error')
    }
  }


  async function finish(payload: { transcript: TranscriptLine[]; durationSecs: number; focus?: Focus }) {
    if (!session) return
    // Record the interview into the History log as an avatar session.
    if (payload.transcript.length > 0) {
      const sid = useSessionStore.getState().start('avatar', topic?.title ? `Tutor · ${topic.title}` : 'Tutor interview')
      useSessionStore.getState().append(sid, payload.transcript.map((t) => ({ role: t.role, text: t.text })))
    }
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
    qc.invalidateQueries({ queryKey: ['study-interviews', topicId] })
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

          <p className="pv-label mb-2 mt-5">{initialChapter ? 'This lesson' : 'Pick what to review'}</p>
          {initialChapter ? (
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }}><BookOpen size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="pv-title text-sm">{initialChapter}</div>
                <div className="text-xs font-medium" style={{ opacity: 0.85 }}>You'll be examined on this lesson</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <ChapterRow label="Weak spots" sub="Concepts you haven't mastered yet" active={chapter === null} onClick={() => setChapter(null)} />
              {chapters.map((ch) => (
                <ChapterRow key={ch.chapter} label={ch.chapter} sub={`${ch.total} concepts · ${ch.due} to review`} active={chapter === ch.chapter} onClick={() => setChapter(ch.chapter)} />
              ))}
            </div>
          )}
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
        <InterviewLoader
          messages={
            phase === 'scoring'
              ? ['Scoring your answers…', 'Reading your explanations…', 'Tallying your Brains…', 'Writing your feedback…']
              : ['Setting up your interview…', 'Asking for camera & mic…', 'Skimming your lesson notes…', 'Waking up your tutor…']
          }
        />
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
          {errorDetail && (
            <p className="mb-4 max-w-xs select-all break-words rounded-lg px-3 py-2 text-[11px]" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)', fontFamily: 'monospace' }}>
              {errorDetail}
            </p>
          )}
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
    const score = typeof result?.score === 'number' ? result.score : null
    const flags = result?.focus?.flags ?? []
    // Score tone: strong (green) / okay (accent) / low (red).
    const tone = score == null
      ? { bg: 'var(--pv-surface-2)', fg: 'var(--pv-ink-3)' }
      : score >= 8 ? { bg: 'var(--pv-pos-soft)', fg: 'var(--pv-pos)' }
      : score >= 5 ? { bg: 'var(--pv-accent-soft)', fg: 'var(--pv-accent)' }
      : { bg: 'var(--pv-neg-soft)', fg: 'var(--pv-neg)' }
    const headline = score == null ? 'Interview complete!' : score >= 8 ? 'Brilliant! 🎉' : score >= 5 ? 'Nice work! 💪' : 'Good try — keep going! 📚'

    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {(result?.brainsEarned ?? 0) > 0 && <Confetti />}
        <div className="pv-no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="flex flex-col items-center text-center">
            {/* Score ring (or trophy if unscored) */}
            {score != null ? (
              <div className="animate-trophy flex h-28 w-28 flex-col items-center justify-center rounded-full" style={{ background: tone.bg, color: tone.fg }}>
                <span className="pv-amount text-4xl leading-none">{score}</span>
                <span className="text-[11px] font-bold" style={{ opacity: 0.7 }}>out of 10</span>
              </div>
            ) : (
              <div className="animate-trophy flex h-28 w-28 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                <Trophy size={44} />
              </div>
            )}

            <h2 className="pv-h1 pv-rise mt-5">{headline}</h2>
            {result?.summary && <p className="pv-body pv-rise mt-2 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>{result.summary}</p>}
            {(result?.brainsEarned ?? 0) > 0 && <div className="pv-rise mt-4"><BrainsPill amount={result!.brainsEarned!} pop /></div>}

            {result?.keepPractising && result.keepPractising.length > 0 && (
              <div className="pv-rise mt-6 w-full max-w-xs rounded-2xl p-4 text-left" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
                <p className="pv-label mb-2">Keep practising</p>
                {result.keepPractising.map((k, i) => (
                  <p key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}><span className="pv-text-accent">•</span> {k}</p>
                ))}
              </div>
            )}

            {flags.length > 0 && (
              <div className="pv-rise mt-3 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}>
                <Eye size={14} style={{ color: 'var(--pv-warn)' }} /> Try to keep your eyes on the screen next time.
              </div>
            )}

            {/* Confirmation that it's logged — answers "it should appear in past interviews". */}
            <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
              <History size={13} /> Saved to your Past interviews
            </div>
          </div>
        </div>
        <div className="flex-none px-6 pb-6 pt-2">
          <Button variant="accent" size="lg" full onClick={onBack}>Back to subject</Button>
        </div>
      </div>
    )
  }

  // Connection failed / we never really got an interview — let them retry
  // instead of silently "completing" with a default score. `detail` carries the
  // raw failure cause so it's visible on-device (tablets have no console).
  function abort(message?: string, detail?: string) {
    setError(message ?? "I couldn't connect you to the tutor. Let's try that again.")
    setErrorDetail(detail ?? null)
    setPhase('error')
  }

  // ── LIVE (full-screen video call) ────────────────────────────────────
  // RunwayStage / TavusStage are `fixed inset-0` surfaces that own the whole
  // viewport, so we render them bare — no in-flow header that would add height
  // and cause the page to scroll on mobile.
  return session?.provider === 'runway' && session.runway ? (
    <Suspense fallback={<LiveLoading />}>
      <RunwayStage interviewId={session.interviewId} credentials={session.runway} onEnd={finish} onAbort={abort} />
    </Suspense>
  ) : session ? (
    <TavusStage url={session.url} token={session.token} onEnd={finish} onAbort={abort} />
  ) : null
}

// Below this many seconds with nothing said, a "completed" interview is really
// a dropped connection — don't score it, let the kid try again.
const MIN_REAL_INTERVIEW_SECS = 12


// ─────────────────────────────────────────────────────────── Tavus stage
// Joins the Tavus conversation with a Daily *call object* (no prebuilt UI, so
// no prejoin lobby / name prompt) and renders the replica tutor's video + audio
// directly. We only complete the interview once we've actually joined.
function TavusStage({ url, token, onEnd, onAbort }: { url: string; token: string | null; onEnd: (p: { transcript: TranscriptLine[]; durationSecs: number; focus?: Focus }) => void; onAbort: (message?: string, detail?: string) => void }) {
  const tutorVideoRef = useRef<HTMLVideoElement>(null)
  const selfVideoRef = useRef<HTMLVideoElement>(null)
  const callRef = useRef<DailyCall | null>(null)
  const transcriptRef = useRef<TranscriptLine[]>([])
  const flagsRef = useRef<string[]>([])
  const endedRef = useRef(false)
  const joinedRef = useRef(false)
  const startedRef = useRef(Date.now())
  const [status, setStatus] = useState<'connecting' | 'live'>('connecting')
  const [micOn, setMicOn] = useState(true)

  // Tear down the call object once, regardless of outcome.
  async function teardown() {
    try { await callRef.current?.leave() } catch { /* ignore */ }
    try { await callRef.current?.destroy() } catch { /* ignore */ }
    callRef.current = null
  }

  // The interview actually happened: complete + score it.
  async function end() {
    if (endedRef.current) return
    endedRef.current = true
    const durationSecs = Math.round((Date.now() - startedRef.current) / 1000)
    const transcript = transcriptRef.current.slice(-80)
    await teardown()
    // A real session means we joined AND either captured speech or stayed long
    // enough for the server/webhook to have a transcript. Anything less is a
    // dropped connection — bail out instead of awarding a default score.
    if (!joinedRef.current || (transcript.length === 0 && durationSecs < MIN_REAL_INTERVIEW_SECS)) {
      onAbort(
        "We didn't quite get your interview going. Let's try again.",
        `ended before a real interview (joined=${joinedRef.current}, ${durationSecs}s, ${transcript.length} lines)`,
      )
      return
    }
    const flags = Array.from(new Set(flagsRef.current)).slice(0, 8)
    onEnd({ transcript, durationSecs, focus: flags.length ? { flags } : undefined })
  }

  // Connection failed before we ever got in — never score, just let them retry.
  async function fail(message?: string, detail?: string) {
    if (endedRef.current) return
    endedRef.current = true
    await teardown()
    onAbort(message, detail)
  }

  function toggleMic() {
    const next = !micOn
    setMicOn(next)
    try { callRef.current?.setLocalAudio(next) } catch { /* ignore */ }
  }

  useEffect(() => {
    let disposed = false

    // Attach the replica tutor's tracks (and the kid's self-view) to the <video>s.
    function paint() {
      const call = callRef.current
      if (!call) return
      const parts = call.participants() as Record<string, { local?: boolean; tracks?: Record<string, { track?: MediaStreamTrack; persistentTrack?: MediaStreamTrack }> }>
      const remote = Object.values(parts).find((p) => !p.local)
      if (remote && tutorVideoRef.current) {
        const v = remote.tracks?.video?.persistentTrack ?? remote.tracks?.video?.track
        const a = remote.tracks?.audio?.persistentTrack ?? remote.tracks?.audio?.track
        const stream = new MediaStream()
        if (v) stream.addTrack(v)
        if (a) stream.addTrack(a)
        if (stream.getTracks().length) {
          tutorVideoRef.current.srcObject = stream
          void tutorVideoRef.current.play().catch(() => undefined)
        }
      }
      const local = parts.local
      const lv = local?.tracks?.video?.persistentTrack ?? local?.tracks?.video?.track
      if (lv && selfVideoRef.current) {
        selfVideoRef.current.srcObject = new MediaStream([lv])
        void selfVideoRef.current.play().catch(() => undefined)
      }
    }

    function onAppMessage(ev: { data?: Record<string, unknown> }) {
      const d = (ev?.data ?? {}) as Record<string, unknown>
      const type = String(d.event_type ?? d.message_type ?? '')
      // Tavus signals the end of the conversation on the data channel — when it
      // does, auto-finish so the kid lands on their score without tapping End.
      if (/shutdown|conversation[._]ended|conversation\.ended|application\.ended|replica.*(left|stopped)/i.test(type)) {
        if (joinedRef.current) void end()
        return
      }
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
      if (disposed) return
      // Reuse-safe: tear down any stray instance from a prior mount (StrictMode).
      try { (Daily.getCallInstance?.() as DailyCall | undefined)?.destroy() } catch { /* ignore */ }

      let call: DailyCall
      try {
        call = Daily.createCallObject({ subscribeToTracksAutomatically: true })
      } catch (err) {
        console.error('[StudyInterview] createCallObject failed:', err)
        void fail("I couldn't start the video tutor. Let's try again.", `createCallObject: ${errText(err)}`)
        return
      }
      callRef.current = call

      call
        .on('joined-meeting', () => { joinedRef.current = true; setStatus('live'); paint() })
        .on('participant-joined', paint)
        .on('participant-updated', paint)
        .on('track-started', paint)
        .on('app-message', onAppMessage as never)
        // Only treat a "left" as completion once we actually got in — otherwise
        // a transient pre-join teardown would falsely "complete" the interview.
        .on('left-meeting', () => { if (joinedRef.current) void end() })
        // Auto-end when the tutor (replica) leaves after wrapping up.
        .on('participant-left', (ev) => {
          const left = (ev as { participant?: { local?: boolean } } | undefined)?.participant
          if (left && !left.local && joinedRef.current) void end()
        })
        // Before we join, an error means we never connected → let them retry.
        // After joining, ignore benign errors so we don't tear down a live call.
        .on('error', (ev) => {
          if (joinedRef.current) return
          const e = ev as { errorMsg?: string; error?: { msg?: string; type?: string } } | undefined
          const detail = `daily ${e?.error?.type ?? 'error'}: ${e?.errorMsg ?? e?.error?.msg ?? 'unknown'}`
          console.error('[StudyInterview] Daily error before join:', detail, ev)
          void fail(undefined, detail)
        })

      try {
        await call.join({ url, ...(token ? { token } : {}), userName: 'Student', startVideoOff: false, startAudioOff: false })
      } catch (err) {
        console.error('[StudyInterview] call.join failed:', err)
        void fail(undefined, `join: ${errText(err)}`)
      }
    })()

    return () => {
      disposed = true
      try { callRef.current?.destroy() } catch { /* ignore */ }
      callRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden" style={{ background: '#0b0c0f', height: '100dvh' }}>
      {/* Tutor — full-bleed */}
      <video ref={tutorVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />

      {/* Top scrim + bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36" style={{ background: 'linear-gradient(180deg, rgba(11,12,15,0.55), transparent)' }} />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(11,12,15,0.5)', backdropFilter: 'blur(8px)' }}>
          {status === 'live' && <span className="pv-live-pulse h-2 w-2 rounded-full" style={{ background: 'var(--pv-pos)' }} />}
          <span className="text-sm font-bold text-white">Your tutor</span>
        </div>
        <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'rgba(11,12,15,0.5)', color: '#fff', backdropFilter: 'blur(8px)' }}>
          <ShieldCheck size={12} style={{ color: 'var(--pv-pos)' }} /> Proctored
        </div>
      </div>

      {/* Self-view PiP — kept mounted so the track can attach; fades in when live */}
      <div
        className="absolute h-[150px] w-[110px] overflow-hidden rounded-[20px] transition-opacity duration-500"
        style={{
          right: 16,
          bottom: 'calc(env(safe-area-inset-bottom) + 116px)',
          background: '#000',
          boxShadow: '0 10px 30px -8px rgba(0,0,0,0.6)',
          border: '2px solid rgba(255,255,255,0.18)',
          opacity: status === 'live' ? 1 : 0,
        }}
      >
        <video ref={selfVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        {!micOn && (
          <div className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg)', color: '#fff' }}>
            <MicOff size={12} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-bold text-white" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)' }}>You</div>
      </div>

      {/* Connecting overlay */}
      {status === 'connecting' && (
        <div className="absolute inset-0 flex flex-col" style={{ background: 'linear-gradient(160deg, #15161b 0%, #0b0c0f 100%)' }}>
          <InterviewLoader variant="dark" messages={['Connecting you to your tutor…', 'Warming up the camera & mic…', 'Setting the room just right…', 'Almost there — sit up tall! ✨']} />
        </div>
      )}

      {/* Bottom scrim + controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(0deg, rgba(11,12,15,0.6), transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-10" style={{ paddingBottom: 'max(22px, calc(env(safe-area-inset-bottom) + 14px))' }}>
        <button onClick={toggleMic} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} className="pv-press-lg flex flex-col items-center gap-1.5">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={micOn
              ? { background: 'rgba(255,255,255,0.18)', color: '#fff', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }
              : { background: '#fff', color: 'var(--pv-ink)' }}
          >
            {micOn ? <Mic size={22} /> : <MicOff size={22} />}
          </span>
          <span className="text-[11px] font-semibold text-white">{micOn ? 'Mic on' : 'Muted'}</span>
        </button>
        <button onClick={() => void end()} aria-label="End interview" className="pv-press-lg flex flex-col items-center gap-1.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: 'var(--pv-neg)', boxShadow: '0 12px 30px -8px rgba(229,72,77,0.7)' }}>
            <PhoneOff size={24} strokeWidth={2.4} />
          </span>
          <span className="text-[11px] font-semibold text-white">End</span>
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── small bits
function errText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 160)
  if (typeof err === 'string') return err.slice(0, 160)
  try { return JSON.stringify(err).slice(0, 160) } catch { return String(err).slice(0, 160) }
}

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
