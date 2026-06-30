/**
 * VoiceOnboarding (light) — the chosen companion interviews the user by voice
 * and fills the persona via its save_persona tool. Renders the selected
 * companion live (GLB or VRM) with lip-sync, in the `.pv` design language.
 * "Type instead" falls back to the tap-based PersonaChat.
 *
 * Pipeline mirrors pay/screens/LiveSession: connectLiveRt (mode onboard_*) +
 * mic capture + PcmPlayer, honouring the user's chosen voice.
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Keyboard, Check } from 'lucide-react'
import { motion } from 'motion/react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { connectLiveRt, type LiveRtSocket } from '../../lib/liveRt'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../../lib/liveAudio'
import { getVoiceKey } from '../../lib/voicePrefs'
import { useAvatar, avatarDef } from '../../lib/avatar'
import { Companion, type CompanionMood } from '../../components/Companion'

type Phase = 'connecting' | 'live' | 'saving' | 'done' | 'error'

export function VoiceOnboarding({
  role,
  onDone,
  onTypeInstead,
}: {
  role: 'parent' | 'kid'
  onDone: () => void
  onTypeInstead: () => void
}) {
  const avatar = useAvatar((s) => s.avatar)
  const companion = avatarDef(avatar)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)

  const [phase, setPhase] = useState<Phase>('connecting')
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sockRef = useRef<LiveRtSocket | null>(null)
  const micRef = useRef<MicCaptureHandle | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const micOnRef = useRef(true)
  const replyBufRef = useRef('')
  const savedRef = useRef(false)

  async function savePersona(persona: Record<string, unknown>) {
    if (savedRef.current) return
    savedRef.current = true
    setPhase('saving')
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: role, persona: { ...(account?.persona ?? {}), ...persona, onboarded: true } }),
      })
      updateAccount(res.account)
    } catch {
      /* still let them in — the gate re-syncs on next load */
    }
    setPhase('done')
    setTimeout(onDone, 1600)
  }

  useEffect(() => {
    let disposed = false
    async function begin() {
      const token = useAuthStore.getState().token
      const player = new PcmPlayer()
      playerRef.current = player
      await player.resume()
      try {
        micRef.current = await startMicCapture((pcm) => {
          if (micOnRef.current && sockRef.current?.isOpen()) sockRef.current.sendMicPcm(pcm)
        })
      } catch {
        setError(`I need your microphone so ${companion.name} can chat. Allow it, or type your answers instead.`)
        setPhase('error')
        return
      }
      if (disposed) return
      const mode = role === 'parent' ? 'onboard_parent' : 'onboard_kid'
      const sock = connectLiveRt(
        {
          onOpen: () => {
            sock.start(role, mode, undefined, undefined, getVoiceKey())
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
          onPalAudio: (pcm) => playerRef.current?.enqueue(pcm),
          onPalAudioMp3: (mp3) => void playerRef.current?.enqueueEncoded(mp3),
          onPersona: (persona) => void savePersona(persona),
          onError: () => undefined,
        },
        token,
      )
      sockRef.current = sock
    }
    void begin()
    return () => {
      disposed = true
      try { sockRef.current?.end() } catch { /* ignore */ }
      try { sockRef.current?.close() } catch { /* ignore */ }
      micRef.current?.stop()
      playerRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    phase === 'live' ? `Meeting ${companion.name}` : phase === 'saving' ? 'Saving…' : phase === 'done' ? 'All set!' : phase === 'error' ? 'Mic needed' : 'Connecting…'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* soft accent wash from the companion */}
      <div
        className="absolute inset-x-0 top-0 z-0 h-2/3"
        aria-hidden
        style={{ background: `radial-gradient(80% 70% at 50% 0%, ${companion.accent}33, transparent 75%)` }}
      />

      {/* Header */}
      <div className="relative z-10 flex flex-none items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <span className="pv-glass pv-hairline rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ color: 'var(--pv-ink-2)' }}>
          {statusLabel}
        </span>
        <button onClick={onTypeInstead} className="pv-press pv-glass-soft flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ color: 'var(--pv-ink-2)' }}>
          <Keyboard size={14} /> Type instead
        </button>
      </div>

      {/* Companion */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="relative" style={{ width: 'min(78vw, 300px)', height: 'min(52vh, 440px)' }}>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px]"
            style={{ background: companion.accent, opacity: speaking ? 0.4 : 0.24 }}
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

      {/* Captions */}
      <div className="relative z-10 flex-none space-y-2 px-5 pb-2">
        {userLine && (
          <div className="ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-sm font-medium" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
            {userLine}
          </div>
        )}
        {palLine ? (
          <div className="pv-glass max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed" style={{ borderBottomLeftRadius: 6 }}>
            {palLine}
          </div>
        ) : (
          phase === 'live' && (
            <div className="text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>
              Say hi to {companion.name} — {role === 'kid' ? "they'll ask you a few quick things" : "they'll ask a few quick things about your family"} 💬
            </div>
          )
        )}
        {error && (
          <div className="rounded-2xl px-3.5 py-2.5 text-center text-sm" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
            {error}
            <button onClick={onTypeInstead} className="mt-2 block w-full rounded-full py-2 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>
              Type my answers instead
            </button>
          </div>
        )}
      </div>

      {/* Mic */}
      {phase !== 'error' && (
        <div className="relative z-10 flex flex-none items-center justify-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
          <button onClick={toggleMic} className="pv-press-lg flex flex-col items-center gap-1.5" aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={micOn
                ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
                : { background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}
            >
              {micOn ? <Mic size={26} /> : <MicOff size={26} />}
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{micOn ? 'Listening' : 'Muted'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
