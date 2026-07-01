/**
 * VoiceOnboarding (scripted) — a short, fixed set of concrete questions your
 * companion asks BY VOICE, one at a time. You answer by speaking (mic) or by
 * typing in the text box — both always work. No free-form witty chatter: the
 * questions are fixed and role-specific (parent vs kid), then we build the
 * persona from the answers and finish.
 *
 * Full voice: the companion speaks each question (speechSynthesis) and listens
 * (speechRecognition); the live character lip-syncs while it talks. If speech
 * isn't available, the text box carries the whole flow — never a dead-end.
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Check, Sparkles, ArrowRight, Volume2 } from 'lucide-react'
import { motion } from 'motion/react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { useAvatar, avatarDef } from '../../lib/avatar'
import { Companion, type CompanionMood } from '../../components/Companion'
import { OnboardBackdrop } from './OnboardBackdrop'

type Q = { key: string; prompt: string; placeholder: string; optional?: boolean }

// Short, concrete, fixed questions — different for a parent and a kid.
const QUESTIONS: Record<'parent' | 'kid', Q[]> = {
  kid: [
    { key: 'age', prompt: 'How old are you?', placeholder: 'e.g. 11' },
    { key: 'grade', prompt: 'What grade are you in?', placeholder: 'e.g. Grade 6' },
    { key: 'interests', prompt: 'What do you like most — sport, gaming, art, music or reading?', placeholder: 'e.g. gaming and art' },
    { key: 'savingGoal', prompt: 'What are you saving up for?', placeholder: 'e.g. a new bike' },
  ],
  parent: [
    { key: 'kidsCount', prompt: 'How many kids do you have?', placeholder: 'e.g. 2' },
    { key: 'kids', prompt: 'What are their names and ages?', placeholder: 'e.g. Mia 9, Sam 12' },
    { key: 'goal', prompt: 'Your main goal — saving, chores, or study?', placeholder: 'e.g. saving and chores' },
    { key: 'familyNotes', prompt: 'Anything else we should know about your family?', placeholder: 'Optional — say “skip”', optional: true },
  ],
}

// Minimal Web Speech Recognition typing (not in lib.dom).
type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: SpeechResultList }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecCtor = new () => SpeechRec

type Phase = 'ready' | 'asking' | 'saving' | 'done'

export function VoiceOnboarding({ role, name, onDone }: { role: 'parent' | 'kid'; name?: string; onDone: () => void }) {
  const avatar = useAvatar((s) => s.avatar)
  const companion = avatarDef(avatar)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)

  const questions = QUESTIONS[role]

  const [phase, setPhase] = useState<Phase>('ready')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [input, setInput] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)

  const recRef = useRef<SpeechRec | null>(null)
  const savedRef = useRef(false)
  const hasSpeech = typeof window !== 'undefined' && !!window.speechSynthesis
  const hasMic = typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecCtor }).webkitSpeechRecognition)

  const q = questions[index]
  const isLast = index === questions.length - 1

  function stopListening() {
    try { recRef.current?.stop() } catch { /* ignore */ }
    recRef.current = null
    setListening(false)
  }

  function teardown() {
    stopListening()
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    setSpeaking(false)
  }
  useEffect(() => () => teardown(), [])

  // Speak a question in a warm voice; auto-open the mic when it finishes.
  function speak(text: string, thenListen: boolean) {
    if (!hasSpeech) { if (thenListen) startListening(); return }
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    u.pitch = 1.06
    const voices = synth.getVoices()
    const preferred = voices.find((v) => /en-AU/i.test(v.lang) && /female|zira|karen|samantha|tessa/i.test(v.name))
      ?? voices.find((v) => /en-(AU|GB)/i.test(v.lang))
      ?? voices.find((v) => /^en/i.test(v.lang))
    if (preferred) u.voice = preferred
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); if (thenListen) startListening() }
    u.onerror = () => { setSpeaking(false); if (thenListen) startListening() }
    synth.speak(u)
  }

  function startListening() {
    if (!hasMic) return
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    try { recRef.current?.stop() } catch { /* ignore */ }
    const rec = new Ctor()
    rec.lang = 'en-AU'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t) }
    rec.onend = () => { setListening(false); recRef.current = null }
    rec.onerror = () => { setListening(false); recRef.current = null }
    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false); recRef.current = null }
  }

  function toggleMic() {
    if (listening) stopListening()
    else startListening()
  }

  function begin() {
    setPhase('asking')
    setIndex(0)
    speak(questions[0].prompt, true)
  }

  function next() {
    stopListening()
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    const value = input.trim()
    const nextAnswers = { ...answers, [q.key]: value }
    setAnswers(nextAnswers)
    setInput('')
    if (isLast) { void finish(nextAnswers); return }
    const ni = index + 1
    setIndex(ni)
    speak(questions[ni].prompt, true)
  }

  function repeat() {
    speak(q.prompt, true)
  }

  function buildPersona(a: Record<string, string>): Record<string, unknown> {
    const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined)
    const base: Record<string, unknown> = { onboarded: true, onboardAnswers: a }
    if (name?.trim()) base.name = name.trim()
    if (role === 'kid') {
      return { ...base, age: clean(a.age), grade: clean(a.grade), interests: clean(a.interests), savingGoal: clean(a.savingGoal) }
    }
    return { ...base, kidsCount: clean(a.kidsCount), kids: clean(a.kids), goal: clean(a.goal), familyNotes: clean(a.familyNotes) }
  }

  async function finish(a: Record<string, string>) {
    if (savedRef.current) return
    savedRef.current = true
    teardown()
    setPhase('saving')
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: role, persona: { ...(account?.persona ?? {}), ...buildPersona(a) } }),
      })
      updateAccount(res.account)
    } catch { /* still let them in — the gate re-syncs on next load */ }
    setPhase('done')
  }

  const mood: CompanionMood = speaking ? 'happy' : 'neutral'
  const canSkip = q?.optional

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OnboardBackdrop accent={companion.accent} />

      {/* Header + progress */}
      <div className="relative z-10 flex flex-none flex-col items-center gap-2 px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <span className="pv-glass pv-hairline rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ color: 'var(--pv-ink-2)' }}>
          {phase === 'asking' ? `Question ${index + 1} of ${questions.length}` : phase === 'saving' ? 'Setting things up…' : phase === 'done' ? 'All set!' : `Meet ${companion.name}`}
        </span>
        {phase === 'asking' && (
          <div className="pv-progress w-full max-w-sm" role="progressbar" aria-valuenow={index + 1} aria-valuemin={0} aria-valuemax={questions.length}>
            <span style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
          </div>
        )}
      </div>

      {/* Companion (lip-syncs while speaking) */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="relative" style={{ width: 'min(78vw, 300px)', height: 'min(46vh, 400px)' }}>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px]" style={{ background: companion.accent, opacity: speaking ? 0.42 : 0.24 }} />
          <Companion avatar={avatar} getLevel={() => (speaking ? 0.35 + Math.random() * 0.45 : 0)} mood={mood} className="relative h-full w-full" />
          {phase === 'done' && (
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }} className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                <Check size={24} strokeWidth={3} />
              </span>
              <span className="pv-title pv-tight">Nice to meet you{name?.trim() ? `, ${name.trim().split(' ')[0]}` : ''}!</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* The current question + answer box */}
      {phase === 'asking' && q && (
        <div className="relative z-10 flex-none px-5 pb-2">
          <div className="mx-auto w-full max-w-sm">
            <div className="pv-glass pv-hairline mb-3 flex items-start gap-2.5 rounded-2xl px-4 py-3" style={{ borderBottomLeftRadius: 6 }}>
              <button onClick={repeat} aria-label="Hear again" className="pv-press mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full" style={{ color: 'var(--pv-accent)' }}>
                <Volume2 size={16} />
              </button>
              <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--pv-ink)' }}>{q.prompt}</p>
            </div>

            <div className="pv-composer pv-glass pv-hairline flex items-center gap-2 rounded-full p-1.5 pl-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (input.trim() || canSkip)) next() }}
                placeholder={listening ? 'Listening…' : q.placeholder}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                style={{ color: 'var(--pv-ink)' }}
              />
              {hasMic && (
                <button onClick={toggleMic} aria-label={listening ? 'Stop' : 'Speak'} className={`pv-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${listening ? 'pv-live-pulse' : ''}`} style={listening ? { background: 'var(--pv-neg)', color: '#fff' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
              <button onClick={next} disabled={!input.trim() && !canSkip} aria-label={isLast ? 'Finish' : 'Next'} className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                {isLast ? <Check size={18} strokeWidth={2.8} /> : <ArrowRight size={18} strokeWidth={2.8} />}
              </button>
            </div>
            {canSkip && !input.trim() && (
              <button onClick={next} className="pv-press mx-auto mt-2 block text-xs font-bold" style={{ color: 'var(--pv-ink-3)' }}>Skip</button>
            )}
          </div>
        </div>
      )}

      {/* Action area */}
      <div className="relative z-10 flex flex-none items-center justify-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
        {phase === 'ready' && (
          <motion.button onClick={begin} whileTap={{ scale: 0.96 }} className="pv-sheen flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full text-base font-bold" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}>
            <Sparkles size={18} /> Start with {companion.name}
          </motion.button>
        )}
        {phase === 'saving' && (
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            <span className="h-5 w-5 animate-spin rounded-full" style={{ border: '2px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
            Building your BrainPal…
          </div>
        )}
        {phase === 'done' && (
          <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={onDone} whileTap={{ scale: 0.96 }} className="pv-sheen flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full text-base font-bold" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}>
            <Sparkles size={18} /> Continue to BrainPal
          </motion.button>
        )}
      </div>
    </div>
  )
}
