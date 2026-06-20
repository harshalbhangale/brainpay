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
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic; cardsDue: number }>(`/study/topics/${topicId}`),
  })
  const { data: cardsData } = useQuery({
    queryKey: ['study-cards', topicId],
    queryFn: () => api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards`),
  })

  const cards = cardsData?.cards ?? []
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const reviewMut = useMutation({
    mutationFn: ({ cardId, quality }: { cardId: string; quality: number }) =>
      api(`/study/cards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ quality }) }),
  })

  const card = cards[current]

  const rate = (quality: number) => {
    if (!card) return
    reviewMut.mutate({ cardId: card.id, quality })
    setFlipped(false)
    if (current < cards.length - 1) setCurrent((c) => c + 1)
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
        <button onClick={onBack} className="text-[var(--muted)]"><ChevronLeft size={20} /></button>
        <h2 className="flex-1 text-center font-bold text-[var(--ink)]">{data?.topic?.emoji} {data?.topic?.title}</h2>
        <span className="text-xs text-[var(--muted)]">{current + 1}/{cards.length}</span>
      </div>

      {/* Concept card */}
      {card ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <button
            onClick={() => setFlipped(!flipped)}
            className="flex h-72 w-full max-w-md flex-col items-center justify-center rounded-3xl p-8 shadow-lg transition"
            style={{ backgroundColor: flipped ? 'var(--accent-soft)' : 'var(--surface)' }}
          >
            <span className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{flipped ? 'Explanation' : 'Concept'}</span>
            <p className="text-center text-lg font-semibold leading-relaxed text-[var(--ink)]">{flipped ? card.back : card.front}</p>
            <span className="mt-auto text-[10px] text-[var(--muted)]">{flipped ? 'How well did you know this?' : 'Tap to see explanation'}</span>
          </button>

          {/* Rating */}
          {flipped && (
            <div className="mt-4 flex w-full max-w-md gap-2">
              <button onClick={() => rate(1)} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white">Didn't know</button>
              <button onClick={() => rate(3)} className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-bold text-white">Knew it</button>
              <button onClick={() => rate(5)} className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white">Easy</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <Brain size={40} className="text-[var(--accent)]" />
          <p className="text-center text-sm text-[var(--muted)]">Concepts are being generated... Check back in a moment.</p>
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex gap-3 border-t border-[var(--border)] px-5 py-4">
        <button onClick={onQuiz} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 font-bold text-white">
          <Sparkles size={16} /> Take Quiz
        </button>
        <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] py-3.5 font-semibold text-[var(--accent)]">
          <Mic size={16} /> Interview
        </button>
      </div>
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
