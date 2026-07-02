/**
 * VoiceOnboarding — a fully voice, two-way onboarding. Your companion asks a
 * short set of warm, natural (but fixed) questions ONE AT A TIME, speaking each
 * in a consistent female voice and then listening on the mic. There is NO text
 * box in the flow — you answer by talking. The character lip-syncs while it
 * speaks and pulses while it listens, so it feels like a real conversation.
 *
 * When every question is answered we open a confirmation popup that shows
 * everything we now know about you; there — and only there — you can edit any
 * detail before we save the persona and finish.
 *
 * Reliability notes (why the mic used to fail / a man's voice used to speak):
 *  - Voices load asynchronously, so getVoices() is empty on the first call and
 *    the browser falls back to its default (often male). We cache voices via
 *    `voiceschanged` and always pick a female English voice.
 *  - SpeechRecognition needs an explicit mic permission grant on a user gesture;
 *    we warm it up with getUserMedia() the moment you tap Start.
 *  - We never listen while the companion is still speaking (avoids the mic
 *    hearing the TTS), and we finalise on a short silence so hands-free works.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Check, Sparkles, Volume2, Pencil, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { useAvatar, avatarDef } from '../../lib/avatar'
import { Companion, type CompanionMood } from '../../components/Companion'
import { OnboardBackdrop } from './OnboardBackdrop'

type Q = { key: string; prompt: string; label: string; optional?: boolean }

// Warm, natural — but fixed — questions. Role-specific. The companion greeting
// is prepended to the first one at runtime so it feels like a real hello.
const QUESTIONS: Record<'parent' | 'kid', Q[]> = {
  kid: [
    { key: 'age', label: 'Age', prompt: `Let's get to know each other! To start — how old are you?` },
    { key: 'grade', label: 'Grade', prompt: `Nice! And what grade are you in at school right now?` },
    { key: 'interests', label: 'Loves', prompt: `Cool. What do you love doing most — is it sport, gaming, art, music, or reading?` },
    { key: 'savingGoal', label: 'Saving for', prompt: `Love that. Last one — is there something special you're saving up for?` },
  ],
  parent: [
    { key: 'kidsCount', label: 'Kids', prompt: `Lovely to meet you. So I can set things up right — how many children do you have?` },
    { key: 'kids', label: 'Their names & ages', prompt: `Great. What are their names and ages?` },
    { key: 'goal', label: 'Main goal', prompt: `Perfect. What matters most to you right now — saving, chores, or study?` },
    { key: 'familyNotes', label: 'Family notes', prompt: `Got it. Anything else about your family I should keep in mind?`, optional: true },
  ],
}

// A few short acknowledgements so it feels conversational between questions.
const ACKS = ['Got it.', 'Love that.', 'Awesome.', 'Perfect.', 'Great.']

// Minimal Web Speech Recognition typing (not in lib.dom).
type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>
interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((e: { results: SpeechResultList }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start: () => void; stop: () => void; abort: () => void
}
type SpeechRecCtor = new () => SpeechRec

type Phase = 'ready' | 'asking' | 'review' | 'saving' | 'done'
type MicState = 'idle' | 'listening' | 'heard' | 'nomatch' | 'denied'

export function VoiceOnboarding({ role, name, onDone }: { role: 'parent' | 'kid'; name?: string; onDone: () => void }) {
  const avatar = useAvatar((s) => s.avatar)
  const companion = avatarDef(avatar)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)

  const questions = QUESTIONS[role]

  const [phase, setPhase] = useState<Phase>('ready')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [heard, setHeard] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [mic, setMic] = useState<MicState>('idle')
  const [draft, setDraft] = useState<Record<string, string>>({})

  const recRef = useRef<SpeechRec | null>(null)
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const heardRef = useRef('')
  const savedRef = useRef(false)

  const hasSpeech = typeof window !== 'undefined' && !!window.speechSynthesis
  const SpeechCtor = useMemo<SpeechRecCtor | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition
  }, [])
  const hasMic = !!SpeechCtor

  const q = questions[index]
  const isLast = index === questions.length - 1

  // Cache the voice list — it loads async, so the first getVoices() is empty.
  useEffect(() => {
    if (!hasSpeech) return
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() }
    load()
    window.speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => { window.speechSynthesis.removeEventListener?.('voiceschanged', load) }
  }, [hasSpeech])

  function pickVoice(): SpeechSynthesisVoice | undefined {
    const v = voicesRef.current
    if (!v.length) return undefined
    const isMale = /\b(male|man)\b|daniel|alex|fred|rishi|aaron|arthur|gordon|oliver|thomas|george|david|mark|guy/i
    const namedFemale = /samantha|karen|tessa|moira|fiona|serena|zira|susan|allison|ava|joanna|salli|kendra|kimberly|amy|emma|nicole|catherine|matilda|olivia|isha|zoe|female/i
    return (
      v.find((x) => /en-AU/i.test(x.lang) && namedFemale.test(x.name)) ??
      v.find((x) => /en-(AU|GB)/i.test(x.lang) && namedFemale.test(x.name)) ??
      v.find((x) => /^en/i.test(x.lang) && namedFemale.test(x.name)) ??
      v.find((x) => /en-(AU|GB|US)/i.test(x.lang) && !isMale.test(x.name)) ??
      v.find((x) => /^en/i.test(x.lang) && !isMale.test(x.name)) ??
      v.find((x) => /^en/i.test(x.lang))
    )
  }

  function stopListening() {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null }
    try { recRef.current?.abort() } catch { /* ignore */ }
    recRef.current = null
  }

  function teardown() {
    stopListening()
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    setSpeaking(false)
  }
  useEffect(() => () => teardown(), [])

  // Speak text in the cached female voice, then (optionally) open the mic.
  function speak(text: string, thenListen: boolean) {
    if (!hasSpeech) { if (thenListen) startListening(); return }
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.98
    u.pitch = 1.08
    const voice = pickVoice()
    if (voice) { u.voice = voice; u.lang = voice.lang }
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); if (thenListen) startListening() }
    u.onerror = () => { setSpeaking(false); if (thenListen) startListening() }
    // Some browsers need a tick after cancel() before speaking reliably.
    setTimeout(() => { try { synth.speak(u) } catch { setSpeaking(false); if (thenListen) startListening() } }, 60)
  }

  function startListening() {
    if (!hasMic || !SpeechCtor) { setMic('nomatch'); return }
    stopListening()
    setHeard('')
    heardRef.current = ''
    const rec = new SpeechCtor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e) => {
      let finalText = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        const txt = r[0]?.transcript ?? ''
        if ((r as { isFinal?: boolean }).isFinal) finalText += txt
        else interim += txt
      }
      const combined = (finalText + ' ' + interim).trim()
      if (combined) { heardRef.current = combined; setHeard(combined) }
      // Reset the silence timer on every bit of speech — finalise on a pause.
      if (silenceRef.current) clearTimeout(silenceRef.current)
      silenceRef.current = setTimeout(() => finalize(), 1600)
    }
    rec.onerror = (ev) => {
      const err = ev?.error
      if (err === 'not-allowed' || err === 'service-not-allowed') setMic('denied')
      else if (err === 'no-speech') setMic((m) => (m === 'listening' && !heardRef.current ? 'nomatch' : m))
      // 'aborted' is expected when we stop/next; ignore it.
    }
    rec.onend = () => {
      recRef.current = null
      // If the engine ended on its own, keep captured text (or prompt a retry).
      setMic((m) => (m === 'listening' ? (heardRef.current ? 'heard' : 'nomatch') : m))
    }
    recRef.current = rec
    setMic('listening')
    try { rec.start() } catch { setMic('idle') }
  }

  function finalize() {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null }
    try { recRef.current?.stop() } catch { /* ignore */ }
    recRef.current = null
    setMic((m) => (m === 'listening' ? (heardRef.current ? 'heard' : 'nomatch') : m))
  }

  function retry() {
    setHeard('')
    heardRef.current = ''
    setMic('idle')
    startListening()
  }

  async function begin() {
    // Warm up mic permission on the user gesture so recognition actually works.
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true })
      stream?.getTracks().forEach((t) => t.stop())
    } catch { /* permission denied — handled per-question */ }
    setPhase('asking')
    askAt(0, true)
  }

  function askAt(i: number, first = false) {
    setIndex(i)
    setHeard('')
    setMic('idle')
    const ack = first ? '' : ACKS[Math.floor(Math.random() * ACKS.length)] + ' '
    const hello = first ? `Hi${name?.trim() ? ` ${name.trim().split(' ')[0]}` : ''}, I'm ${companion.name}. ` : ''
    speak(hello + ack + questions[i].prompt, true)
  }

  function commitAndAdvance() {
    const value = heard.trim()
    const nextAnswers = { ...answers, [q.key]: value }
    setAnswers(nextAnswers)
    stopListening()
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    if (isLast) { openReview(nextAnswers); return }
    askAt(index + 1)
  }

  function skip() {
    const nextAnswers = { ...answers, [q.key]: '' }
    setAnswers(nextAnswers)
    stopListening()
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    if (isLast) { openReview(nextAnswers); return }
    askAt(index + 1)
  }

  function openReview(a: Record<string, string>) {
    teardown()
    setDraft({ name: name?.trim() ?? '', ...a })
    setPhase('review')
    speak(`Here's everything I've got. Have a quick look — you can tweak anything, then we're all set.`, false)
  }

  function buildPersona(d: Record<string, string>): Record<string, unknown> {
    const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined)
    const base: Record<string, unknown> = { onboarded: true, onboardAnswers: answers }
    if (clean(d.name)) base.name = d.name.trim()
    if (role === 'kid') {
      return { ...base, age: clean(d.age), grade: clean(d.grade), interests: clean(d.interests), savingGoal: clean(d.savingGoal) }
    }
    return { ...base, kidsCount: clean(d.kidsCount), kids: clean(d.kids), goal: clean(d.goal), familyNotes: clean(d.familyNotes) }
  }

  async function confirm() {
    if (savedRef.current) return
    savedRef.current = true
    teardown()
    setPhase('saving')
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: role, persona: { ...(account?.persona ?? {}), ...buildPersona(draft) } }),
      })
      updateAccount(res.account)
    } catch { /* still let them in — the gate re-syncs on next load */ }
    setPhase('done')
  }

  const mood: CompanionMood = speaking ? 'happy' : 'neutral'

  // Fields shown in the confirmation popup (label + editable value).
  const reviewFields = useMemo(() => {
    const base = [{ key: 'name', label: 'Your name' }]
    const rest = questions.map((qq) => ({ key: qq.key, label: qq.label }))
    return [...base, ...rest]
  }, [questions])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OnboardBackdrop accent={companion.accent} />

      {/* Header + progress */}
      <div className="relative z-10 flex flex-none flex-col items-center gap-2 px-5 pt-[max(16px,env(safe-area-inset-top))]">
        <span className="pv-glass pv-hairline rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ color: 'var(--pv-ink-2)' }}>
          {phase === 'asking' ? `Question ${index + 1} of ${questions.length}` : phase === 'review' ? 'Quick check' : phase === 'saving' ? 'Setting things up…' : phase === 'done' ? 'All set!' : `Meet ${companion.name}`}
        </span>
        {phase === 'asking' && (
          <div className="pv-progress w-full max-w-sm" role="progressbar" aria-valuenow={index + 1} aria-valuemin={0} aria-valuemax={questions.length}>
            <span style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
          </div>
        )}
      </div>

      {/* Companion (lip-syncs while speaking, glows while listening) */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="relative" style={{ width: 'min(78vw, 300px)', height: 'min(46vh, 400px)' }}>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px] transition-opacity duration-300"
            style={{ background: companion.accent, opacity: speaking ? 0.42 : mic === 'listening' ? 0.34 : 0.22 }}
          />
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

      {/* Question + live voice answer (NO text box) */}
      {phase === 'asking' && q && (
        <div className="relative z-10 flex-none px-5 pb-2">
          <div className="mx-auto w-full max-w-sm">
            {/* Companion's question */}
            <div className="pv-glass pv-hairline mb-3 flex items-start gap-2.5 rounded-2xl px-4 py-3" style={{ borderBottomLeftRadius: 6 }}>
              <button onClick={() => speak(q.prompt, true)} aria-label="Hear again" className="pv-press mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full" style={{ color: 'var(--pv-accent)' }}>
                <Volume2 size={16} />
              </button>
              <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--pv-ink)' }}>{q.prompt}</p>
            </div>

            {/* What you're saying (transcript bubble, right-aligned) */}
            <AnimatePresence>
              {heard && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 flex justify-end">
                  <p className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] font-semibold leading-snug" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', borderBottomRightRadius: 6 }}>
                    {heard}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mic control + status */}
            <div className="flex flex-col items-center gap-2">
              {mic === 'listening' && (
                <span className="text-xs font-bold" style={{ color: 'var(--pv-accent)' }}>Listening… just speak</span>
              )}
              {mic === 'nomatch' && (
                <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--pv-ink-3)' }}>
                  <AlertCircle size={13} /> I didn't catch that — tap the mic to try again
                </span>
              )}
              {mic === 'denied' && (
                <span className="flex items-center gap-1.5 text-center text-xs font-bold" style={{ color: 'var(--pv-neg)' }}>
                  <AlertCircle size={13} /> Mic is blocked. Allow microphone access in your browser, then tap the mic.
                </span>
              )}

              <div className="flex items-center gap-3">
                {/* Redo / start mic */}
                {(mic === 'heard') && (
                  <button onClick={retry} aria-label="Try again" className="pv-press flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
                    <RefreshCw size={18} />
                  </button>
                )}

                {/* Big mic button */}
                {mic !== 'heard' && (
                  <button
                    onClick={() => (mic === 'listening' ? finalize() : startListening())}
                    aria-label={mic === 'listening' ? 'Stop' : 'Speak'}
                    className={`pv-press-lg flex h-16 w-16 items-center justify-center rounded-full ${mic === 'listening' ? 'pv-live-pulse' : ''}`}
                    style={mic === 'listening'
                      ? { background: 'var(--pv-neg)', color: '#fff', boxShadow: 'var(--pv-shadow-pop)' }
                      : { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}
                  >
                    <Mic size={24} />
                  </button>
                )}

                {/* Continue (only once we've heard something) */}
                {mic === 'heard' && (
                  <button onClick={commitAndAdvance} aria-label={isLast ? 'Finish' : 'Next'} className="pv-press-lg flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-pop)' }}>
                    {isLast ? <Check size={24} strokeWidth={2.8} /> : <ArrowRight size={24} strokeWidth={2.8} />}
                  </button>
                )}
              </div>

              {q.optional && (
                <button onClick={skip} className="pv-press mt-1 text-xs font-bold" style={{ color: 'var(--pv-ink-3)' }}>Skip this one</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom action area */}
      <div className="relative z-10 flex flex-none items-center justify-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
        {phase === 'ready' && (
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            <motion.button onClick={begin} whileTap={{ scale: 0.96 }} className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}>
              <Sparkles size={18} /> Start talking with {companion.name}
            </motion.button>
            <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
              {hasMic ? 'A few quick questions, all by voice.' : 'Voice isn’t supported on this browser.'}
            </span>
          </div>
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

      {/* Confirmation popup — the ONLY place you can edit, before we finish */}
      <AnimatePresence>
        {phase === 'review' && (
          <motion.div className="absolute inset-0 z-20 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: 'rgba(17,17,20,0.32)', backdropFilter: 'blur(6px)' }}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="pv-glass max-h-[88%] w-full max-w-md overflow-y-auto rounded-t-[28px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
              style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: 'var(--pv-surface-3)' }} />
              <h2 className="pv-title pv-tight mb-1 text-center">Here’s what I’ve got</h2>
              <p className="mb-4 text-center text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Tweak anything, then you’re all set.</p>

              <div className="flex flex-col gap-2.5">
                {reviewFields.map((f) => (
                  <label key={f.key} className="pv-hairline flex flex-col gap-1 rounded-2xl px-4 py-2.5" style={{ background: 'var(--pv-surface-2)' }}>
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--pv-ink-3)' }}>
                      <Pencil size={11} /> {f.label}
                    </span>
                    <input
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      placeholder="Add a detail…"
                      className="w-full bg-transparent text-[15px] font-semibold outline-none"
                      style={{ color: 'var(--pv-ink)' }}
                    />
                  </label>
                ))}
              </div>

              <button onClick={confirm} className="pv-sheen mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}>
                <Check size={18} strokeWidth={2.8} /> Looks good — finish
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
