/**
 * StudyChat — StudyPal as a live avatar chat (camera off), hosted by Matilda.
 * ───────────────────────────────────────────────────────────────────────────
 * The whole StudyPal experience is a conversation with Matilda (the reused
 * companion avatar). She greets, onboards, and drives learning — and whenever
 * it's time to actually study, an ACTION BUTTON appears inline in the chat:
 *
 *   • "Open the cards"   → launches the existing flashcards screen
 *   • "Quiz me"          → launches the existing quiz screen
 *   • "Start interview"  → launches the existing Runway interview screen
 *
 * Those screens are reused unchanged; StudyChat just launches them (via the
 * parent's view machine) and, on return, posts a follow-up message — including
 * the interview score, pulled from /study/interviews, straight into the chat.
 *
 * The conversation lives in a module store so it survives while a screen is
 * open, then resumes when we come back. Onboarding answers are tap chips inside
 * the chat (demo-safe — no live-mic dependency); everything else is free chat
 * routed through the existing /study/topics/:id/chat tutor endpoint.
 */
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Sparkles, Mic, Send as SendIcon, Check, Plus, GraduationCap, ChevronDown, Trophy } from 'lucide-react'
import { Companion } from '../../components/Companion'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { palCharacter } from './palCharacters'
import { GRADES, AU_STATES, subjectsForGrade, subjectEmoji, curriculumForState } from './subjects'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsMastered: number; cardsDue: number; topicsActive: number }
type InterviewRow = { id: string; score: number | null; summary: string | null; brainsEarned: number | null }

type ActionKind = 'cards' | 'quiz' | 'interview' | 'pick' | 'demo' | 'setup'
type Action = { label: string; emoji?: string; kind: ActionKind; topicId?: string; title?: string }
type CMsg = {
  id: string
  who: 'matilda' | 'you'
  text: string
  actions?: Action[]
  result?: { score: number | null; summary?: string | null }
}

let mid = 1
const uid = () => `sc${mid++}`

// ── Conversation store — survives while a study screen is open, resumes after.
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

