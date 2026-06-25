import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Keyboard, Check, Sparkles } from 'lucide-react'
import { useAuthStore, type Account } from '../stores/auth'
import { connectLiveRt, type LiveRtSocket } from '../lib/liveRt'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../lib/liveAudio'
import { avatarSrc, useAvatar } from '../lib/avatar'
import { api } from '../lib/api'
import { VrmCompanion, type CompanionMood } from './VrmCompanion'

/** Intro chooser: talk to Mika (voice) or fill it in (wizard). */
export function OnboardChooser({ role, onVoice, onType }: { role: 'parent' | 'kid'; onVoice: () => void; onType: () => void }) {
  const who = role === 'kid' ? 'you' : 'your family'
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-6">
      <div className="mb-2 flex justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl text-white glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>
          <Sparkles size={30} />
        </span>
      </div>
      <h1 className="text-center text-2xl font-extrabold text-ink">Let's set up your companion</h1>
      <p className="mx-auto mt-2 max-w-xs text-center text-muted">Mika just needs to get to know {who} — it takes about a minute.</p>
      <div className="mt-8 flex flex-col gap-3">
        <button onClick={onVoice} className="press-lg sheen flex items-center gap-3 rounded-2xl p-4 text-left text-on-accent glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>
          <Mic size={22} />
          <span className="flex-1">
            <span className="block font-bold">Chat with Mika</span>
            <span className="block text-sm opacity-90">Just talk — she'll ask a few quick questions</span>
          </span>
        </button>
        <button onClick={onType} className="press grad-border flex items-center gap-3 rounded-2xl p-4 text-left text-ink" style={{ backgroundImage: 'var(--grad-card)' }}>
          <Keyboard size={22} className="text-muted" />
          <span className="flex-1">
            <span className="block font-bold">Type it in</span>
            <span className="block text-sm text-muted">Prefer to tap through a few questions</span>
          </span>
        </button>
      </div>
    </div>
  )
}

/**
 * Voice-led onboarding: Mika interviews the user, then her save_persona tool
 * fills the persona automatically. `onTypeInstead` falls back to the wizard.
 */
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
  const updateAccount = useAuthStore((s) => s.updateAccount)

  const [phase, setPhase] = useState<'connecting' | 'live' | 'saving' | 'done' | 'error'>('connecting')
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
        body: JSON.stringify({ accountType: role, persona: { ...persona, onboarded: true } }),
      })
      updateAccount(res.account)
    } catch {
      /* still let them in */
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
        setError('I need your microphone to chat. Allow it, or type your answers instead.')
        setPhase('error')
        return
      }
      if (disposed) return
      const mode = role === 'parent' ? 'onboard_parent' : 'onboard_kid'
      const sock = connectLiveRt(
        {
          onOpen: () => {
            sock.start(role, mode)
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#06100d] to-[#0b0b0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
          {phase === 'live' ? 'Meeting Mika' : phase === 'saving' ? 'Saving…' : phase === 'done' ? 'All set!' : 'Connecting…'}
        </span>
        <button onClick={onTypeInstead} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur active:scale-95">
          <Keyboard size={14} /> Type instead
        </button>
      </div>

      {/* Mika */}
      <div className="relative flex-1">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl" />
        <VrmCompanion src={avatarSrc(avatar)} getLevel={() => playerRef.current?.getLevel() ?? 0} mood={mood} className="absolute inset-0" />
        {phase === 'done' && (
          <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
            <span className="animate-scale-in flex h-14 w-14 items-center justify-center rounded-full text-on-accent glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}><Check size={28} strokeWidth={3} /></span>
            <span className="font-bold">Nice to meet you!</span>
          </div>
        )}
      </div>

      {/* Captions */}
      <div className="space-y-2 px-5 pb-2">
        {userLine && <div className="ml-auto max-w-[85%] rounded-2xl bg-white/15 px-3.5 py-2 text-sm backdrop-blur">{userLine}</div>}
        {palLine ? (
          <div className="max-w-[90%] rounded-2xl border border-accent/50 bg-black/65 px-3.5 py-2.5 text-[15px] italic leading-relaxed backdrop-blur">{palLine}</div>
        ) : (
          phase === 'live' && <div className="text-center text-sm text-white/70">Say hi to Mika — she'll ask you a few quick things 💬</div>
        )}
        {error && <div className="rounded-2xl bg-danger/20 px-3.5 py-2 text-center text-sm">{error}</div>}
      </div>

      {/* Mic */}
      <div className="flex items-center justify-center p-6">
        <button onClick={toggleMic} className="press-lg flex flex-col items-center gap-1.5">
          <span className={`flex h-16 w-16 items-center justify-center rounded-full backdrop-blur ${micOn ? 'text-on-accent glow-accent' : 'border border-white/15 bg-black/60'}`} style={micOn ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}>
            {micOn ? <Mic size={26} /> : <MicOff size={26} />}
          </span>
          <span className="text-xs font-semibold text-white/80">{micOn ? 'Listening' : 'Muted'}</span>
        </button>
      </div>
    </div>
  )
}
