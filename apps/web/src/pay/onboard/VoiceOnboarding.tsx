/**
 * VoiceOnboarding (light) — your chosen companion introduces itself by voice
 * (in your chosen voice) and fills the persona via its save_persona tool, while
 * the live character lip-syncs and emotes. Designed in the `.pv` language.
 *
 * Nothing speaks until you tap "Say hi" (a user gesture — required for audio,
 * and stops it talking on its own). Audio is MP3-only to avoid double playback.
 * If the mic is unavailable, you can finish with just your name (no dead-end).
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Check, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { connectLiveRt, type LiveRtSocket } from '../../lib/liveRt'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../../lib/liveAudio'
import { getVoiceKey } from '../../lib/voicePrefs'
import { useAvatar, avatarDef } from '../../lib/avatar'
import { Companion, type CompanionMood } from '../../components/Companion'
import { OnboardBackdrop } from './OnboardBackdrop'

type Phase = 'ready' | 'connecting' | 'live' | 'saving' | 'done' | 'error'

type Line = { id: number; who: 'you' | 'pal'; text: string }
let tlId = 1

/**
 * Turn the persona the companion saved into a short, human list of what we now
 * know — shown on the finish screen ("here's what I learned about you").
 */
function summarisePersona(role: 'parent' | 'kid', persona: Record<string, unknown>, name?: string): { label: string; value: string }[] {
  const s = (v: unknown): string => {
    if (v == null) return ''
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).join(', ')
    return String(v).trim()
  }
  const out: { label: string; value: string }[] = []
  const push = (label: string, v: unknown) => { const val = s(v); if (val) out.push({ label, value: val }) }
  if (name?.trim()) push('Name', name.trim())
  if (role === 'kid') {
    push('Age', persona.age)
    push('Loves', persona.interests ?? persona.likes)
    push('Saving for', persona.savingGoal ?? persona.saving_goal)
    push('Money style', persona.spend_style ?? persona.spendStyle)
  } else {
    push('Kids', persona.kid_situation ?? persona.kids ?? persona.kidsCount)
    push('Main goal', persona.primary_goal ?? persona.goal)
    push('Parenting style', persona.parenting_style)
    push('Cares about', persona.concerns ?? persona.familyNotes)
  }
  return out
}

