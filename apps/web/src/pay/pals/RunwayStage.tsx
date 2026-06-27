/**
 * RunwayStage — the live Runway Characters (GWM-1) avatar interview.
 * ───────────────────────────────────────────────────────────────────────────
 * A full-screen FaceTime-style video call: the avatar tutor (Simon) plays
 * full-bleed, the student's webcam is a small floating self-view (PiP), and mic
 * / end controls float over a soft scrim — all in the `.pv` design language so
 * it sits seamlessly inside StudyPal. The surface is `fixed inset-0` so it owns
 * the whole viewport and never scrolls on mobile.
 *
 * Joins the LiveKit room minted by our server (POST /study/topics/:id/interview
 * → { provider:'runway', runway: SessionCredentials }).
 *
 * Lifecycle is driven by `useAvatarStatus()`:
 *   connecting → waiting → ready → (ending) → ended | error
 * On a normal `ended` (the avatar wraps up, or the ~5-min cap hits) we score
 * from the captured transcript. A connect failure before we ever go live tries
 * one fresh session (creds are one-time use) before bailing to a retry screen.
 *
 * This file is loaded lazily so the LiveKit/Runway client never bloats the
 * main bundle.
 */
import { useEffect, useRef, useState } from 'react'
import {
  AvatarSession,
  AvatarVideo,
  UserVideo,
  VideoTrack,
  AudioRenderer,
  useAvatarStatus,
  useAvatarSession,
  useLocalMedia,
  useTranscript,
  useAvatar,
  isTrackReference,
  type SessionCredentials,
} from '@runwayml/avatars-react'
import { Mic, MicOff, PhoneOff, Clock, VideoOff, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { InterviewLoader } from './InterviewLoader'

type TranscriptLine = { role: string; text: string }
type Focus = { lookingPct?: number; flags?: string[]; notes?: string }

// Hard cap for a Runway session (their limit is ~5 min). We end slightly under.
const MAX_INTERVIEW_SECS = 295
// Below this, with nothing said, a "completed" call is really a dropped
// connection — don't score it, let the kid try again.
const MIN_REAL_INTERVIEW_SECS = 12
// If the avatar never joins within this window, treat it as a connect failure.
const CONNECT_TIMEOUT_MS = 30000

export type RunwayStageProps = {
  interviewId: string
  credentials: SessionCredentials
  onEnd: (p: { transcript: TranscriptLine[]; durationSecs: number; focus?: Focus }) => void
  onAbort: (message?: string, detail?: string) => void
}

export function RunwayStage({ interviewId, credentials, onEnd, onAbort }: RunwayStageProps) {
  // Credentials are one-time use; if the first connect fails before we ever go
  // live we fetch a fresh session once and remount via the `key`.
  const [creds, setCreds] = useState<SessionCredentials>(credentials)
  const reachedRef = useRef(false)
  const retriedRef = useRef(false)

  async function handleError(err: Error) {
    if (!reachedRef.current && !retriedRef.current) {
      retriedRef.current = true
      try {
        const r = await api<{ runway?: SessionCredentials }>(
          `/study/interviews/${interviewId}/runway-session`,
          { method: 'POST', body: JSON.stringify({}) },
        )
        if (r.runway) { setCreds(r.runway); return }
      } catch { /* fall through to abort */ }
    }
    onAbort(undefined, `runway: ${err?.message ?? 'connection failed'}`)
  }

  return (
    <AvatarSession
      key={creds.sessionId}
      credentials={creds}
      audio
      video
      onError={handleError}
    >
      <Inner onReached={() => { reachedRef.current = true }} onEnd={onEnd} onAbort={onAbort} />
      {/* Plays the avatar tutor's voice — without this the call is silent. */}
      <AudioRenderer />
    </AvatarSession>
  )
}

function Inner({
  onReached,
  onEnd,
  onAbort,
}: {
  onReached: () => void
  onEnd: RunwayStageProps['onEnd']
  onAbort: RunwayStageProps['onAbort']
}) {
  const avatar = useAvatarStatus()
  const { end } = useAvatarSession()
  const { isMicEnabled, toggleMic } = useLocalMedia()
  const transcript = useTranscript()
  const { participant } = useAvatar()

  // `live` drives rendering; the refs mirror it for use inside callbacks/timers.
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  const startedRef = useRef<number | null>(null)
  const endedRef = useRef(false)
  // Keep the latest transcript / avatar identity in refs so finalize() (called
  // from an effect) always reads fresh values.
  const transcriptRef = useRef(transcript)
  transcriptRef.current = transcript
  const avatarIdRef = useRef<string | undefined>(undefined)
  if (participant?.identity) avatarIdRef.current = participant.identity

  const [remaining, setRemaining] = useState(MAX_INTERVIEW_SECS)

  const status = avatar.status

  // ── Lifecycle ──────────────────────────────────────────────────────────
  // IMPORTANT: a LiveKit room starts in `Disconnected`, which the SDK maps to
  // status 'ended'. So 'ended' is only a REAL end once we've actually connected
  // (reached 'ready'/'waiting'); before that it just means "not connected yet".
  useEffect(() => {
    if ((status === 'ready' || status === 'waiting') && !liveRef.current) {
      liveRef.current = true
      startedRef.current = Date.now()
      setLive(true)
      onReached()
    } else if (status === 'ended' && liveRef.current) {
      finalize()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Genuine connect-failure path: if the avatar never joins within the window,
  // bail to a retry screen rather than spinning forever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!liveRef.current && !endedRef.current) {
        endedRef.current = true
        onAbort(undefined, 'runway: connect timeout (avatar did not join)')
      }
    }, CONNECT_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown to the session cap — only once we're actually live. When it runs
  // out we end the call ourselves so the transcript gets scored.
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      const base = startedRef.current ?? Date.now()
      const left = Math.max(0, MAX_INTERVIEW_SECS - Math.round((Date.now() - base) / 1000))
      setRemaining(left)
      if (left <= 0) void manualEnd()
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  function finalize() {
    if (endedRef.current) return
    endedRef.current = true
    const base = startedRef.current ?? Date.now()
    const durationSecs = Math.round((Date.now() - base) / 1000)
    const avatarId = avatarIdRef.current
    const lines: TranscriptLine[] = transcriptRef.current
      .filter((e) => e.final && e.text.trim())
      .slice(-80)
      .map((e) => ({
        // The only remote participant is the avatar tutor; everyone else is the kid.
        role: avatarId && e.participantIdentity === avatarId ? 'tutor' : 'kid',
        text: e.text,
      }))

    if (lines.length === 0 && durationSecs < MIN_REAL_INTERVIEW_SECS) {
      onAbort(
        "We didn't quite get your interview going. Let's try again.",
        `ended early (${durationSecs}s, 0 lines)`,
      )
      return
    }
    onEnd({ transcript: lines, durationSecs })
  }

  async function manualEnd() {
    try { await end() } catch { /* ignore */ }
    finalize()
  }

  const isLive = live && status === 'ready'

  const mm = String(Math.floor(remaining / 60)).padStart(1, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const lowTime = remaining <= 30

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden" style={{ background: '#0b0c0f', height: '100dvh' }}>
      {/* ── Avatar tutor (Simon) — full-bleed ──────────────────────────── */}
      <AvatarVideo className="absolute inset-0 h-full w-full">
        {(s) =>
          s.status === 'ready' ? (
            <VideoTrack trackRef={s.videoTrackRef} className="h-full w-full object-cover" />
          ) : null
        }
      </AvatarVideo>

      {/* Top scrim for legibility of the floating chips */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36" style={{ background: 'linear-gradient(180deg, rgba(11,12,15,0.55), transparent)' }} />

      {/* ── Top bar: name + (live) timer + proctor badge ───────────────── */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(11,12,15,0.5)', backdropFilter: 'blur(8px)' }}>
          {isLive && <span className="pv-live-pulse h-2 w-2 rounded-full" style={{ background: 'var(--pv-pos)' }} />}
          <span className="text-sm font-bold text-white">Principal Simon</span>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {isLive && (
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums"
              style={{ background: lowTime ? 'var(--pv-neg)' : 'rgba(11,12,15,0.5)', color: '#fff', backdropFilter: 'blur(8px)' }}
            >
              <Clock size={13} /> {mm}:{ss}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'rgba(11,12,15,0.5)', color: '#fff', backdropFilter: 'blur(8px)' }}>
            <ShieldCheck size={12} style={{ color: 'var(--pv-pos)' }} /> Proctored
          </div>
        </div>
      </div>

      {/* ── Self-view PiP (the student) — small floating tile ──────────── */}
      {live && (
        <div
          className="pv-pip-in absolute h-[150px] w-[110px] overflow-hidden rounded-[20px]"
          style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 116px)', background: '#000', boxShadow: '0 10px 30px -8px rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.18)' }}
        >
          <UserVideo>
            {(s) =>
              s.isCameraEnabled && isTrackReference(s.trackRef) ? (
                <VideoTrack trackRef={s.trackRef} className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5" style={{ background: 'var(--pv-surface-3)' }}>
                  <VideoOff size={18} style={{ color: 'var(--pv-ink-3)' }} />
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Camera off</span>
                </div>
              )
            }
          </UserVideo>
          {!isMicEnabled && (
            <div className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg)', color: '#fff' }}>
              <MicOff size={12} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-bold text-white" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)' }}>You</div>
        </div>
      )}

      {/* ── Connecting / wrapping-up overlay ───────────────────────────── */}
      {(!live || status === 'ending') && (
        <div className="absolute inset-0 flex flex-col" style={{ background: 'linear-gradient(160deg, #15161b 0%, #0b0c0f 100%)' }}>
          <InterviewLoader
            variant="dark"
            messages={
              status === 'ending'
                ? ['Wrapping up your interview…', 'Scoring your answers…', 'Tallying your Brains…']
                : status === 'waiting'
                  ? ['Principal Simon is joining…', 'Almost there…', 'Get ready to explain out loud!']
                  : undefined
            }
          />
        </div>
      )}

      {/* Bottom scrim + call controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(0deg, rgba(11,12,15,0.6), transparent)' }} />
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-10"
        style={{ paddingBottom: 'max(22px, calc(env(safe-area-inset-bottom) + 14px))' }}
      >
        <button onClick={toggleMic} aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'} className="pv-press-lg flex flex-col items-center gap-1.5">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={isMicEnabled
              ? { background: 'rgba(255,255,255,0.18)', color: '#fff', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }
              : { background: '#fff', color: 'var(--pv-ink)' }}
          >
            {isMicEnabled ? <Mic size={22} /> : <MicOff size={22} />}
          </span>
          <span className="text-[11px] font-semibold text-white">{isMicEnabled ? 'Mic on' : 'Muted'}</span>
        </button>

        <button onClick={() => void manualEnd()} aria-label="End interview" className="pv-press-lg flex flex-col items-center gap-1.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: 'var(--pv-neg)', boxShadow: '0 12px 30px -8px rgba(229,72,77,0.7)' }}>
            <PhoneOff size={24} strokeWidth={2.4} />
          </span>
          <span className="text-[11px] font-semibold text-white">End</span>
        </button>
      </div>
    </div>
  )
}