export function StudyChat({ onSwitchPal, onOpenCards, onQuiz, onInterview, onDemo, demoBusy, onSetup }: {
  onSwitchPal?: () => void
  onOpenCards: (topicId: string) => void
  onQuiz: (topicId: string) => void
  onInterview: (topicId: string) => void
  onDemo: () => void
  demoBusy: boolean
  onSetup: () => void
}) {
  const qc = useQueryClient()
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const name = ((account?.persona?.name as string) || '').trim().split(' ')[0] || ''
  const savedGrade = (account?.persona?.grade as string) || ''

  const ch = palCharacter('studypal')
  const { data: topicsData, isLoading } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })

  const store = useStudyChatStore()
  const messages = store.messages

  // Onboarding (in-chat) local state.
  const [ask, setAsk] = useState<null | 'grade' | 'state' | 'subjects'>(null)
  const [grade, setGrade] = useState(savedGrade)
  const [auState, setAuState] = useState((account?.persona?.state as string) || '')
  const [subjects, setSubjects] = useState<string[]>([])
  const [building, setBuilding] = useState(false)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bootRef = useRef(false)

  const say = (text: string, actions?: Action[], result?: CMsg['result']) => store.push({ id: uid(), who: 'matilda', text, actions, result })
  const me = (text: string) => store.push({ id: uid(), who: 'you', text })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, ask, sending])

  // Boot: resume after a screen, or start a fresh conversation.
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

  function homeActions(t: Topic): Action[] {
    return [
      { label: 'Open the cards', emoji: '📖', kind: 'cards', topicId: t.id, title: t.title },
      { label: 'Quiz me', emoji: '🧠', kind: 'quiz', topicId: t.id, title: t.title },
      { label: 'Start interview', emoji: '🎙️', kind: 'interview', topicId: t.id, title: t.title },
    ]
  }

  function beginOnboarding() {
    say(`Hi${name ? ` ${name}` : ''}! I'm Matilda 💜 Let's get you set up — it's quick.`)
    if (savedGrade) { setAsk('subjects'); say('Which subjects do you want to study with me?') }
    else { setAsk('grade'); say('First up — what year are you in?') }
  }

  function beginHome(topics: Topic[]) {
    const ready = topics.filter((t) => t.totalCards > 0)
    const masteryPct = (t: Topic) => (t.totalCards > 0 ? (t.totalCards - t.cardsDue) / t.totalCards : 1)
    const target = ready.length ? [...ready].sort((a, b) => masteryPct(a) - masteryPct(b))[0] : topics[0]
    store.setActive(target.id, target.title)
    const line = ready.length && target.cardsDue > 0
      ? `${name ? `Hey ${name}! ` : ''}You're a little rusty on ${target.title} — ${target.cardsDue} card${target.cardsDue !== 1 ? 's' : ''} to review. Want to jump in?`
      : `${name ? `Hey ${name}! ` : ''}Ready to study ${target.title}? Pick how you'd like to start.`
    say(line, [...homeActions(target), { label: 'Try WWI demo', emoji: '🏛️', kind: 'demo' }])
    if (topics.length > 1) {
      say('Or pick another subject:', topics.map((t) => ({ label: t.title, emoji: t.emoji, kind: 'pick' as const, topicId: t.id, title: t.title })))
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
      const created: { id: string; title: string; emoji: string }[] = []
      for (const subject of subjects) {
        const emoji = subjectEmoji(subject)
        const { topic } = await api<{ topic: { id: string } }>('/study/topics', { method: 'POST', body: JSON.stringify({ title: subject, emoji }) })
        const content = `Generate key concepts, important definitions and study material for:\nSubject: ${subject}\nGrade: ${grade} (Australia)\nCurriculum: ${auState ? curriculumForState(auState) : 'ACARA'}${auState ? ` — ${auState}` : ''}\n\nUse Australian curriculum terminology, spelling and examples. Create comprehensive study material covering the most important topics for this grade level.`
        await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify({ title: `${subject} concepts`, fileUrl: 'text://inline', fileType: 'text', content }) })
        created.push({ id: topic.id, title: subject, emoji })
      }
      qc.invalidateQueries({ queryKey: ['study-topics'] })
      qc.invalidateQueries({ queryKey: ['study-stats'] })
      setBuilding(false)
      const first = created[0]
      if (first) {
        store.setActive(first.id, first.title)
        say(`All set! Your decks are generating now. Let's start with ${first.title} — what would you like to do?`, [
          { label: 'Open the cards', emoji: '📖', kind: 'cards', topicId: first.id, title: first.title },
          { label: 'Quiz me', emoji: '🧠', kind: 'quiz', topicId: first.id, title: first.title },
          { label: 'Start interview', emoji: '🎙️', kind: 'interview', topicId: first.id, title: first.title },
          ...(created.length > 1 ? created.slice(1).map((c) => ({ label: c.title, emoji: c.emoji, kind: 'pick' as const, topicId: c.id, title: c.title })) : []),
        ])
      } else {
        say('All set! Add a subject whenever you like with the + button up top.')
      }
    } catch {
      setBuilding(false)
      setAsk('subjects')
      say("I couldn't build your decks just now — check your connection and tap Build again.")
    }
  }

  async function followUp(kind: 'cards' | 'quiz' | 'interview', topics: Topic[]) {
    const id = store.activeTopicId
    const title = store.activeTopicTitle ?? 'this subject'
    const actionsFor = (): Action[] => id
      ? [
        { label: 'Quiz me', emoji: '🧠', kind: 'quiz', topicId: id, title },
        { label: 'Start interview', emoji: '🎙️', kind: 'interview', topicId: id, title },
        { label: 'More cards', emoji: '📖', kind: 'cards', topicId: id, title },
      ]
      : []
    if (kind === 'cards') {
      say(`Nice work on the ${title} cards! 📚 Want to lock it in with a quick quiz, or go deeper with an interview?`, actionsFor())
    } else if (kind === 'quiz') {
      say(`Good effort on the quiz! An interview is the best way to really master ${title}. Ready?`, id ? [
        { label: 'Start interview', emoji: '🎙️', kind: 'interview', topicId: id, title },
        { label: 'More cards', emoji: '📖', kind: 'cards', topicId: id, title },
      ] : [])
    } else {
      // Pull the freshest interview result straight into the chat.
      say('Great interview! 🎉 Here’s how it went:')
      if (id) {
        try {
          const res = await api<{ interviews: InterviewRow[] }>(`/study/interviews?topicId=${id}`)
          const latest = res.interviews?.[0]
          if (latest) say('', undefined, { score: latest.score, summary: latest.summary })
        } catch { /* no result card — the encouragement still stands */ }
      }
      const others = topics.filter((t) => t.id !== id)
      say('Want to keep going?', [
        ...(id ? [{ label: 'Review cards', emoji: '📖', kind: 'cards' as const, topicId: id, title }] : []),
        ...others.slice(0, 4).map((t) => ({ label: t.title, emoji: t.emoji, kind: 'pick' as const, topicId: t.id, title: t.title })),
      ])
    }
  }

  function runAction(a: Action) {
    if (a.kind === 'setup') { onSetup(); return }
    if (a.kind === 'demo') { me('Try the World War I demo'); store.setPending('cards'); onDemo(); return }
    if (a.kind === 'pick' && a.topicId) {
      store.setActive(a.topicId, a.title ?? null)
      me(a.title ?? 'this subject')
      say(`${a.title ?? 'Great'} it is! What would you like to do?`, [
        { label: 'Open the cards', emoji: '📖', kind: 'cards', topicId: a.topicId, title: a.title },
        { label: 'Quiz me', emoji: '🧠', kind: 'quiz', topicId: a.topicId, title: a.title },
        { label: 'Start interview', emoji: '🎙️', kind: 'interview', topicId: a.topicId, title: a.title },
      ])
      return
    }
    if (!a.topicId) return
    store.setActive(a.topicId, a.title ?? null)
    if (a.kind === 'cards') { me('Open the cards'); store.setPending('cards'); onOpenCards(a.topicId) }
    else if (a.kind === 'quiz') { me('Quiz me'); store.setPending('quiz'); onQuiz(a.topicId) }
    else if (a.kind === 'interview') { me('Start interview'); store.setPending('interview'); onInterview(a.topicId) }
  }

  // Onboarding answers.
  const onGrade = (g: string) => { me(g); setGrade(g); setAsk('state'); say(`${g} — love it. Which state are you studying in? (or tap Skip)`) }
  const onStatePick = (s: string | null) => {
    me(s ?? 'Skip'); if (s) setAuState(s)
    setAsk('subjects'); say(`Great — I'll follow the ${curriculumForState(s ?? undefined)} curriculum. Now pick the subjects you want to study 📚`)
  }
  const toggleSubject = (s: string) => setSubjects((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const onBuild = () => {
    if (subjects.length === 0 || building) return
    me(`Let's do: ${subjects.join(', ')}`)
    setAsk(null)
    say(`Awesome — building your ${subjects.length} deck${subjects.length > 1 ? 's' : ''}… give me a few seconds ✨`)
    void build()
  }

  // Free-form chat → the existing per-topic tutor endpoint.
  async function send() {
    const text = input.trim()
    if (!text || sending || ask) return
    setInput('')
    me(text)
    const id = store.activeTopicId
    if (!id) { say('Pick a subject and I’ll dive right in! Which one would you like?'); return }
    setSending(true)
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.text })).filter((h) => h.content)
      const res = await api<{ reply: string }>(`/study/topics/${id}/chat`, { method: 'POST', body: JSON.stringify({ message: text, history }) })
      say(res.reply)
    } catch {
      say("Hmm, I couldn't think just now — try again, or tap one of the buttons above.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pv-mesh" aria-hidden />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Identity / switcher */}
        <div className="flex flex-none items-center gap-2 px-4 pb-1 pt-2">
          <button type="button" onClick={onSwitchPal} disabled={!onSwitchPal} aria-label={onSwitchPal ? 'Switch Pal' : undefined} className="pv-press flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-0.5 pl-0.5 pr-2 text-left disabled:cursor-default">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent, boxShadow: 'var(--pv-shadow-sm)' }}>
              <GraduationCap size={17} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1"><span className="pv-title pv-tight truncate leading-tight">{ch.palName}</span>{onSwitchPal && <ChevronDown size={15} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}</span>
              <span className="block truncate pt-0.5 text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Talking to {ch.characterName}</span>
            </span>
          </button>
          <button onClick={onSetup} aria-label="Add subjects" className="pv-press flex h-10 w-10 flex-none items-center justify-center rounded-full" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}>
            <Plus size={18} strokeWidth={2.6} />
          </button>
        </div>

        {/* Pinned avatar — the live face (camera off). */}
        <div className="relative flex flex-none items-end justify-center px-4" style={{ height: 'min(24vh, 180px)' }}>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[64px]" style={{ background: ch.gradient, opacity: 0.28 }} aria-hidden />
          <Companion avatar={ch.avatar} mood="happy" className="pv-rise relative h-full w-full" />
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mx-auto w-full max-w-xl space-y-3">
            {messages.map((m) => <Bubble key={m.id} m={m} onAction={runAction} demoBusy={demoBusy} />)}
            {sending && (
              <div className="flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5 pv-glass w-fit">
                <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
                <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
                <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
              </div>
            )}

            {/* In-chat onboarding controls */}
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
                  <Sparkles size={16} /> Build my decks{subjects.length > 0 ? ` · ${subjects.length}` : ''}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Composer — free chat with Matilda (hidden while she's asking setup questions) */}
        {!ask && (
          <div className="mx-auto w-full max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
            <form onSubmit={(e) => { e.preventDefault(); void send() }} className="pv-composer pv-glass pv-hairline flex items-center gap-2 rounded-full p-1.5 pl-4">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message Matilda…" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: 'var(--pv-ink)' }} />
              <button type="submit" disabled={sending || !input.trim()} aria-label="Send" className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: input.trim() ? 'var(--pv-shadow-pop)' : undefined }}>
                <SendIcon size={17} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
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
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 }}>{m.text}</div>
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
              const primary = a.kind === 'cards' || a.kind === 'interview' || a.kind === 'quiz'
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
                  {a.kind === 'cards' ? <BookOpen size={15} /> : a.kind === 'quiz' ? <Sparkles size={15} /> : a.kind === 'interview' ? <Mic size={15} /> : a.emoji ? <span>{a.emoji}</span> : null}
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
