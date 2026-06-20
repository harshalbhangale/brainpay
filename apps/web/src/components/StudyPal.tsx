import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, ChevronLeft, ChevronRight, GraduationCap, Mic, Sparkles, Upload, Check, X } from 'lucide-react'
import { api } from '../lib/api'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsDue: number; cardsMastered: number; topicsActive: number }
type ConceptCard = { id: string; front: string; back: string; status: string }

type View = 'setup' | 'home' | 'concepts' | 'quiz' | 'results'

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
  const { data: topicsData } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })

  const hasTopics = (topicsData?.topics?.length ?? 0) > 0
  const [view, setView] = useState<View>(hasTopics ? 'home' : 'setup')
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  useEffect(() => {
    if (topicsData && topicsData.topics.length > 0 && view === 'setup') setView('home')
  }, [topicsData])

  if (view === 'setup') return <GradeSetup onDone={() => setView('home')} />
  if (view === 'concepts' && selectedTopic) return <ConceptsView topicId={selectedTopic} onBack={() => setView('home')} onQuiz={() => setView('quiz')} />
  if (view === 'quiz' && selectedTopic) return <QuizView topicId={selectedTopic} onBack={() => setView('concepts')} onDone={() => setView('results')} />
  if (view === 'results') return <ResultsView onBack={() => setView('home')} />

  return <HomeView stats={stats} topics={topicsData?.topics ?? []} onSelect={(id) => { setSelectedTopic(id); setView('concepts') }} onSetup={() => setView('setup')} />
}

// ═══════════════════════════════════════════════════════════════════════
// GRADE SETUP — First time: pick grade + subjects
// ═══════════════════════════════════════════════════════════════════════

