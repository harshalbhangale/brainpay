/**
 * RunwayStage — the live Runway Characters (GWM-1) avatar interview.
 * ───────────────────────────────────────────────────────────────────────────
 * Joins the LiveKit room minted by our server (POST /study/topics/:id/interview
 * → { provider:'runway', runway: SessionCredentials }) and renders the avatar
 * tutor full-bleed with a proctor self-view, mic control, a 5-minute countdown
 * and graceful connect/retry states — all in the `.pv` design language so it
 * sits seamlessly inside StudyPal.
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
import { Mic, MicOff, PhoneOff, Clock, VideoOff } from 'lucide-react'
import { api } from '../../lib/api'

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
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-4">
      {/* ── Interviewer (Simon) — top tile ─────────────────────────────── */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[24px]"
        style={{ background: 'var(--pv-surface-3)', boxShadow: 'var(--pv-shadow-lg)' }}
      >
        <AvatarVideo className="absolute inset-0 h-full w-full">
          {(s) =>
            s.status === 'ready' ? (
              <VideoTrack trackRef={s.videoTrackRef} className="h-full w-full object-cover" />
            ) : null
          }
        </AvatarVideo>

        {/* Time-remaining pill */}
        {isLive && (
          <div
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums"
            style={{ background: lowTime ? 'var(--pv-neg)' : 'rgba(11,12,15,0.55)', color: '#fff', backdropFilter: 'blur(6px)' }}
          >
            <Clock size={13} /> {mm}:{ss}
          </div>
        )}

        {/* Live badge */}
        {isLive && (
          <div
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
            style={{ background: 'rgba(11,12,15,0.55)', color: '#fff', backdropFilter: 'blur(6px)' }}
          >
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--pv-pos)' }} /> LIVE
          </div>
        )}

        <NameTag label="Principal Simon" />

        {/* Connecting / waiting / wrapping-up overlay. Until we're live (which
            includes the initial Disconnected→'ended' state) we always show the
            connecting state so a blank tile never shows. */}
        {(!live || status === 'ending') && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: 'rgba(11,12,15,0.55)' }}
          >
            <Spinner />
            <p className="text-sm font-semibold text-white">
              {status === 'ending'
                ? 'Wrapping up…'
                : status === 'waiting'
                  ? 'Almost there…'
                  : 'Connecting you to Principal Simon…'}
            </p>
          </div>
        )}
      </div>

      {/* ── You — bottom tile ──────────────────────────────────────────── */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[24px]"
        style={{ background: '#000', boxShadow: 'var(--pv-shadow-lg)' }}
      >
        <UserVideo>
          {(s) =>
            s.isCameraEnabled && isTrackReference(s.trackRef) ? (
              <VideoTrack
                trackRef={s.trackRef}
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ background: 'var(--pv-surface-3)' }}>
                <VideoOff size={22} style={{ color: 'var(--pv-ink-3)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Camera off</span>
              </div>
            )
          }
        </UserVideo>

        <NameTag label="You" />

        {/* Muted indicator */}
        {!isMicEnabled && (
          <div
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
            style={{ background: 'var(--pv-neg)', color: '#fff' }}
          >
            <MicOff size={12} /> Muted
          </div>
        )}
      </div>

      {/* ── Call controls ──────────────────────────────────────────────── */}
      <div className="flex flex-none items-center justify-center gap-8 pt-1">
        <button
          onClick={toggleMic}
          aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
          className="pv-press-lg flex flex-col items-center gap-1.5"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={isMicEnabled
              ? { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }
              : { background: 'var(--pv-ink)', color: '#fff', boxShadow: 'var(--pv-shadow-md)' }}
          >
            {isMicEnabled ? <Mic size={22} /> : <MicOff size={22} />}
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            {isMicEnabled ? 'Mic on' : 'Muted'}
          </span>
        </button>

        <button
          onClick={() => void manualEnd()}
          aria-label="End interview"
          className="pv-press-lg flex flex-col items-center gap-1.5"
        >
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full text-white"
            style={{ background: 'var(--pv-neg)', boxShadow: '0 12px 30px -8px rgba(229,72,77,0.6)' }}
          >
            <PhoneOff size={24} strokeWidth={2.4} />
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>End</span>
        </button>
      </div>
    </div>
  )
}

function NameTag({ label }: { label: string }) {
  return (
    <div
      className="absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-xs font-bold"
      style={{ background: 'rgba(11,12,15,0.55)', color: '#fff', backdropFilter: 'blur(6px)' }}
    >
      {label}
    </div>
  )
}

function Spinner() {
  return (
    <div className="relative h-14 w-14">
      <div className="absolute inset-0 rounded-full" style={{ border: '3px solid rgba(255,255,255,0.25)' }} />
      <div className="absolute inset-0 animate-spin rounded-full" style={{ border: '3px solid transparent', borderTopColor: '#fff' }} />
    </div>
  )
}