export function VoiceOnboarding({ role, name, onDone }: { role: 'parent' | 'kid'; name?: string; onDone: () => void }) {
  const avatar = useAvatar((s) => s.avatar)
  const companion = avatarDef(avatar)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)

  const [phase, setPhase] = useState<Phase>('ready')
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [transcript, setTranscript] = useState<Line[]>([])
  const [micOn, setMicOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [learned, setLearned] = useState<{ label: string; value: string }[]>([])

  const sockRef = useRef<LiveRtSocket | null>(null)
  const micRef = useRef<MicCaptureHandle | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const micOnRef = useRef(true)
  const replyBufRef = useRef('')
  const pendingUserRef = useRef('')
  const savedRef = useRef(false)
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, palLine, userLine])

  function teardown() {
    try { sockRef.current?.end() } catch { /* ignore */ }
    try { sockRef.current?.close() } catch { /* ignore */ }
    micRef.current?.stop()
    playerRef.current?.close()
    sockRef.current = null
    micRef.current = null
    playerRef.current = null
  }

  async function savePersona(persona: Record<string, unknown>) {
    if (savedRef.current) return
    savedRef.current = true
    setPhase('saving')
    // Build a friendly "here's what I learned" summary from the persona the
    // companion captured, so the user can see everything we now know.
    setLearned(summarisePersona(role, persona, name))
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: role, persona: { ...(account?.persona ?? {}), ...persona, ...(name?.trim() ? { name: name.trim() } : {}), onboarded: true } }),
      })
      updateAccount(res.account)
    } catch {
      /* still let them in — the gate re-syncs on next load */
    }
    // Stop the live session + audio so nothing keeps talking, then let the
    // user tap Continue when they're ready (the avatar stays for the moment).
    teardown()
    setPhase('done')
  }

  // Finish with just the name (mic denied / "I'd rather skip"). No dead-end.
  function finishWithName() {
    teardown()
    void savePersona({})
  }

  async function start() {
    if (startedRef.current) return
    startedRef.current = true
    setError(null)
    setPhase('connecting')
    const token = useAuthStore.getState().token
    const player = new PcmPlayer()
    playerRef.current = player
    await player.resume()
    try {
      micRef.current = await startMicCapture((pcm) => {
        if (micOnRef.current && sockRef.current?.isOpen()) sockRef.current.sendMicPcm(pcm)
      })
    } catch {
      setError(`I need your microphone so ${companion.name} can chat — or you can finish with just your name.`)
      setPhase('error')
      return
    }
    const mode = role === 'parent' ? 'onboard_parent' : 'onboard_kid'
    const sock = connectLiveRt(
      {
        onOpen: () => {
          const seed: Record<string, unknown> = { companion: companion.name }
          if (name?.trim()) seed.name = name.trim()
          sock.start(role, mode, seed, undefined, getVoiceKey())
          setPhase('live')
        },
        onUserTranscript: (t) => { setUserLine(t); pendingUserRef.current = t },
        onReplyDelta: (t) => { replyBufRef.current += t; setPalLine(replyBufRef.current); setSpeaking(true) },
        onTurnComplete: () => {
          const u = pendingUserRef.current.trim()
          const p = replyBufRef.current.trim()
          setTranscript((prev) => [
            ...prev,
            ...(u ? [{ id: tlId++, who: 'you' as const, text: u }] : []),
            ...(p ? [{ id: tlId++, who: 'pal' as const, text: p }] : []),
          ])
          pendingUserRef.current = ''
          replyBufRef.current = ''
          setUserLine('')
          setPalLine('')
          setSpeaking(false)
        },
        onInterrupted: () => { playerRef.current?.clear(); setSpeaking(false) },
        // MP3-only (ElevenLabs path) — avoids double/jarring audio.
        onPalAudioMp3: (mp3) => void playerRef.current?.enqueueEncoded(mp3),
        onPersona: (persona) => void savePersona(persona),
        onError: () => undefined,
      },
      token,
    )
    sockRef.current = sock
  }

  useEffect(() => () => teardown(), [])

  function toggleMic() {
    setMicOn((on) => {
      const next = !on
      micOnRef.current = next
      sockRef.current?.setMic(next)
      return next
    })
  }

  const mood: CompanionMood = speaking ? 'happy' : 'neutral'
  const statusLabel =
    phase === 'live' ? `Chatting with ${companion.name}`
      : phase === 'connecting' ? 'Connecting…'
      : phase === 'saving' ? 'Saving…'
      : phase === 'done' ? 'All set!'
      : phase === 'error' ? 'Mic needed'
      : `Meet ${companion.name}`

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OnboardBackdrop accent={companion.accent} />

      {/* Header */}
      <div className="relative z-10 flex flex-none items-center justify-center px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <span className="pv-glass pv-hairline rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ color: 'var(--pv-ink-2)' }}>
          {statusLabel}
        </span>
      </div>

      {/* Companion */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="relative" style={{ width: 'min(80vw, 320px)', height: 'min(54vh, 460px)' }}>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px]"
            style={{ background: companion.accent, opacity: speaking ? 0.42 : 0.26 }}
          />
          <Companion avatar={avatar} getLevel={() => playerRef.current?.getLevel() ?? 0} mood={mood} className="relative h-full w-full" />
          {phase === 'done' && (
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 16 }}
              className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                <Check size={24} strokeWidth={3} />
              </span>
              <span className="pv-title pv-tight">Nice to meet you!</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Full transcript (scrolls) */}
      {(phase === 'live' || transcript.length > 0) && (
        <div ref={scrollRef} className="pv-no-scrollbar relative z-10 flex-none space-y-2 overflow-y-auto px-5 pb-2" style={{ maxHeight: '28vh' }}>
          {transcript.map((l) => (
            l.who === 'you' ? (
              <div key={l.id} className="ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-sm font-medium" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>{l.text}</div>
            ) : (
              <div key={l.id} className="pv-glass max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed" style={{ borderBottomLeftRadius: 6 }}>{l.text}</div>
            )
          ))}
          {userLine && <div className="ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-sm font-medium" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)', opacity: 0.65 }}>{userLine}</div>}
          {palLine && <div className="pv-glass max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed" style={{ borderBottomLeftRadius: 6 }}>{palLine}</div>}
          {phase === 'live' && !palLine && !userLine && transcript.length === 0 && (
            <div className="text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>Say hi to {companion.name} 💬</div>
          )}
        </div>
      )}
      {error && (
        <div className="relative z-10 mx-5 mb-2 flex-none rounded-2xl px-3.5 py-2.5 text-center text-sm" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>{error}</div>
      )}

      {/* Action area */}
      <div className="relative z-10 flex flex-none items-center justify-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
        {phase === 'ready' && (
          <motion.button
            onClick={() => void start()}
            whileTap={{ scale: 0.96 }}
            className="pv-sheen flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full text-base font-bold"
            style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
          >
            <Sparkles size={18} /> Say hi to {companion.name}
          </motion.button>
        )}

        {phase === 'connecting' && (
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            <span className="h-5 w-5 animate-spin rounded-full" style={{ border: '2px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
            Waking up {companion.name}…
          </div>
        )}

        {phase === 'live' && (
          <button onClick={toggleMic} className="pv-press-lg flex flex-col items-center gap-1.5" aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
            <span className="flex h-16 w-16 items-center justify-center rounded-full" style={micOn ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}>
              {micOn ? <Mic size={26} /> : <MicOff size={26} />}
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{micOn ? 'Listening' : 'Muted'}</span>
          </button>
        )}

        {phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full max-w-sm flex-col items-stretch gap-3"
          >
            {learned.length > 0 && (
              <div className="pv-glass pv-hairline rounded-[var(--pv-r-lg)] px-4 py-3">
                <div className="pv-label mb-2" style={{ color: 'var(--pv-ink-3)' }}>Here’s what I learned about you</div>
                <div className="flex flex-col gap-1.5">
                  {learned.map((l) => (
                    <div key={l.label} className="flex items-baseline gap-2 text-sm">
                      <span className="shrink-0 font-bold" style={{ color: 'var(--pv-ink-3)' }}>{l.label}</span>
                      <span className="min-w-0 flex-1 text-right font-semibold" style={{ color: 'var(--pv-ink)' }}>{l.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <motion.button
              onClick={onDone}
              whileTap={{ scale: 0.96 }}
              className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
              style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
            >
              <Sparkles size={18} /> Continue to BrainPal
            </motion.button>
          </motion.div>
        )}

        {phase === 'error' && (
          <div className="flex w-full max-w-sm flex-col gap-2">
            <button onClick={() => { startedRef.current = false; void start() }} className="pv-press h-12 w-full rounded-full text-sm font-bold pv-glass pv-hairline" style={{ color: 'var(--pv-ink)' }}>
              Try again
            </button>
            <button onClick={finishWithName} className="pv-press-lg h-12 w-full rounded-full text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
              Finish with just my name
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