function GradeSetup({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [step, setStep] = useState<'grade' | 'subjects' | 'extra'>('grade')
  const [grade, setGrade] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [extraInfo, setExtraInfo] = useState('')
  const [creating, setCreating] = useState(false)

  const toggleSubject = (s: string) => {
    setSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  const generate = async () => {
    setCreating(true)
    // Create a topic for each selected subject with grade context
    for (const subject of subjects) {
      const title = `${subject} — ${grade}`
      const { topic } = await api<{ topic: { id: string } }>('/study/topics', {
        method: 'POST',
        body: JSON.stringify({ title, emoji: subjectEmoji(subject) }),
      })
      // Generate concepts by sending grade+subject+extra as notes
      const content = `Generate key concepts, important definitions, formulas, and study material for:\nSubject: ${subject}\nGrade: ${grade}\n${extraInfo ? `Additional context from student: ${extraInfo}` : ''}\n\nCreate comprehensive study material covering the most important topics for this grade level.`
      await api(`/study/topics/${topic.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: `${subject} concepts`, fileUrl: 'text://inline', fileType: 'text', content }),
      })
    }
    qc.invalidateQueries({ queryKey: ['study-topics'] })
    qc.invalidateQueries({ queryKey: ['study-stats'] })
    setCreating(false)
    onDone()
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
          <GraduationCap size={24} className="text-[var(--accent)]" />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--ink)]">
          {step === 'grade' ? 'What grade are you in?' : step === 'subjects' ? 'Pick your subjects' : 'Anything else?'}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {step === 'grade' ? "We'll tailor concepts to your level" : step === 'subjects' ? 'Select the ones you want to study' : 'Exams coming up? Specific chapters? Tell us (optional)'}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 px-6">
        {step === 'grade' && (
          <div className="grid grid-cols-2 gap-3">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => { setGrade(g); setStep('subjects') }}
                className={`rounded-2xl px-4 py-4 text-center font-semibold transition ${grade === g ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--accent-soft)]'}`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {step === 'subjects' && (
          <div className="flex flex-col gap-2">
            {(SUBJECTS[grade] ?? []).map((s) => (
              <button
                key={s}
                onClick={() => toggleSubject(s)}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 font-medium transition ${subjects.includes(s) ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--accent-soft)]'}`}
              >
                <span className="text-lg">{subjectEmoji(s)}</span>
                {s}
                {subjects.includes(s) && <Check size={18} className="ml-auto" />}
              </button>
            ))}
          </div>
        )}

        {step === 'extra' && (
          <textarea
            value={extraInfo}
            onChange={(e) => setExtraInfo(e.target.value)}
            rows={5}
            placeholder="e.g. I have board exams in March, focus on Chapter 5-8 of Physics, I'm weak at trigonometry..."
            className="w-full resize-none rounded-2xl bg-[var(--surface)] px-4 py-3.5 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        )}
      </div>

      {/* Bottom */}
      <div className="px-6 pb-6 pt-4">
        {step === 'subjects' && subjects.length > 0 && (
          <button onClick={() => setStep('extra')} className="w-full rounded-2xl bg-[var(--accent)] py-4 font-bold text-white">
            Next — {subjects.length} selected <ChevronRight size={16} className="ml-1 inline" />
          </button>
        )}
        {step === 'extra' && (
          <button onClick={generate} disabled={creating} className="w-full rounded-2xl bg-[var(--accent)] py-4 font-bold text-white disabled:opacity-50">
            {creating ? 'Generating your study material...' : 'Generate Concepts ✨'}
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// HOME — Subjects grid with progress
// ═══════════════════════════════════════════════════════════════════════

function HomeView({ stats, topics, onSelect, onSetup }: { stats?: Stats | null; topics: Topic[]; onSelect: (id: string) => void; onSetup: () => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[var(--ink)]">StudyPal</h1>
        <button onClick={onSetup} className="text-xs font-semibold text-[var(--accent)]">+ Add Subject</button>
      </div>

      {/* Brain health bar */}
      {stats && (
        <div className="mx-6 mb-4 rounded-2xl bg-[var(--surface)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-[var(--ink)]">🧠 Brain Health</span>
            <span className="text-xs font-semibold text-[var(--muted)]">{stats.cardsDue} cards due</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-2)]">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${stats.cardsMastered + stats.topicsActive > 0 ? Math.min(100, Math.round((stats.cardsMastered / Math.max(1, stats.cardsMastered + stats.cardsDue)) * 100)) : 0}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-[var(--muted)]">
            <span>🔥 {stats.streak} day streak</span>
            <span>✅ {stats.cardsMastered} mastered</span>
          </div>
        </div>
      )}

      {/* Subjects */}
      <div className="flex flex-col gap-3 px-6 pb-20">
        {topics.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)} className="flex items-center gap-4 rounded-2xl bg-[var(--surface)] p-4 text-left shadow-sm transition hover:shadow">
            <span className="text-3xl">{t.emoji}</span>
            <div className="flex-1">
              <p className="font-bold text-[var(--ink)]">{t.title}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{t.totalCards} concepts · {t.cardsDue} to review</p>
            </div>
            <ChevronRight size={18} className="text-[var(--muted)]" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CONCEPTS VIEW — Read cards, then quiz/interview
// ═══════════════════════════════════════════════════════════════════════

function ConceptsView({ topicId, onBack, onQuiz }: { topicId: string; onBack: () => void; onQuiz: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic; cardsDue: number; documents: any[] }>(`/study/topics/${topicId}`),
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: any[] } | undefined)?.documents ?? []
      return docs.some((d) => d.processingStatus === 'pending' || d.processingStatus === 'processing') ? 3000 : false
    },
  })
  const { data: cardsData, refetch } = useQuery({
    queryKey: ['study-cards', topicId],
    queryFn: () => api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards`),
  })

  const readyDocCount = (data?.documents ?? []).filter((d: any) => d.processingStatus === 'ready').length
  useEffect(() => { refetch() }, [readyDocCount, refetch])

  const cards = cardsData?.cards ?? []
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState('')

  // Swipe gesture state
  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null)
  const startX = useRef<number | null>(null)

  const reviewMut = useMutation({
    mutationFn: (cardId: string) =>
      api(`/study/cards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ quality: 4 }) }),
  })

  const card = cards[current]

  const advance = (dir: 'left' | 'right') => {
    if (!card) return
    reviewMut.mutate(card.id) // silently mark as reviewed (no rating asked)
    setLeaving(dir)
    setTimeout(() => {
      setLeaving(null)
      setDrag(0)
      if (current < cards.length - 1) setCurrent((c) => c + 1)
      else { setDone(true); qc.invalidateQueries({ queryKey: ['study-stats'] }) }
    }, 280)
  }

  // Pointer drag handlers
  const onPointerDown = (e: React.PointerEvent) => { startX.current = e.clientX }
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return
    setDrag(e.clientX - startX.current)
  }
  const onPointerUp = () => {
    if (startX.current === null) return
    if (Math.abs(drag) > 100) advance(drag > 0 ? 'right' : 'left')
    else setDrag(0)
    startX.current = null
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: file.name, fileUrl: base64, fileType: 'image', content: `[Image: ${file.name}. Extract all text, formulas, diagrams and concepts.]` }) })
        setUploading(false); setShowUpload(false)
        setTimeout(() => { refetch(); qc.invalidateQueries({ queryKey: ['study-topic', topicId] }) }, 3000)
      }
      reader.readAsDataURL(file)
      return
    }
    if (file.type === 'application/pdf') {
      const text = await file.text().catch(() => '')
      await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: file.name, fileUrl: `local://${file.name}`, fileType: 'pdf', content: text.length > 100 ? text.slice(0, 15000) : `[PDF: ${file.name}. Generate concepts for this subject.]` }) })
      setUploading(false); setShowUpload(false)
      setTimeout(() => { refetch(); qc.invalidateQueries({ queryKey: ['study-topic', topicId] }) }, 3000)
      return
    }
    const text = await file.text()
    await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: file.name, fileUrl: `local://${file.name}`, fileType: 'text', content: text.slice(0, 15000) }) })
    setUploading(false); setShowUpload(false)
    setTimeout(() => { refetch(); qc.invalidateQueries({ queryKey: ['study-topic', topicId] }) }, 3000)
  }

  const handleNotesSubmit = async () => {
    if (!notes.trim()) return
    setUploading(true)
    await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: 'My notes', fileUrl: 'text://inline', fileType: 'text', content: notes.trim() }) })
    setNotes(''); setUploading(false); setShowUpload(false)
    setTimeout(() => { refetch(); qc.invalidateQueries({ queryKey: ['study-topic', topicId] }) }, 3000)
  }

  // ─── DONE / CELEBRATION SCREEN ──────────────────────────────────────
  if (done) {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Confetti burst */}
        <Confetti />

        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="animate-trophy mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-emerald-400 shadow-2xl">
            <span className="text-5xl">🏆</span>
          </div>
          <h2 className="animate-rise text-3xl font-extrabold text-[var(--ink)]">Brilliant!</h2>
          <p className="animate-rise mt-2 text-base text-[var(--muted)]" style={{ animationDelay: '0.1s' }}>
            You reviewed all {cards.length} concepts in<br/>{data?.topic?.emoji} {data?.topic?.title}
          </p>

          {/* Token of appreciation */}
          <div className="animate-rise mt-6 flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-5 py-2.5" style={{ animationDelay: '0.2s' }}>
            <span className="text-lg">🧠</span>
            <span className="font-bold text-[var(--accent)]">+10 Brains earned</span>
          </div>
        </div>

        {/* Revealed actions — quiz/interview only AFTER finishing */}
        <div className="animate-rise border-t border-[var(--border)] px-5 py-5" style={{ animationDelay: '0.35s' }}>
          <p className="mb-3 text-center text-sm font-semibold text-[var(--ink)]">Ready to test yourself?</p>
          <div className="flex gap-3">
            <button onClick={onQuiz} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow-lg transition hover:scale-[1.02]">
              <Sparkles size={18} /> Take Quiz
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] py-4 font-semibold text-[var(--accent)] shadow transition hover:scale-[1.02]">
              <Mic size={18} /> Interview
            </button>
          </div>
          <button onClick={onBack} className="mt-3 w-full py-2 text-sm font-medium text-[var(--muted)]">Back to subjects</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
        <button onClick={onBack} className="text-[var(--muted)]"><ChevronLeft size={20} /></button>
        <h2 className="flex-1 text-center font-bold text-[var(--ink)]">{data?.topic?.emoji} {data?.topic?.title}</h2>
        <button onClick={() => setShowUpload(!showUpload)} className="text-[var(--accent)]"><Upload size={18} /></button>
      </div>

      {/* Progress bar */}
      {cards.length > 0 && (
        <div className="px-5 pt-3">
          <div className="h-1.5 rounded-full bg-[var(--surface-2)]">
            <div className="h-1.5 rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${((current) / cards.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-center text-xs text-[var(--muted)]">{current + 1} of {cards.length}</p>
        </div>
      )}

      {/* Upload panel */}
      {showUpload && (
        <div className="border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Add your own material</p>
          <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--accent-soft)] py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white">
            <Upload size={14} /> Upload PDF / Image
            <input type="file" accept=".pdf,image/*,.txt,.md" className="hidden" onChange={handleFileUpload} />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Or paste notes, textbook content, formulas..." className="mb-2 w-full resize-none rounded-xl bg-[var(--canvas)] px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          {notes.trim() && <button onClick={handleNotesSubmit} disabled={uploading} className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-bold text-white disabled:opacity-50">{uploading ? 'Processing...' : 'Generate cards'}</button>}
          {uploading && <p className="mt-2 text-center text-xs text-[var(--muted)]">⏳ Processing...</p>}
          {(data?.documents?.length ?? 0) > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Materials ({data!.documents.length})</p>
              <div className="flex flex-col gap-1.5">
                {data!.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center gap-2.5 rounded-lg bg-[var(--canvas)] px-3 py-2">
                    <span className="text-base">{docIcon(doc.fileType)}</span>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{doc.title}</p>
                      <p className="text-[10px] text-[var(--muted)]">{doc.fileType.toUpperCase()}{doc.processingStatus === 'ready' && doc.chunkCount > 0 && ` · ${doc.chunkCount} sections`}</p>
                    </div>
                    <DocStatus status={doc.processingStatus} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Concept card — shows BOTH concept + explanation, swipe to advance */}
      {card ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-4">
          {/* Card stack */}
          <div className="relative w-full max-w-md" style={{ height: 'min(60vh, 460px)' }}>
            {/* Next card peeking behind */}
            {cards[current + 1] && (
              <div className="absolute inset-0 scale-95 rounded-3xl bg-[var(--surface)] opacity-50 shadow" style={{ top: 12 }} />
            )}
            {/* Active card */}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="absolute inset-0 flex cursor-grab touch-none select-none flex-col rounded-3xl bg-[var(--surface)] p-7 shadow-xl active:cursor-grabbing"
              style={{
                transform: leaving
                  ? `translateX(${leaving === 'right' ? 600 : -600}px) rotate(${leaving === 'right' ? 20 : -20}deg)`
                  : `translateX(${drag}px) rotate(${drag * 0.04}deg)`,
                transition: leaving || startX.current === null ? 'transform 0.28s ease-out' : 'none',
                opacity: leaving ? 0 : 1,
              }}
            >
              <span className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">Concept</span>
              <p className="text-xl font-bold leading-snug text-[var(--ink)]">{card.front}</p>

              <div className="my-4 h-px bg-[var(--border)]" />

              <span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Explanation</span>
              <p className="flex-1 overflow-y-auto text-[15px] leading-relaxed text-[var(--ink)]">{card.back}</p>
            </div>
          </div>

          {/* Next button + hint */}
          <button
            onClick={() => advance('right')}
            className="mt-6 flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-3.5 font-bold text-white shadow-lg transition hover:scale-[1.03]"
          >
            {current < cards.length - 1 ? 'Got it — Next' : 'Finish'} <ChevronRight size={18} />
          </button>
          <p className="mt-3 text-xs text-[var(--muted)]">or swipe the card →</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <Brain size={40} className="animate-pulse text-[var(--accent)]" />
          <p className="text-center text-sm text-[var(--muted)]">Generating your concepts...<br/>This takes a few seconds. Or upload your own material above.</p>
        </div>
      )}
    </div>
  )
}

