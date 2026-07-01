/**
 * StudyChat — StudyPal as a live avatar chat (camera off), hosted by Matilda.
 * ───────────────────────────────────────────────────────────────────────────
 * The whole StudyPal experience is a conversation with Matilda (the reused
 * companion). She sits in the BACKGROUND; the chat floats in front. She greets,
 * onboards in-chat, and drives learning ONE step at a time — the next action
 * button appears only when it's relevant (cards → quiz → interview).
 *
 * Onboarding copy is deliberately short, neutral and factual (warmth from tone,
 * not canned sentiment); a progress bar tracks it question-by-question, and a
 * clear "Start studying" button gates the finish. Talking about a topic MAKES A
 * DECK (real pipeline) and offers a button — it never dumps card text into chat.
 * Mic / camera launch the existing live avatar session as Matilda.
 */
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { create } from 'zustand'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Sparkles, Mic, Camera, Send as SendIcon, Check, Plus, GraduationCap, ChevronDown, ArrowRight, Trophy, Bookmark } from 'lucide-react'
import { Companion } from '../../components/Companion'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { usePalCharacter } from './palCharacters'
import { GRADES, AU_STATES, subjectsForGrade, subjectEmoji, curriculumForState } from './subjects'
import { AttachButton, AttachTray } from '../components/AttachControls'
import { useAttachments, documentText, attachmentSummary, visionImages } from '../lib/attachments'

const LiveSession = lazy(() => import('../screens/LiveSession').then((m) => ({ default: m.LiveSession })))

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type InterviewRow = { id: string; score: number | null; summary: string | null; brainsEarned: number | null }

type ActionKind = 'cards' | 'quiz' | 'interview' | 'pick' | 'demo' | 'proceed' | 'setup'
type Action = { label: string; emoji?: string; kind: ActionKind; topicId?: string; title?: string; chapter?: string }
type CMsg = {
  id: string
  who: 'matilda' | 'you'
  text: string
  actions?: Action[]
  result?: { score: number | null; summary?: string | null }
  images?: string[]
}

let mid = 1
const uid = () => `sc${mid++}`

// Minimal Web Speech API typing (not in lib.dom) for mic dictation.
type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: SpeechResultList }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecCtor = new () => SpeechRec

type StudyChatState = {
  messages: CMsg[]
  pending: 'cards' | 'quiz' | 'interview' | null
  activeTopicId: string | null
  activeTopicTitle: string | null
  push: (m: CMsg) => void
  setPending: (p: StudyChatState['pending']) => void
  setActive: (id: string | null, title: string | null) => void
  reset: () => void
}
const useStudyChatStore = create<StudyChatState>((set) => ({
  messages: [],
  pending: null,
  activeTopicId: null,
  activeTopicTitle: null,
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setPending: (pending) => set({ pending }),
  setActive: (activeTopicId, activeTopicTitle) => set({ activeTopicId, activeTopicTitle }),
  reset: () => set({ messages: [], pending: null, activeTopicId: null, activeTopicTitle: null }),
}))

