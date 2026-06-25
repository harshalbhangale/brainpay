/**
 * VoiceOnboarding (light) — Mika interviews the user; her save_persona tool
 * fills the persona automatically. Same realtime pipeline as the dark app,
 * restyled to `.pv`. `onTypeInstead` falls back to the wizard.
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Keyboard, Check } from 'lucide-react'
import { useAuthStore, type Account } from '../../stores/auth'
import { connectLiveRt, type LiveRtSocket } from '../../lib/liveRt'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../../lib/liveAudio'
import { avatarSrc, useAvatar } from '../../lib/avatar'
import { api } from '../../lib/api'
import { VrmCompanion, type CompanionMood } from '../../components/VrmCompanion'

export function VoiceOnboarding({ role, onDone, onTypeInstead }: { role: 'parent' | 'kid'; onDone: () => void; onTypeInstead: () => void }) {
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
      const res = await api<{ account: Account }>('/me', { method: 'PATCH', body: JSON.stringify({ accountType: role, persona: { ...persona, onboarded: true } }) })
      updateAccount(res.account)
    } catch { /* still let them in */ }
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
          onOpen: () => { sock.start(role, mode); setPhase('live') },
          onUserTranscript: (t) => setUserLine(t),
          onReplyDelta: (t) => { replyBufRef.current += t; setPalLine(replyBufRef.current); setSpeaking(true) },
          onTurnComplete: () => { replyBufRef.current = ''; setSpeaking(false) },
          onInterrupted: () => { playerRef.current?.clear(); setSpeaking(false) },
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
          {phase === 'live' ? 'Meeting Mika' : phase === 'saving' ? 'Saving…' : phase === 'done' ? 'All set!' : 'Connecting…'}
        </span>
        <button onClick={onTypeInstead} className="pv-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
          <Keyboard size={14} /> Type instead
        </button>
      </div>

      <div className="relative flex-1">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'var(--pv-accent-soft)' }} />
        <VrmCompanion src={avatarSrc(avatar)} getLevel={() => playerRef.current?.getLevel() ?? 0} mood={mood} className="absolute inset-0" />
        {phase === 'done' && (
          <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
            <span className="pv-scale-in flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}><Check size={28} strokeWidth={3} /></span>
            <span className="font-bold">Nice to meet you!</span>
          </div>
        )}
      </div>

      <div className="space-y-2 px-5 pb-2">
        {userLine && <div className="ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-sm" style={{ background: 'var(--pv-surface-2)' }}>{userLine}</div>}
        {palLine ? (
          <div className="max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[15px] italic leading-relaxed" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>{palLine}</div>
        ) : (
          phase === 'live' && <div className="text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>Say hi to Mika — she'll ask you a few quick things 💬</div>
        )}
        {error && <div className="rounded-2xl px-3.5 py-2 text-center text-sm font-semibold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>{error}</div>}
      </div>

      <div className="flex items-center justify-center px-6 pb-8 pt-2">
        <button onClick={toggleMic} className="pv-press-lg flex flex-col items-center gap-1.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full" style={micOn ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}>
            {micOn ? <Mic size={26} /> : <MicOff size={26} />}
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-2)' }}>{micOn ? 'Listening' : 'Muted'}</span>
        </button>
      </div>
    </div>
  )
}
