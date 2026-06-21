import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, ChevronLeft, ChevronRight, GraduationCap, Mic, Sparkles, Upload, Check, Plus } from 'lucide-react'
import { api } from '../lib/api'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsDue: number; cardsMastered: number; topicsActive: number }
type ConceptCard = { id: string; front: string; back: string; status: string }
type Doc = { id: string; title: string; fileType: string; processingStatus: string; chunkCount: number }

type View = 'setup' | 'home' | 'subject' | 'concepts' | 'quiz' | 'interview'

const GRADES = ['Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const SUBJECTS: Record<string, string[]> = {
  'Grade 5': ['Maths', 'Science', 'English', 'Social Studies', 'Hindi'],
  'Grade 6': ['Maths', 'Science', 'English', 'Social Studies', 'Hindi'],
  'Grade 7': ['Maths', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science'],
  'Grade 8': ['Maths', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science'],
  'Grade 9': ['Maths', 'Physics', 'Chemistry', 'Biology', 'English', 'Social Studies', 'Hindi', 'Computer Science'],
  'Grade 10': ['Maths', 'Physics', 'Chemistry', 'Biology', 'English', 'Social Studies', 'Hindi', 'Computer Science'],
  'Grade 11': ['Maths', 'Physics', 'Chemistry', 'Biology', 'English', 'Accountancy', 'Economics', 'Computer Science'],
  'Grade 12': ['Maths', 'Physics', 'Chemistry', 'Biology', 'English', 'Accountancy', 'Economics', 'Computer Science'],
}

export function StudyPal() {
  const { data: stats } = useQuery({ queryKey: ['study-stats'], queryFn: () => api<Stats>('/study/stats') })
  const { data: topicsData, isLoading } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })

  const hasTopics = (topicsData?.topics?.length ?? 0) > 0
  const [view, setView] = useState<View>('home')
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  // Once topics load, if none exist, push to setup
  useEffect(() => {
    if (!isLoading && topicsData && topicsData.topics.length === 0) setView('setup')
  }, [isLoading, topicsData])

  return (
    <div className="flex h-full w-full justify-center overflow-hidden bg-[var(--canvas)]">
      <div className="flex h-full w-full max-w-lg flex-col">
        {isLoading ? (
          <Centered><Spinner label="Loading StudyPal…" /></Centered>
        ) : view === 'setup' ? (
          <GradeSetup onDone={() => setView('home')} canCancel={hasTopics} onCancel={() => setView('home')} />
        ) : view === 'subject' && selectedTopic ? (
          <SubjectHub topicId={selectedTopic} onBack={() => setView('home')} onConcepts={() => setView('concepts')} onQuiz={() => setView('quiz')} onInterview={() => setView('interview')} />
        ) : view === 'concepts' && selectedTopic ? (
          <ConceptsView topicId={selectedTopic} onBack={() => setView('subject')} onQuiz={() => setView('quiz')} />
        ) : view === 'quiz' && selectedTopic ? (
          <QuizView topicId={selectedTopic} onBack={() => setView('subject')} />
        ) : view === 'interview' && selectedTopic ? (
          <InterviewView topicId={selectedTopic} onBack={() => setView('subject')} />
        ) : (
          <HomeView stats={stats} topics={topicsData?.topics ?? []} onSelect={(id) => { setSelectedTopic(id); setView('subject') }} onSetup={() => setView('setup')} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED LAYOUT PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-[var(--surface-2)]" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)]" />
      </div>
      {label && <p className="text-sm font-medium text-[var(--muted)]">{label}</p>}
    </div>
  )
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
      {onBack ? (
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-2)]"><ChevronLeft size={20} /></button>
      ) : <div className="w-8" />}
      <h2 className="flex-1 truncate text-center text-base font-bold text-[var(--ink)]">{title}</h2>
      <div className="flex w-8 justify-end">{right}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// GRADE SETUP
// ═══════════════════════════════════════════════════════════════════════

function GradeSetup({ onDone, canCancel, onCancel }: { onDone: () => void; canCancel: boolean; onCancel: () => void }) {
  const qc = useQueryClient()
  const [step, setStep] = useState<'grade' | 'subjects' | 'extra'>('grade')
  const [grade, setGrade] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [extraInfo, setExtraInfo] = useState('')
  const [creating, setCreating] = useState(false)

  const toggleSubject = (s: string) => setSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const generate = async () => {
    setCreating(true)
    try {
      for (const subject of subjects) {
        const { topic } = await api<{ topic: { id: string } }>('/study/topics', {
          method: 'POST', body: JSON.stringify({ title: `${subject} — ${grade}`, emoji: subjectEmoji(subject) }),
        })
        const content = `Generate key concepts, important definitions, formulas, and study material for:\nSubject: ${subject}\nGrade: ${grade}\n${extraInfo ? `Additional context from student: ${extraInfo}` : ''}\n\nCreate comprehensive study material covering the most important topics for this grade level.`
        await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify({ title: `${subject} concepts`, fileUrl: 'text://inline', fileType: 'text', content }) })
      }
      qc.invalidateQueries({ queryKey: ['study-topics'] })
      qc.invalidateQueries({ queryKey: ['study-stats'] })
      onDone()
    } catch {
      setCreating(false)
    }
  }

  // Full-screen generating state
  if (creating) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--surface-2)] border-t-[var(--accent)]" />
            <Sparkles size={28} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--ink)]">Building your study deck…</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Generating concepts for {subjects.length} subject{subjects.length > 1 ? 's' : ''}.<br/>This takes a few seconds.</p>
          </div>
        </div>
      </Centered>
    )
  }

  return (
    <>
      <Header
        title={step === 'grade' ? 'Your Grade' : step === 'subjects' ? 'Subjects' : 'Final touch'}
        onBack={step === 'grade' ? (canCancel ? onCancel : undefined) : () => setStep(step === 'extra' ? 'subjects' : 'grade')}
      />

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
            <GraduationCap size={26} className="text-[var(--accent)]" />
          </div>
          <h1 className="text-xl font-extrabold text-[var(--ink)]">
            {step === 'grade' ? 'What grade are you in?' : step === 'subjects' ? 'Pick your subjects' : 'Anything specific?'}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {step === 'grade' ? "We'll tailor concepts to your level" : step === 'subjects' ? 'Choose what you want to study' : 'Exams, weak areas, chapters — optional'}
          </p>
        </div>

        {step === 'grade' && (
          <div className="grid grid-cols-2 gap-3">
            {GRADES.map((g) => (
              <button key={g} onClick={() => { setGrade(g); setStep('subjects') }}
                className="rounded-2xl bg-[var(--surface)] py-4 text-center font-semibold text-[var(--ink)] shadow-sm transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-95">
                {g}
              </button>
            ))}
          </div>
        )}

        {step === 'subjects' && (
          <div className="flex flex-col gap-2.5">
            {(SUBJECTS[grade] ?? []).map((s) => {
              const on = subjects.includes(s)
              return (
                <button key={s} onClick={() => toggleSubject(s)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 font-medium shadow-sm transition active:scale-[0.98] ${on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--ink)]'}`}>
                  <span className="text-xl">{subjectEmoji(s)}</span>
                  <span className="flex-1 text-left">{s}</span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-white bg-white/20' : 'border-[var(--border)]'}`}>
                    {on && <Check size={14} className="text-white" />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {step === 'extra' && (
          <textarea value={extraInfo} onChange={(e) => setExtraInfo(e.target.value)} rows={5}
            placeholder="e.g. Board exams in March, focus on Chapters 5–8 of Physics, I struggle with trigonometry…"
            className="w-full resize-none rounded-2xl bg-[var(--surface)] px-4 py-3.5 text-sm leading-relaxed text-[var(--ink)] shadow-sm placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        )}
      </div>

      {/* Fixed bottom bar */}
      {(step === 'subjects' || step === 'extra') && (
        <div className="flex-none border-t border-[var(--border)] bg-[var(--canvas)] px-6 py-4">
          {step === 'subjects' ? (
            <button onClick={() => setStep('extra')} disabled={subjects.length === 0}
              className="flex w-full items-center justify-center gap-1 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40">
              Next {subjects.length > 0 && `· ${subjects.length} selected`} <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={generate}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow-lg transition active:scale-[0.98]">
              <Sparkles size={18} /> Generate Concepts
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════

function HomeView({ stats, topics, onSelect, onSetup }: { stats?: Stats | null; topics: Topic[]; onSelect: (id: string) => void; onSetup: () => void }) {
  const healthPct = stats && (stats.cardsMastered + stats.cardsDue) > 0
    ? Math.min(100, Math.round((stats.cardsMastered / (stats.cardsMastered + stats.cardsDue)) * 100))
    : 0

  return (
    <>
      {/* Header */}
      <div className="flex flex-none items-center justify-between px-6 pt-6 pb-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--ink)]">StudyPal</h1>
          <p className="text-sm text-[var(--muted)]">Keep your brain sharp</p>
        </div>
        <button onClick={onSetup} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow transition active:scale-95">
          <Plus size={18} />
        </button>
      </div>

      {/* Scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {/* Brain health */}
        {stats && (
          <div className="mb-5 rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold text-[var(--ink)]">🧠 Brain Health</span>
              <span className="text-lg font-extrabold text-[var(--accent)]">{healthPct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-emerald-400 transition-all duration-500" style={{ width: `${healthPct}%` }} />
            </div>
            <div className="mt-3 flex gap-4 text-xs font-medium text-[var(--muted)]">
              <span>🔥 {stats.streak} day streak</span>
              <span>📚 {stats.cardsDue} to review</span>
              <span>✅ {stats.cardsMastered} mastered</span>
            </div>
          </div>
        )}

        {/* Subjects */}
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Subjects</p>
        <div className="flex flex-col gap-3">
          {topics.map((t) => {
            const pct = t.totalCards > 0 ? Math.round(((t.totalCards - t.cardsDue) / t.totalCards) * 100) : 0
            return (
              <button key={t.id} onClick={() => onSelect(t.id)}
                className="flex items-center gap-4 rounded-2xl bg-[var(--surface)] p-4 text-left shadow-sm transition hover:shadow-md active:scale-[0.99]">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-2xl">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--ink)]">{t.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {t.totalCards === 0 ? 'Generating…' : `${t.totalCards} concepts · ${t.cardsDue} to review`}
                  </p>
                </div>
                {t.totalCards > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-[var(--accent)]">{pct}%</span>
                    <ChevronRight size={16} className="text-[var(--muted)]" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SUBJECT HUB — overview with options (concepts / quiz / interview)
// ═══════════════════════════════════════════════════════════════════════

function SubjectHub({ topicId, onBack, onConcepts, onQuiz, onInterview }: {
  topicId: string; onBack: () => void; onConcepts: () => void; onQuiz: () => void; onInterview: () => void
}) {
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic; cardsDue: number; documents: Doc[] }>(`/study/topics/${topicId}`),
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: Doc[] } | undefined)?.documents ?? []
      return docs.some((d) => d.processingStatus === 'pending' || d.processingStatus === 'processing') ? 2500 : false
    },
  })

  const topic = data?.topic
  const total = topic?.totalCards ?? 0
  const due = data?.cardsDue ?? 0
  const mastered = Math.max(0, total - due)
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
  const generating = total === 0 && (data?.documents ?? []).some((d) => d.processingStatus !== 'failed')

  return (
    <>
      <Header title={`${topic?.emoji ?? ''} ${topic?.title ?? ''}`} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {/* Progress ring summary */}
        <div className="mb-6 flex items-center gap-5 rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
          <ProgressRing pct={pct} />
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--muted)]">Your progress</p>
            <p className="text-2xl font-extrabold text-[var(--ink)]">{mastered}<span className="text-base font-semibold text-[var(--muted)]">/{total} concepts</span></p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{generating ? 'Generating concepts…' : due > 0 ? `${due} ready to review` : 'All caught up 🎉'}</p>
          </div>
        </div>

        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">What would you like to do?</p>
        <div className="flex flex-col gap-3">
          <HubOption
            icon={<BookOpen size={22} className="text-[var(--accent)]" />}
            title="Study Concepts"
            subtitle={generating ? 'Preparing your cards…' : `${total} flashcards · swipe to learn`}
            onClick={onConcepts}
            disabled={generating}
            primary
          />
          <HubOption
            icon={<Sparkles size={22} className="text-purple-500" />}
            title="Take a Quiz"
            subtitle="Test yourself with auto-generated questions"
            onClick={onQuiz}
            disabled={generating}
          />
          <HubOption
            icon={<Mic size={22} className="text-blue-500" />}
            title="AI Interview"
            subtitle="Explain concepts out loud to a tutor"
            onClick={onInterview}
            disabled={generating}
          />
        </div>
      </div>
    </>
  )
}

function HubOption({ icon, title, subtitle, onClick, disabled, primary }: {
  icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; disabled?: boolean; primary?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-4 rounded-2xl p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50 ${primary ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface)]'} ${!disabled && 'hover:shadow-md'}`}>
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-[var(--canvas)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[var(--ink)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>
      </div>
      <ChevronRight size={18} className="flex-none text-[var(--muted)]" />
    </button>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <div className="relative h-16 w-16 flex-none">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-[var(--ink)]">{pct}%</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CONCEPTS — swipe-through cards + celebration
// ═══════════════════════════════════════════════════════════════════════

function ConceptsView({ topicId, onBack, onQuiz }: { topicId: string; onBack: () => void; onQuiz: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic; cardsDue: number; documents: Doc[] }>(`/study/topics/${topicId}`),
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: Doc[] } | undefined)?.documents ?? []
      return docs.some((d) => d.processingStatus === 'pending' || d.processingStatus === 'processing') ? 2500 : false
    },
  })
  const { data: cardsData, refetch } = useQuery({
    queryKey: ['study-cards', topicId],
    queryFn: () => api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards`),
    refetchInterval: (q) => ((q.state.data as { cards?: ConceptCard[] } | undefined)?.cards?.length ?? 0) === 0 ? 2500 : false,
  })

  const readyDocCount = (data?.documents ?? []).filter((d) => d.processingStatus === 'ready').length
  useEffect(() => { refetch() }, [readyDocCount, refetch])

  const cards = cardsData?.cards ?? []
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState('')

  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null)
  const startX = useRef<number | null>(null)

  const reviewMut = useMutation({
    mutationFn: (cardId: string) => api(`/study/cards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ quality: 4 }) }),
  })

  const card = cards[current]

  const advance = (dir: 'left' | 'right') => {
    if (!card) return
    reviewMut.mutate(card.id)
    setLeaving(dir)
    setTimeout(() => {
      setLeaving(null); setDrag(0)
      if (current < cards.length - 1) setCurrent((c) => c + 1)
      else { setDone(true); qc.invalidateQueries({ queryKey: ['study-stats'] }) }
    }, 280)
  }

  const onPointerDown = (e: React.PointerEvent) => { startX.current = e.clientX }
  const onPointerMove = (e: React.PointerEvent) => { if (startX.current !== null) setDrag(e.clientX - startX.current) }
  const onPointerUp = () => {
    if (startX.current === null) return
    if (Math.abs(drag) > 90) advance(drag > 0 ? 'right' : 'left')
    else setDrag(0)
    startX.current = null
  }

  const uploadDoc = async (body: Record<string, unknown>) => {
    setUploading(true)
    await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {})
    setUploading(false); setNotes(''); setShowUpload(false)
    setTimeout(() => { refetch(); qc.invalidateQueries({ queryKey: ['study-topic', topicId] }) }, 2500)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => uploadDoc({ title: file.name, fileUrl: reader.result as string, fileType: 'image', content: `[Image: ${file.name}. Extract all text, formulas, diagrams and concepts.]` })
      reader.readAsDataURL(file)
    } else if (file.type === 'application/pdf') {
      file.text().then((t) => uploadDoc({ title: file.name, fileUrl: `local://${file.name}`, fileType: 'pdf', content: t.length > 100 ? t.slice(0, 15000) : `[PDF: ${file.name}. Generate concepts for this subject.]` }))
    } else {
      file.text().then((t) => uploadDoc({ title: file.name, fileUrl: `local://${file.name}`, fileType: 'text', content: t.slice(0, 15000) }))
    }
  }

  // ─── Celebration ───────────────────────────────────────────────────
  if (done) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <Confetti />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="animate-trophy mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-emerald-400 shadow-2xl">
            <span className="text-5xl">🏆</span>
          </div>
          <h2 className="animate-rise text-3xl font-extrabold text-[var(--ink)]">Brilliant!</h2>
          <p className="animate-rise mt-2 text-base text-[var(--muted)]" style={{ animationDelay: '0.1s' }}>
            You reviewed all {cards.length} concepts in<br/>{data?.topic?.emoji} {data?.topic?.title}
          </p>
          <div className="animate-rise mt-6 flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-5 py-2.5" style={{ animationDelay: '0.2s' }}>
            <span className="text-lg">🧠</span><span className="font-bold text-[var(--accent)]">+10 Brains earned</span>
          </div>
        </div>
        <div className="animate-rise flex-none border-t border-[var(--border)] px-6 py-5" style={{ animationDelay: '0.35s' }}>
          <p className="mb-3 text-center text-sm font-semibold text-[var(--ink)]">Ready to test yourself?</p>
          <div className="flex gap-3">
            <button onClick={onQuiz} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow-lg transition active:scale-[0.98]"><Sparkles size={18} /> Quiz</button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] py-4 font-semibold text-[var(--accent)] shadow transition active:scale-[0.98]"><Mic size={18} /> Interview</button>
          </div>
          <button onClick={onBack} className="mt-3 w-full py-2 text-sm font-medium text-[var(--muted)]">Back to subjects</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header
        title={`${data?.topic?.emoji ?? ''} ${data?.topic?.title ?? ''}`}
        onBack={onBack}
        right={<button onClick={() => setShowUpload(!showUpload)} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--accent)] transition hover:bg-[var(--surface-2)]"><Upload size={18} /></button>}
      />

      {/* Upload panel */}
      {showUpload && (
        <div className="flex-none border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
          <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--accent-soft)] py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white">
            <Upload size={14} /> Upload PDF / Image
            <input type="file" accept=".pdf,image/*,.txt,.md" className="hidden" onChange={handleFileUpload} />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Or paste notes, textbook content…" className="mb-2 w-full resize-none rounded-xl bg-[var(--canvas)] px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          {notes.trim() && <button onClick={() => uploadDoc({ title: 'My notes', fileUrl: 'text://inline', fileType: 'text', content: notes.trim() })} disabled={uploading} className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-bold text-white disabled:opacity-50">{uploading ? 'Processing…' : 'Generate cards'}</button>}
          {(data?.documents?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {data!.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2.5 rounded-lg bg-[var(--canvas)] px-3 py-2">
                  <span className="text-base">{docIcon(doc.fileType)}</span>
                  <p className="flex-1 truncate text-sm font-medium text-[var(--ink)]">{doc.title}</p>
                  <DocStatus status={doc.processingStatus} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {card ? (
        <>
          {/* Progress */}
          <div className="flex-none px-6 pt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${(current / cards.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-[var(--muted)]">{current + 1} of {cards.length}</p>
          </div>

          {/* Card area */}
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
            <div className="relative w-full" style={{ height: 'min(56vh, 440px)' }}>
              {cards[current + 1] && <div className="absolute inset-x-2 top-3 bottom-0 scale-[0.97] rounded-3xl bg-[var(--surface)] opacity-50 shadow" />}
              <div
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                className="absolute inset-0 flex cursor-grab touch-none select-none flex-col rounded-3xl bg-[var(--surface)] p-6 shadow-xl active:cursor-grabbing"
                style={{
                  transform: leaving ? `translateX(${leaving === 'right' ? 600 : -600}px) rotate(${leaving === 'right' ? 18 : -18}deg)` : `translateX(${drag}px) rotate(${drag * 0.035}deg)`,
                  transition: leaving || startX.current === null ? 'transform 0.28s ease-out' : 'none',
                  opacity: leaving ? 0 : 1,
                }}
              >
                <span className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">Concept</span>
                <p className="text-xl font-bold leading-snug text-[var(--ink)]">{card.front}</p>
                <div className="my-4 h-px bg-[var(--border)]" />
                <span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Explanation</span>
                <p className="min-h-0 flex-1 overflow-y-auto pr-1 text-[15px] leading-relaxed text-[var(--ink)]">{card.back}</p>
              </div>
            </div>
          </div>

          {/* Bottom action */}
          <div className="flex-none px-6 pb-6 pt-1">
            <button onClick={() => advance('right')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow-lg transition active:scale-[0.98]">
              {current < cards.length - 1 ? 'Got it — Next' : 'Finish'} <ChevronRight size={18} />
            </button>
            <p className="mt-2.5 text-center text-xs text-[var(--muted)]">tap or swipe the card →</p>
          </div>
        </>
      ) : (
        <Centered>
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--surface-2)] border-t-[var(--accent)]" />
              <Brain size={26} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--ink)]">Generating concepts…</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Hang tight, this takes a few seconds.</p>
            </div>
            <button onClick={() => setShowUpload(true)} className="text-sm font-semibold text-[var(--accent)]">+ Add your own material</button>
          </div>
        </Centered>
      )}
    </>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 36 })
  const colors = ['#12b76a', '#2be08a', '#FACC15', '#FB923C', '#A855F7', '#3B82F6']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const size = 6 + Math.random() * 8
        return <span key={i} className="animate-confetti absolute top-0 rounded-sm" style={{ left: `${Math.random() * 100}%`, width: size, height: size, backgroundColor: colors[i % colors.length], animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${1.5 + Math.random() * 1.5}s` }} />
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// QUIZ
// ═══════════════════════════════════════════════════════════════════════

type QuizQuestion = { question: string; options: string[]; correctAnswer: string }

function QuizView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const [quiz, setQuiz] = useState<{ id: string; questions: QuizQuestion[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<{ scorePct: number; brainsEarned: number } | null>(null)

  useEffect(() => {
    api<{ quiz: { id: string; questions: QuizQuestion[] } }>(`/study/topics/${topicId}/quiz`, { method: 'POST' })
      .then(({ quiz }) => { setQuiz(quiz); setLoading(false) })
      .catch(() => { setFailed(true); setLoading(false) })
  }, [topicId])

  const submit = (ans: string) => {
    setSelected(ans)
    const newAnswers = [...answers, ans]
    setAnswers(newAnswers)
    setTimeout(() => {
      setSelected(null)
      if (quiz && current < quiz.questions.length - 1) setCurrent((c) => c + 1)
      else if (quiz) api<{ scorePct: number; brainsEarned: number }>(`/study/quizzes/${quiz.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: newAnswers.map((a, i) => ({ questionIndex: i, answer: a })) }) }).then(setResult).catch(() => {})
    }, 700)
  }

  if (loading) return (<><Header title="Quiz" onBack={onBack} /><Centered><div className="flex flex-col items-center gap-5 text-center"><div className="relative flex h-20 w-20 items-center justify-center"><div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--surface-2)] border-t-[var(--accent)]" /><Sparkles size={26} className="text-[var(--accent)]" /></div><div><p className="text-lg font-bold text-[var(--ink)]">Creating your quiz…</p><p className="mt-1 text-sm text-[var(--muted)]">Building questions from your concepts.</p></div></div></Centered></>)
  if (failed || !quiz) return (<><Header title="Quiz" onBack={onBack} /><Centered><p className="text-center text-sm text-[var(--muted)]">Couldn't generate a quiz yet.<br/>Review some concepts first, then try again.</p></Centered></>)

  if (result) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {result.scorePct >= 80 && <Confetti />}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
          <div className="animate-trophy flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-emerald-400 shadow-2xl">
            <span className="text-3xl font-extrabold text-white">{result.scorePct}%</span>
          </div>
          <h2 className="animate-rise text-2xl font-extrabold text-[var(--ink)]">{result.scorePct >= 80 ? 'Excellent! 🎉' : result.scorePct >= 50 ? 'Good effort! 💪' : 'Keep studying! 📚'}</h2>
          {result.brainsEarned > 0 && <p className="animate-rise rounded-full bg-[var(--accent-soft)] px-5 py-2.5 font-bold text-[var(--accent)]" style={{ animationDelay: '0.1s' }}>+{result.brainsEarned} 🧠 earned</p>}
        </div>
        <div className="flex-none px-6 pb-6">
          <button onClick={onBack} className="w-full rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow-lg transition active:scale-[0.98]">Continue Studying</button>
        </div>
      </div>
    )
  }

  const q = quiz.questions[current]
  return (
    <>
      <Header title="Quiz" onBack={onBack} right={<span className="text-xs font-semibold text-[var(--muted)]">{current + 1}/{quiz.questions.length}</span>} />
      <div className="flex-none px-6 pt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-6">
        <p className="mb-7 text-center text-xl font-bold leading-relaxed text-[var(--ink)]">{q.question}</p>
        <div className="flex flex-col gap-3">
          {q.options.map((opt, i) => {
            const isSel = selected === opt
            const isCorrect = !!selected && opt === q.correctAnswer
            return (
              <button key={i} onClick={() => !selected && submit(opt)} disabled={!!selected}
                className={`rounded-2xl px-5 py-4 text-left font-medium shadow-sm transition active:scale-[0.99] ${isCorrect ? 'bg-[var(--accent)] text-white' : isSel ? 'bg-red-500 text-white' : 'bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--accent-soft)]'}`}>
                {opt}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// INTERVIEW (voice — placeholder until Tavus)
// ═══════════════════════════════════════════════════════════════════════

function InterviewView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`),
  })
  const [starting, setStarting] = useState(false)

  return (
    <>
      <Header title="AI Interview" onBack={onBack} />
      <Centered>
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Avatar */}
          <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-[var(--accent)] shadow-2xl">
            <span className="text-6xl">🎓</span>
            {starting && <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-20" />}
          </div>
          <div>
            <p className="text-xl font-extrabold text-[var(--ink)]">Tutor Interview</p>
            <p className="mt-1.5 max-w-xs text-sm text-[var(--muted)]">
              Your AI tutor will ask you to explain key concepts from {data?.topic?.emoji} {data?.topic?.title} and give you feedback.
            </p>
          </div>

          <div className="w-full max-w-xs rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent)]">
            🎤 Voice interview with a real avatar is coming soon
          </div>

          <button
            onClick={() => { setStarting(true); setTimeout(() => setStarting(false), 2000) }}
            className="flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-8 py-4 font-bold text-white shadow-lg transition active:scale-[0.98]">
            <Mic size={18} /> {starting ? 'Connecting…' : 'Start Interview'}
          </button>
        </div>
      </Centered>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function subjectEmoji(subject: string): string {
  const map: Record<string, string> = {
    Maths: '📐', Physics: '⚡', Chemistry: '🧪', Biology: '🧬', Science: '🔬',
    English: '📖', Hindi: '🇮🇳', 'Social Studies': '🌍', 'Computer Science': '💻',
    Accountancy: '📊', Economics: '💹',
  }
  return map[subject] ?? '📚'
}

function docIcon(fileType: string): string {
  if (fileType === 'pdf') return '📄'
  if (fileType === 'image') return '🖼️'
  return '📝'
}

function DocStatus({ status }: { status: string }) {
  if (status === 'ready') return <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">Ready</span>
  if (status === 'failed') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-500">Failed</span>
  return <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />Processing</span>
}