export function StudyChat({ onSwitchPal, onOpenCards, onQuiz, onInterview, onDemo, demoBusy, onSetup, onSavedAll }: {
  onSwitchPal?: () => void
  onOpenCards: (topicId: string, chapter?: string) => void
  onQuiz: (topicId: string) => void
  onInterview: (topicId: string) => void
  onDemo: () => void
  demoBusy: boolean
  onSetup: () => void
  onSavedAll?: () => void
}) {
  const qc = useQueryClient()
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const name = ((account?.persona?.name as string) || '').trim().split(' ')[0] || ''
  const savedGrade = (account?.persona?.grade as string) || ''

  const ch = usePalCharacter('studypal')
  const { data: topicsData, isLoading } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })
  const { data: savedData } = useQuery({ queryKey: ['study-saved-count'], queryFn: () => api<{ cards: unknown[]; dueCount: number }>('/study/cards/saved') })
  const savedCount = savedData?.cards?.length ?? 0
  const savedDue = savedData?.dueCount ?? 0

  const store = useStudyChatStore()
  const messages = store.messages

  const [ask, setAsk] = useState<null | 'grade' | 'state' | 'subjects'>(null)
  const [grade, setGrade] = useState(savedGrade)
  const [auState, setAuState] = useState((account?.persona?.state as string) || '')
  const [subjects, setSubjects] = useState<string[]>([])
  const [building, setBuilding] = useState(false)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bootRef = useRef(false)
  const postBuildRef = useRef<Topic[] | null>(null)
  const att = useAttachments()

  useEffect(() => () => { try { recRef.current?.stop() } catch { /* ignore */ } }, [])

  // Mic = dictation (speech → text). Falls back to the live voice session if
  // the browser has no SpeechRecognition.
  function toggleDictation() {
    if (listening) { try { recRef.current?.stop() } catch { /* ignore */ } return }
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) { setLive({ camera: false }); return }
    const rec = new Ctor()
    rec.lang = 'en-AU'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setInput(t)
    }
    rec.onend = () => { setListening(false); recRef.current = null }
    rec.onerror = () => { setListening(false); recRef.current = null }
    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false); recRef.current = null }
  }

  const say = (text: string, actions?: Action[], result?: CMsg['result']) => store.push({ id: uid(), who: 'matilda', text, actions, result })
  const me = (text: string, images?: string[]) => store.push({ id: uid(), who: 'you', text, images })

  // Onboarding step tracking → progress bar (advances per answered question).
  const stepsList: ReadonlyArray<'grade' | 'state' | 'subjects'> = savedGrade ? ['subjects'] : ['grade', 'state', 'subjects']
  const totalSteps = stepsList.length
  const currentStep = ask ? Math.max(1, stepsList.indexOf(ask) + 1) : totalSteps
  const showProgress = !!ask || building

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, ask, sending, building])

  useEffect(() => {
    if (isLoading || bootRef.current) return
    bootRef.current = true
    const topics = topicsData?.topics ?? []
    if (store.pending) { void followUp(store.pending, topics); store.setPending(null); return }
    if (store.messages.length > 0) return
    if (topics.length === 0) beginOnboarding()
    else beginHome(topics)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  function beginOnboarding() {
    if (savedGrade) {
      say(`Hi${name ? ` ${name}` : ''}. I'm Matilda. Let's add your subjects.`)
      setAsk('subjects'); say('Which subjects do you want to study?')
    } else {
      say(`Hi${name ? ` ${name}` : ''}. I'm Matilda. I'll set up your study space — three quick questions.`)
      setAsk('grade'); say('What year are you in?')
    }
  }

  function beginHome(topics: Topic[]) {
    const ready = topics.filter((t) => t.totalCards > 0)
    const masteryPct = (t: Topic) => (t.totalCards > 0 ? (t.totalCards - t.cardsDue) / t.totalCards : 1)
    const target = ready.length ? [...ready].sort((a, b) => masteryPct(a) - masteryPct(b))[0] : topics[0]
    store.setActive(target.id, target.title)
    const line = ready.length && target.cardsDue > 0
      ? `${name ? `${name}, ` : ''}you have ${target.cardsDue} card${target.cardsDue !== 1 ? 's' : ''} to review in ${target.title}.`
      : `Ready to study ${target.title}? Or type any topic and I'll build a deck.`
    say(line, [{ label: `Review ${target.title}`, emoji: '📖', kind: 'cards', topicId: target.id, title: target.title }])
    const others = topics.filter((t) => t.id !== target.id)
    if (others.length > 0) {
      say('Or pick another subject:', [
        ...others.slice(0, 5).map((t) => ({ label: t.title, emoji: t.emoji, kind: 'pick' as const, topicId: t.id, title: t.title })),
        { label: 'Try WWI demo', emoji: '🏛️', kind: 'demo' },
      ])
    }
  }

  async function build() {
    setBuilding(true)
    try {
      const persona = { ...(account?.persona ?? {}), grade, ...(auState ? { state: auState, curriculum: curriculumForState(auState) } : {}) }
      try {
        const res = await api<{ account: Account }>('/me', { method: 'PATCH', body: JSON.stringify({ persona }) })
        updateAccount(res.account)
      } catch { /* keep going — decks still build */ }
      const created: Topic[] = []
      for (const subject of subjects) {
        const emoji = subjectEmoji(subject)
        const { topic } = await api<{ topic: { id: string } }>('/study/topics', { method: 'POST', body: JSON.stringify({ title: subject, emoji }) })
        const content = `Generate key concepts, important definitions and study material for:\nSubject: ${subject}\nGrade: ${grade} (Australia)\nCurriculum: ${auState ? curriculumForState(auState) : 'ACARA'}${auState ? ` — ${auState}` : ''}\n\nUse Australian curriculum terminology, spelling and examples. Create comprehensive study material covering the most important topics for this grade level.`
        await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify({ title: `${subject} concepts`, fileUrl: 'text://inline', fileType: 'text', content }) })
        created.push({ id: topic.id, title: subject, emoji, cardsDue: 0, totalCards: 0 })
      }
      qc.invalidateQueries({ queryKey: ['study-topics'] })
      qc.invalidateQueries({ queryKey: ['study-stats'] })
      setBuilding(false)
      if (created.length > 0) {
        postBuildRef.current = created
        store.setActive(created[0].id, created[0].title)
        say(`You're all set — ${created.length} deck${created.length > 1 ? 's' : ''} on the way.`, [{ label: 'Start studying', kind: 'proceed' }])
      } else {
        say('Set up. Tell me a topic and I’ll build a deck, or add a subject with the + button.')
      }
    } catch {
      setBuilding(false)
      setAsk('subjects')
      say('That didn’t go through. Check your connection and tap Build again.')
    }
  }

  async function followUp(kind: 'cards' | 'quiz' | 'interview', topics: Topic[]) {
    const id = store.activeTopicId
    const title = store.activeTopicTitle ?? 'this'
    if (kind === 'cards') {
      say(`Cards done. Want a quick quiz on ${title}?`, id ? [{ label: 'Quiz me', emoji: '🧠', kind: 'quiz', topicId: id, title }] : [])
    } else if (kind === 'quiz') {
      say(`Quiz done. Ready for an interview on ${title}?`, id ? [{ label: 'Start interview', emoji: '🎙️', kind: 'interview', topicId: id, title }] : [])
    } else {
      say('Interview complete. Here’s your result:')
      if (id) {
        try {
          const res = await api<{ interviews: InterviewRow[] }>(`/study/interviews?topicId=${id}`)
          const latest = res.interviews?.[0]
          if (latest) say('', undefined, { score: latest.score, summary: latest.summary })
        } catch { /* result card optional */ }
      }
      const others = topics.filter((t) => t.id !== id)
      say('What next?', [
        ...(id ? [{ label: 'Review cards', emoji: '📖', kind: 'cards' as const, topicId: id, title }] : []),
        ...others.slice(0, 4).map((t) => ({ label: t.title, emoji: t.emoji, kind: 'pick' as const, topicId: t.id, title: t.title })),
      ])
    }
  }

  function runAction(a: Action) {
    if (a.kind === 'setup') { onSetup(); return }
    if (a.kind === 'proceed') { beginHome(postBuildRef.current ?? topicsData?.topics ?? []); return }
    if (a.kind === 'demo') { me('World War I demo'); store.setPending('cards'); onDemo(); return }
    if (a.kind === 'pick' && a.topicId) {
      store.setActive(a.topicId, a.title ?? null)
      me(a.title ?? 'this subject')
      say(`${a.title ?? 'Subject'} it is — let's start with the key cards, then I'll quiz you.`, [{ label: 'Start studying', emoji: '📖', kind: 'cards', topicId: a.topicId, title: a.title }])
      return
    }
    if (!a.topicId) return
    store.setActive(a.topicId, a.title ?? null)
    if (a.kind === 'cards') { me('Open the cards'); store.setPending('cards'); onOpenCards(a.topicId, a.chapter) }
    else if (a.kind === 'quiz') { me('Quiz me'); store.setPending('quiz'); onQuiz(a.topicId) }
    else if (a.kind === 'interview') { me('Start interview'); store.setPending('interview'); onInterview(a.topicId) }
  }

  // Onboarding answers — short, one question at a time.
  const onGrade = (g: string) => { me(g); setGrade(g); setAsk('state'); say('Which state are you in?') }
  const onStatePick = (s: string | null) => {
    me(s ?? 'Skip'); if (s) setAuState(s)
    setAsk('subjects'); say(`I'll use the ${curriculumForState(s ?? undefined)} curriculum. Which subjects do you want to study?`)
  }
  const toggleSubject = (s: string) => setSubjects((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const onBuild = () => {
    if (subjects.length === 0) return
    me(subjects.join(', '))
    setAsk(null)
    say(`Setting up your ${subjects.length} subject${subjects.length > 1 ? 's' : ''}. This takes a few seconds.`)
    void build()
  }

  // Free text → BUILD A DECK (real pipeline) and start a guided study flow.
  // Strips leading filler/intent ("ok, I want to study …") so a real topic is
  // never mistaken for a greeting, and frames it as studying — not "see cards".
  async function send() {
    const raw = input.trim()
    const docText = documentText(att.items)
    const imgs = visionImages(att.items)
    const summary = attachmentSummary(att.items)
    if ((!raw && !docText && imgs.length === 0) || sending || ask || building) return
    setInput('')
    me(raw || `Study from ${summary || 'my file'}`, imgs.length ? imgs : undefined)
    att.clear()

    // Peel off conversational filler + study-intent phrases to find the topic.
    let topic = raw
    for (let i = 0; i < 4; i++) {
      topic = topic
        .replace(/^(ok(ay)?|so|well|umm?|hmm|hey|hi|hello|yeah|yep|yes|sure|alright|right|now|please)[\s,.!:-]+/i, '')
        .replace(/^(i\s*(?:want|wanna|would like|need|'d like)\s*to\s+|let'?s\s+|can you\s+|could you\s+|help me( with)?\s+|teach me( about)?\s+|tell me about\s+|study\s+|learn( about)?\s+|revise\s+|go over\s+|explain\s+|start( studying)?\s+|about\s+)/i, '')
        .trim()
    }
    topic = topic.replace(/[?!.]+$/, '').trim()

    // Nothing to build from: no document text and no real topic → nudge.
    if (!docText && topic.length < 3) {
      say(imgs.length
        ? 'I build decks from text — type a topic (like “Photosynthesis”) or attach a PDF and I’ll turn it into flashcards.'
        : 'Tell me a topic — like “World War 1” or “Photosynthesis” — or attach a PDF and I’ll build a deck from it.')
      return
    }

    setSending(true)
    try {
      let topicId = store.activeTopicId
      let topicTitle = store.activeTopicTitle
      const baseLabel = topic.length >= 3 ? topic : (summary || 'My notes')
      const chapter = baseLabel.length > 64 ? baseLabel.slice(0, 64) : baseLabel
      if (!topicId) {
        const title = chapter.slice(0, 40) || 'My topic'
        const emoji = subjectEmoji(title)
        const { topic: created } = await api<{ topic: { id: string } }>('/study/topics', { method: 'POST', body: JSON.stringify({ title, emoji }) })
        topicId = created.id; topicTitle = title
        store.setActive(topicId, title)
      }
      const content = docText
        ? `Generate clear, exam-style concept flashcards (front: a question or term; back: a concise, accurate answer) from the following source material${topic.length >= 3 ? ` about ${topic}` : ''}. Extract the key ideas, definitions, dates/formulas and likely exam questions. Use Australian curriculum terminology and spelling.\n\nSOURCE MATERIAL:\n"""\n${docText}\n"""`
        : `Generate clear, exam-style concept flashcards (front: a question or term; back: a concise, accurate answer) for a student studying: ${topic}. Cover the key ideas, definitions, dates/formulas and common exam questions. Use Australian curriculum terminology and spelling.`
      await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: chapter, fileUrl: docText ? 'file://pdf' : 'text://inline', fileType: 'text', content, chapter }) })
      qc.invalidateQueries({ queryKey: ['study-topics'] })
      qc.invalidateQueries({ queryKey: ['study-topic', topicId] })
      qc.invalidateQueries({ queryKey: ['study-chapters', topicId] })
      const label = topicTitle && topicTitle.toLowerCase() !== chapter.toLowerCase() ? `${chapter} · ${topicTitle}` : chapter
      say(`On it — building your “${chapter}” deck${docText ? ' from your file' : ''} now. Here's the plan: learn the key cards, take a quick quiz, then a short interview to lock it in. Tap below when you're ready.`, [
        { label: `Start studying ${chapter}`, emoji: '📖', kind: 'cards', topicId, title: label, chapter },
      ])
    } catch {
      say('That didn’t build just now — mind trying again?')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {live && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
          <LiveSession withCamera={live.camera} avatar={ch.avatar} speaker={ch.characterName} onClose={() => setLive(null)} />
        </Suspense>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="pv-mesh" aria-hidden />

        {/* Matilda — in the BACKGROUND. */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-start justify-center pt-10" aria-hidden>
          <div className="absolute left-1/2 top-[34%] h-2/3 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]" style={{ background: ch.gradient, opacity: 0.26 }} />
          <Companion avatar={ch.avatar} mood="happy" className="h-full w-full max-w-sm" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0" style={{ background: 'linear-gradient(180deg, transparent 0%, transparent 34%, color-mix(in srgb, var(--pv-bg) 62%, transparent) 60%, var(--pv-bg) 88%)' }} aria-hidden />

        {/* Chat — in the FRONT. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Identity / switcher */}
          <div className="flex flex-none items-center gap-2 px-4 pb-1 pt-2">
            <button type="button" onClick={onSwitchPal} disabled={!onSwitchPal} aria-label={onSwitchPal ? 'Switch Pal' : undefined} className="pv-press pv-glass flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-left disabled:cursor-default">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent }}>
                <GraduationCap size={16} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1"><span className="pv-title pv-tight truncate text-sm leading-tight">{ch.palName}</span>{onSwitchPal && <ChevronDown size={14} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}</span>
              </span>
            </button>
            <button onClick={onSetup} aria-label="Add subjects" className="pv-press pv-glass flex h-10 w-10 flex-none items-center justify-center rounded-full">
              <Plus size={18} strokeWidth={2.6} style={{ color: 'var(--pv-ink-2)' }} />
            </button>
            {onSavedAll && (
              <button onClick={onSavedAll} aria-label={`Saved cards to review${savedCount ? ` (${savedCount})` : ''}`} className="pv-press pv-glass relative flex h-10 w-10 flex-none items-center justify-center rounded-full">
                <Bookmark size={18} strokeWidth={2.4} style={{ color: savedCount ? 'var(--pv-accent)' : 'var(--pv-ink-2)' }} fill={savedCount ? 'currentColor' : 'none'} />
                {savedCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold" style={savedDue > 0 ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                    {savedCount}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Onboarding progress — advances per answered question. */}
          {showProgress && (
            <div className="flex-none px-4 pt-1">
              <div className="mx-auto w-full max-w-xl">
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--pv-ink-3)' }}>
                  <span>Setup</span>
                  <span>Step {currentStep} of {totalSteps}</span>
                </div>
                <div className="pv-progress" role="progressbar" aria-valuenow={currentStep} aria-valuemin={0} aria-valuemax={totalSteps}>
                  <span style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Cards-due nudge — a gentle prompt when saved reviews are waiting. */}
          {onSavedAll && savedDue > 0 && !ask && !building && (
            <div className="flex-none px-4 pt-1.5">
              <button onClick={onSavedAll} className="pv-press pv-glass pv-hairline mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl px-3.5 py-2.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><Bookmark size={16} fill="currentColor" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>{savedDue} saved card{savedDue !== 1 ? 's' : ''} due for review</span>
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>A quick review earns Brains and keeps your streak</span>
                </span>
                <span className="pv-text-accent flex-none text-sm font-extrabold">Review →</span>
              </button>
            </div>
          )}

          {/* Conversation — pinned to the bottom so Matilda shows through up top. */}
          <div ref={scrollRef} className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-end gap-3">
              {messages.map((m) => <Bubble key={m.id} m={m} onAction={runAction} demoBusy={demoBusy} />)}
              {(sending || building) && (
                <div className="flex w-fit items-center gap-1.5 rounded-2xl px-3.5 py-2.5 pv-glass">
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
                </div>
              )}

              {ask === 'grade' && (
                <div className="pv-rise grid grid-cols-2 gap-2.5 pt-1">
                  {GRADES.map((g) => <ChipBtn key={g} onClick={() => onGrade(g)}>{g}</ChipBtn>)}
                </div>
              )}
              {ask === 'state' && (
                <div className="pv-rise pt-1">
                  <div className="flex flex-wrap gap-2">{AU_STATES.map((s) => <ChipBtn key={s} pill onClick={() => onStatePick(s)}>{s}</ChipBtn>)}</div>
                  <button onClick={() => onStatePick(null)} className="pv-press mt-3 block text-sm font-bold" style={{ color: 'var(--pv-ink-3)' }}>Skip</button>
                </div>
              )}
              {ask === 'subjects' && (
                <div className="pv-rise flex flex-col gap-2 pt-1">
                  {subjectsForGrade(grade).map((s) => {
                    const on = subjects.includes(s)
                    return (
                      <button key={s} onClick={() => toggleSubject(s)} className="pv-press flex items-center gap-3 rounded-2xl px-4 py-3 font-bold" style={on ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
                        <span className="text-xl">{subjectEmoji(s)}</span>
                        <span className="flex-1 text-left">{s}</span>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ border: on ? '2px solid currentColor' : '2px solid var(--pv-line-strong)' }}>{on && <Check size={14} />}</span>
                      </button>
                    )
                  })}
                  <button onClick={onBuild} disabled={subjects.length === 0} className="pv-press-lg pv-sheen mt-1 flex items-center justify-center gap-2 rounded-full py-3.5 text-sm font-extrabold disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: subjects.length ? 'var(--pv-shadow-pop)' : undefined }}>
                    <Sparkles size={16} /> Build{subjects.length > 0 ? ` · ${subjects.length}` : ''}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Composer — free chat + mic/camera (hidden during setup questions). */}
          {!ask && !building && (
            <div className="mx-auto w-full max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
              <AttachTray items={att.items} onRemove={att.remove} />
              <form onSubmit={(e) => { e.preventDefault(); void send() }} className="pv-composer pv-glass pv-hairline flex items-center gap-2 rounded-full p-1.5 pl-1.5">
                <AttachButton onFiles={att.add} disabled={sending} label="Attach a PDF or photo to study" />
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? 'Listening…' : 'Tell Matilda what to study…'} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: 'var(--pv-ink)' }} />
                {listening ? (
                  <button type="button" onClick={toggleDictation} aria-label="Stop dictation" className="pv-press-lg pv-live-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg)', color: '#fff', boxShadow: 'var(--pv-shadow-md)' }}>
                    <Mic size={18} />
                  </button>
                ) : (input.trim() || att.hasReady) ? (
                  <button type="submit" disabled={sending || att.busy} aria-label="Send" className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                    <SendIcon size={17} />
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={toggleDictation} aria-label="Dictate — speak to type" className="pv-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
                      <Mic size={18} />
                    </button>
                    <button type="button" onClick={() => setLive({ camera: true })} aria-label="Live camera with Matilda" className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                      <Camera size={18} />
                    </button>
                  </>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ChipBtn({ children, onClick, pill }: { children: React.ReactNode; onClick: () => void; pill?: boolean }) {
  return (
    <button onClick={onClick} className={`pv-press pv-title ${pill ? 'rounded-full px-4 py-2.5 text-sm' : 'rounded-2xl py-4 text-center'}`} style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
      {children}
    </button>
  )
}

function Bubble({ m, onAction, demoBusy }: { m: CMsg; onAction: (a: Action) => void; demoBusy: boolean }) {
  if (m.who === 'you') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {m.images && m.images.length > 0 && (
          <div className="flex max-w-[82%] flex-wrap justify-end gap-1.5">
            {m.images.map((src, i) => <img key={i} src={src} alt="" className="h-24 w-24 rounded-2xl object-cover" style={{ boxShadow: 'var(--pv-shadow-sm)' }} />)}
          </div>
        )}
        {m.text && <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 }}>{m.text}</div>}
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><GraduationCap size={14} strokeWidth={2.4} /></span>
      <div className="min-w-0 max-w-[86%]">
        {m.text && (
          <div className="pv-glass whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed" style={{ borderBottomLeftRadius: 6 }}>{m.text}</div>
        )}
        {m.result && <ResultCard result={m.result} />}
        {m.actions && m.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.actions.map((a, i) => {
              const primary = a.kind === 'cards' || a.kind === 'interview' || a.kind === 'quiz' || a.kind === 'proceed'
              const isDemo = a.kind === 'demo'
              return (
                <button
                  key={`${a.kind}-${a.topicId ?? i}`}
                  onClick={() => onAction(a)}
                  disabled={isDemo && demoBusy}
                  className={`pv-press ${primary ? 'pv-press-lg pv-sheen' : ''} inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold disabled:opacity-60`}
                  style={primary
                    ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
                    : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}
                >
                  {a.kind === 'cards' ? <BookOpen size={15} /> : a.kind === 'quiz' ? <Sparkles size={15} /> : a.kind === 'interview' ? <Mic size={15} /> : a.kind === 'proceed' ? <ArrowRight size={15} /> : a.emoji ? <span>{a.emoji}</span> : null}
                  {isDemo && demoBusy ? 'Building…' : a.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultCard({ result }: { result: { score: number | null; summary?: string | null } }) {
  const tone = typeof result.score !== 'number'
    ? { bg: 'var(--pv-surface-2)', fg: 'var(--pv-ink-3)' }
    : result.score >= 8 ? { bg: 'var(--pv-pos-soft)', fg: 'var(--pv-pos)' }
      : result.score >= 5 ? { bg: 'var(--pv-accent-soft)', fg: 'var(--pv-accent)' }
        : { bg: 'var(--pv-neg-soft)', fg: 'var(--pv-neg)' }
  return (
    <div className="pv-pop pv-glass pv-hairline mt-2 flex items-center gap-3 rounded-2xl p-3.5">
      <span className="flex h-14 w-14 flex-none flex-col items-center justify-center rounded-2xl text-xl font-extrabold" style={{ background: tone.bg, color: tone.fg }}>
        {typeof result.score === 'number' ? result.score : <Trophy size={22} />}
        {typeof result.score === 'number' && <span className="text-[9px] font-bold" style={{ opacity: 0.7 }}>/ 10</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="pv-label pv-text-accent">Interview result</p>
        <p className="mt-0.5 text-sm leading-snug" style={{ color: 'var(--pv-ink-2)' }}>{result.summary || 'Saved to your history — tap Study to see the full breakdown anytime.'}</p>
      </div>
    </div>
  )
}