// Confetti burst for the celebration screen
function Confetti() {
  const pieces = Array.from({ length: 40 })
  const colors = ['#12b76a', '#2be08a', '#FACC15', '#FB923C', '#A855F7', '#3B82F6']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.5
        const dur = 1.5 + Math.random() * 1.5
        const color = colors[i % colors.length]
        const size = 6 + Math.random() * 8
        return (
          <span
            key={i}
            className="animate-confetti absolute top-0 rounded-sm"
            style={{ left: `${left}%`, width: size, height: size, backgroundColor: color, animationDelay: `${delay}s`, animationDuration: `${dur}s` }}
          />
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// QUIZ
// ═══════════════════════════════════════════════════════════════════════

type QuizQuestion = { question: string; options: string[]; correctAnswer: string }

function QuizView({ topicId, onBack, onDone }: { topicId: string; onBack: () => void; onDone: () => void }) {
  const [quiz, setQuiz] = useState<{ id: string; questions: QuizQuestion[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<{ scorePct: number; brainsEarned: number } | null>(null)

  useEffect(() => {
    api<{ quiz: { id: string; questions: QuizQuestion[] } }>(`/study/topics/${topicId}/quiz`, { method: 'POST' })
      .then(({ quiz }) => { setQuiz(quiz); setLoading(false) })
      .catch(() => setLoading(false))
  }, [topicId])

  const submit = (ans: string) => {
    setSelected(ans)
    const newAnswers = [...answers, ans]
    setAnswers(newAnswers)

    setTimeout(() => {
      setSelected(null)
      if (quiz && current < quiz.questions.length - 1) {
        setCurrent((c) => c + 1)
      } else if (quiz) {
        api<{ scorePct: number; brainsEarned: number }>(`/study/quizzes/${quiz.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers: newAnswers.map((a, i) => ({ questionIndex: i, answer: a })) }),
        }).then(setResult).catch(() => {})
      }
    }, 600)
  }

  if (loading) return <div className="flex flex-1 items-center justify-center"><div className="text-center"><Sparkles size={32} className="mx-auto mb-3 animate-pulse text-[var(--accent)]" /><p className="text-sm text-[var(--muted)]">Generating your quiz...</p></div></div>
  if (!quiz) return <div className="flex flex-1 items-center justify-center text-[var(--muted)]">Failed to generate quiz</div>

  if (result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--accent-soft)]">
          <span className="text-4xl font-extrabold text-[var(--accent)]">{result.scorePct}%</span>
        </div>
        <h2 className="text-2xl font-extrabold text-[var(--ink)]">{result.scorePct >= 80 ? 'Excellent! 🎉' : result.scorePct >= 50 ? 'Good effort! 💪' : 'Keep studying! 📚'}</h2>
        {result.brainsEarned > 0 && <p className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-bold text-[var(--accent)]">+{result.brainsEarned} 🧠 earned</p>}
        <button onClick={onBack} className="mt-4 rounded-full bg-[var(--accent)] px-8 py-3 font-bold text-white">Continue Studying</button>
      </div>
    )
  }

  const q = quiz.questions[current]

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={onBack} className="text-[var(--muted)]"><ChevronLeft size={20} /></button>
        <div className="h-2 flex-1 rounded-full bg-[var(--surface-2)]">
          <div className="h-2 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-[var(--muted)]">{current + 1}/{quiz.questions.length}</span>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6">
        <p className="mb-8 text-center text-xl font-bold leading-relaxed text-[var(--ink)]">{q.question}</p>
        <div className="flex flex-col gap-3">
          {q.options.map((opt, i) => {
            const isSelected = selected === opt
            const isCorrect = selected && opt === q.correctAnswer
            return (
              <button
                key={i}
                onClick={() => !selected && submit(opt)}
                disabled={!!selected}
                className={`rounded-2xl px-5 py-4 text-left font-medium transition ${
                  isCorrect ? 'bg-[var(--accent)] text-white' :
                  isSelected ? 'bg-red-500 text-white' :
                  'bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--accent-soft)]'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// RESULTS (placeholder)
// ═══════════════════════════════════════════════════════════════════════

function ResultsView({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <button onClick={onBack} className="rounded-full bg-[var(--accent)] px-6 py-3 font-bold text-white">Back to Study</button>
    </div>
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
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      Processing
    </span>
  )
}
