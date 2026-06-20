import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, Flame, Plus, Target, ChevronLeft, RotateCcw, Check, X, Sparkles, Mic } from 'lucide-react'
import { api } from '../lib/api'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Card = { id: string; front: string; back: string; status: string }
type Stats = { streak: number; longestStreak: number; cardsDue: number; topicsActive: number; cardsMastered: number }

type View = 'home' | 'topic' | 'review' | 'new-topic' | 'quiz'

export function StudyPal() {
  const [view, setView] = useState<View>('home')
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--canvas)]">
      {view === 'home' && <StudyHome onSelect={(id) => { setSelectedTopicId(id); setView('topic') }} onNew={() => setView('new-topic')} onReview={() => setView('review')} />}
      {view === 'topic' && selectedTopicId && <TopicDetail id={selectedTopicId} onBack={() => setView('home')} onReview={() => setView('review')} onQuiz={() => setView('quiz')} />}
      {view === 'review' && <CardReview onBack={() => setView('home')} />}
      {view === 'new-topic' && <NewTopic onBack={() => setView('home')} onCreated={(id) => { setSelectedTopicId(id); setView('topic') }} />}
      {view === 'quiz' && selectedTopicId && <Quiz topicId={selectedTopicId} onBack={() => setView('topic')} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// STUDY HOME
// ═══════════════════════════════════════════════════════════════════════

function StudyHome({ onSelect, onNew, onReview }: { onSelect: (id: string) => void; onNew: () => void; onReview: () => void }) {
  const { data: stats } = useQuery({ queryKey: ['study-stats'], queryFn: () => api<Stats>('/study/stats') })
  const { data: topicsData } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })
  const topics = topicsData?.topics ?? []

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--ink)]">Study</h1>
          <p className="text-sm text-[var(--muted)]">Master your subjects</p>
        </div>
        <button onClick={onNew} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow">
          <Plus size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 px-5 pb-4">
        <StatCard icon={<Flame size={16} className="text-orange-400" />} value={stats?.streak ?? 0} label="streak" />
        <StatCard icon={<Brain size={16} className="text-[var(--accent)]" />} value={stats?.cardsDue ?? 0} label="due" />
        <StatCard icon={<Target size={16} className="text-purple-400" />} value={stats?.cardsMastered ?? 0} label="mastered" />
      </div>

      {/* Review CTA */}
      {(stats?.cardsDue ?? 0) > 0 && (
        <button onClick={onReview} className="mx-5 mb-4 flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-4 font-bold text-white shadow-lg transition hover:scale-[1.02]">
          <BookOpen size={18} />
          Review {stats!.cardsDue} cards now
        </button>
      )}

      {/* Topics */}
      <div className="px-5 pb-20">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Your Topics</p>
        {topics.length === 0 ? (
          <button onClick={onNew} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] py-12 text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <BookOpen size={32} strokeWidth={1} />
            <span className="text-sm font-medium">Create your first topic</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {topics.map((t) => (
              <button key={t.id} onClick={() => onSelect(t.id)} className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 shadow-sm transition hover:shadow">
                <span className="text-2xl">{t.emoji}</span>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-[var(--ink)]">{t.title}</p>
                  <p className="text-xs text-[var(--muted)]">{t.totalCards} cards · {t.cardsDue} due</p>
                </div>
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
                  {t.totalCards > 0 ? `${Math.round(((t.totalCards - t.cardsDue) / t.totalCards) * 100)}%` : '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-[var(--surface)] py-3 shadow-sm">
      {icon}
      <span className="text-lg font-extrabold text-[var(--ink)]">{value}</span>
      <span className="text-[10px] font-medium text-[var(--muted)]">{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TOPIC DETAIL
// ═══════════════════════════════════════════════════════════════════════

function TopicDetail({ id, onBack, onReview, onQuiz }: { id: string; onBack: () => void; onReview: () => void; onQuiz: () => void }) {
  const { data } = useQuery({
    queryKey: ['study-topic', id],
    queryFn: () => api<{ topic: Topic; documents: any[]; cardsDue: number }>(`/study/topics/${id}`),
  })

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={onBack} className="text-[var(--muted)] hover:text-[var(--ink)]"><ChevronLeft size={22} /></button>
        <h2 className="flex-1 text-center text-lg font-bold text-[var(--ink)]">{data?.topic?.emoji} {data?.topic?.title}</h2>
        <div className="w-6" />
      </div>

      <div className="flex gap-3 px-5 pb-4">
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-[var(--surface)] py-3"><span className="text-xl font-extrabold text-[var(--ink)]">{data?.topic?.totalCards ?? 0}</span><span className="text-[10px] text-[var(--muted)]">Cards</span></div>
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-[var(--surface)] py-3"><span className="text-xl font-extrabold text-amber-500">{data?.cardsDue ?? 0}</span><span className="text-[10px] text-[var(--muted)]">Due</span></div>
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-[var(--surface)] py-3"><span className="text-xl font-extrabold text-[var(--ink)]">{data?.documents?.length ?? 0}</span><span className="text-[10px] text-[var(--muted)]">Docs</span></div>
      </div>

      <div className="flex flex-col gap-3 px-5">
        {(data?.cardsDue ?? 0) > 0 && (
          <button onClick={onReview} className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white">
            <BookOpen size={18} /> Review {data!.cardsDue} Cards
          </button>
        )}
        <div className="flex gap-3">
          <button onClick={onQuiz} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] py-4 font-semibold text-[var(--accent)]">
            <Sparkles size={18} /> Quiz
          </button>
          <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] py-4 font-semibold text-[var(--accent)]">
            <Mic size={18} /> Interview
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CARD REVIEW
// ═══════════════════════════════════════════════════════════════════════

function CardReview({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['study-cards-due'], queryFn: () => api<{ cards: Card[] }>('/study/cards/due') })
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [completed, setCompleted] = useState(0)

  const reviewMut = useMutation({
    mutationFn: ({ cardId, quality }: { cardId: string; quality: number }) =>
      api(`/study/cards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ quality }) }),
  })

  const cards = data?.cards ?? []
  const card = cards[index]

  const answer = (quality: number) => {
    if (!card) return
    reviewMut.mutate({ cardId: card.id, quality })
    setCompleted((c) => c + 1)
    setFlipped(false)
    setIndex((i) => i + 1)
  }

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-[var(--muted)]">Loading cards...</div>

  if (!card) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-soft)]">
          <Brain size={40} className="text-[var(--accent)]" />
        </div>
        <h2 className="text-xl font-extrabold text-[var(--ink)]">{completed > 0 ? 'All done! 🎉' : 'No cards due'}</h2>
        <p className="text-center text-sm text-[var(--muted)]">{completed > 0 ? `You reviewed ${completed} cards.` : 'Come back when cards are due.'}</p>
        <button onClick={() => { qc.invalidateQueries({ queryKey: ['study-stats'] }); onBack() }} className="rounded-full bg-[var(--accent)] px-6 py-3 font-bold text-white">Back to Study</button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <button onClick={onBack} className="text-[var(--muted)]"><ChevronLeft size={20} /></button>
        <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-2)]">
          <div className="h-1.5 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${((index + 1) / cards.length) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-[var(--muted)]">{index + 1}/{cards.length}</span>
      </div>

      {/* Card */}
      <div className="flex flex-1 items-center justify-center px-6">
        <button
          onClick={() => setFlipped(!flipped)}
          className="flex h-80 w-full max-w-sm flex-col items-center justify-center rounded-3xl p-8 shadow-lg transition-transform hover:scale-[1.01]"
          style={{ backgroundColor: flipped ? 'var(--accent-soft)' : 'var(--surface)' }}
        >
          <span className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{flipped ? 'Answer' : 'Question'}</span>
          <p className="text-center text-lg font-semibold leading-relaxed text-[var(--ink)]">{flipped ? card.back : card.front}</p>
          <span className="mt-auto text-[10px] text-[var(--muted)]">{flipped ? 'Rate your recall below' : 'Tap to reveal'}</span>
        </button>
      </div>

      {/* Buttons */}
      {flipped && (
        <div className="flex gap-2 px-5 pb-6 pt-3">
          <button onClick={() => answer(1)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white"><X size={16} /> Again</button>
          <button onClick={() => answer(2)} className="flex flex-1 items-center justify-center rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white">Hard</button>
          <button onClick={() => answer(3)} className="flex flex-1 items-center justify-center rounded-xl bg-blue-500 py-3.5 text-sm font-bold text-white">Good</button>
          <button onClick={() => answer(5)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--accent)] py-3.5 text-sm font-bold text-white"><Check size={16} /> Easy</button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// NEW TOPIC
// ═══════════════════════════════════════════════════════════════════════

function NewTopic({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('📚')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const emojis = ['📚', '🧪', '🔬', '📐', '🌍', '📖', '🎨', '💻', '🧮', '🏛️']

  const create = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const { topic } = await api<{ topic: { id: string } }>('/study/topics', { method: 'POST', body: JSON.stringify({ title: title.trim(), emoji }) })
      if (notes.trim()) {
        await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify({ title: title.trim(), fileUrl: 'text://inline', fileType: 'text', content: notes.trim() }) })
      }
      qc.invalidateQueries({ queryKey: ['study-topics'] })
      onCreated(topic.id)
    } catch { /* ignore */ }
    setCreating(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={onBack} className="text-[var(--muted)]"><ChevronLeft size={22} /></button>
        <h2 className="flex-1 text-center text-lg font-bold text-[var(--ink)]">New Topic</h2>
        <div className="w-6" />
      </div>

      <div className="flex flex-col gap-5 px-5">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Topic Name</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Year 8 Science" autoFocus className="w-full rounded-xl bg-[var(--surface)] px-4 py-3 text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Icon</label>
          <div className="flex flex-wrap gap-2">
            {emojis.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition ${emoji === e ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'bg-[var(--surface)]'}`}>{e}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Study Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Paste or type notes — AI will generate flashcards from them..." className="w-full resize-none rounded-xl bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>

        <button onClick={create} disabled={!title.trim() || creating} className="mt-2 rounded-2xl bg-[var(--accent)] py-4 font-bold text-white shadow transition hover:scale-[1.01] disabled:opacity-40">
          {creating ? 'Creating...' : 'Create Topic'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// QUIZ
// ═══════════════════════════════════════════════════════════════════════

type QuizQuestion = { question: string; options: string[]; correctAnswer: string }
type QuizData = { id: string; questions: QuizQuestion[] }

function Quiz({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [result, setResult] = useState<{ scorePct: number; brainsEarned: number } | null>(null)

  useEffect(() => {
    api<{ quiz: QuizData }>(`/study/topics/${topicId}/quiz`, { method: 'POST' })
      .then(({ quiz }) => { setQuiz(quiz); setLoading(false) })
      .catch(() => setLoading(false))
  }, [topicId])

  const selectAnswer = (ans: string) => {
    const newAnswers = [...answers, ans]
    setAnswers(newAnswers)
    if (quiz && current < quiz.questions.length - 1) {
      setTimeout(() => setCurrent((c) => c + 1), 300)
    } else if (quiz) {
      // Submit
      api<{ scorePct: number; brainsEarned: number }>(`/study/quizzes/${quiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: newAnswers.map((a, i) => ({ questionIndex: i, answer: a })) }),
      }).then(setResult).catch(() => {})
    }
  }

  if (loading) return <div className="flex flex-1 items-center justify-center text-[var(--muted)]">Generating quiz...</div>
  if (!quiz) return <div className="flex flex-1 items-center justify-center text-[var(--muted)]">Failed to generate quiz</div>

  if (result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--accent-soft)]">
          <span className="text-3xl font-extrabold text-[var(--accent)]">{result.scorePct}%</span>
        </div>
        <h2 className="text-xl font-extrabold text-[var(--ink)]">{result.scorePct >= 80 ? 'Great job! 🎉' : 'Keep going! 💪'}</h2>
        {result.brainsEarned > 0 && <p className="text-sm font-bold text-[var(--accent)]">+{result.brainsEarned} 🧠 earned</p>}
        <button onClick={onBack} className="mt-4 rounded-full bg-[var(--accent)] px-6 py-3 font-bold text-white">Back to Topic</button>
      </div>
    )
  }

  const q = quiz.questions[current]

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <button onClick={onBack} className="text-[var(--muted)]"><ChevronLeft size={20} /></button>
        <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-2)]">
          <div className="h-1.5 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-[var(--muted)]">{current + 1}/{quiz.questions.length}</span>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6">
        <p className="mb-6 text-center text-lg font-semibold leading-relaxed text-[var(--ink)]">{q.question}</p>
        <div className="flex flex-col gap-3">
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => selectAnswer(opt)} className="rounded-2xl bg-[var(--surface)] px-5 py-4 text-left font-medium text-[var(--ink)] shadow-sm transition hover:bg-[var(--accent-soft)] hover:shadow">
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
