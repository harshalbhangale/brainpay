import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, ChevronLeft, ChevronRight, GraduationCap, Mic, MicOff, Sparkles, Upload, Check, Plus, Flame, Target, Trophy, Bookmark, MessageCircle, RefreshCw, Send, FileText, X } from 'lucide-react'
import { api } from '../lib/api'
import { PressButton, GradientButton } from './ui'
import { connectLiveRt, type LiveRtSocket, type InterviewScore } from '../lib/liveRt'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../lib/liveAudio'
import { useAuthStore } from '../stores/auth'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsDue: number; cardsMastered: number; topicsActive: number }
type ConceptCard = { id: string; front: string; back: string; status: string; bookmarked?: boolean; documentId?: string | null }
type Doc = { id: string; title: string; fileType: string; processingStatus: string; chunkCount: number }

type View = 'setup' | 'home' | 'subject' | 'conceptList' | 'concepts' | 'quiz' | 'interview' | 'chat' | 'saved'

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
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && topicsData && topicsData.topics.length === 0) setView('setup')
  }, [isLoading, topicsData])

  return (
    <div className="relative flex h-full w-full justify-center overflow-hidden bg-[var(--canvas)]">
      {/* Ambient aurora glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-grad-aurora opacity-20 blur-[90px]" />
      <div className="relative flex h-full w-full max-w-lg flex-col">
        {isLoading ? (
          <Centered><Spinner label="Loading StudyPal…" /></Centered>
        ) : view === 'setup' ? (
          <GradeSetup onDone={() => setView('home')} canCancel={hasTopics} onCancel={() => setView('home')} />
        ) : view === 'subject' && selectedTopic ? (
          <SubjectHub topicId={selectedTopic} onBack={() => setView('home')} onConcepts={() => setView('conceptList')} onQuiz={() => setView('quiz')} onInterview={() => setView('interview')} onChat={() => setView('chat')} onSaved={() => setView('saved')} />
        ) : view === 'conceptList' && selectedTopic ? (
          <ConceptList topicId={selectedTopic} onBack={() => setView('subject')} onOpenDeck={(docId) => { setSelectedDocId(docId); setView('concepts') }} />
        ) : view === 'concepts' && selectedTopic ? (
          <ConceptsView topicId={selectedTopic} docId={selectedDocId} onBack={() => setView('conceptList')} onQuiz={() => setView('quiz')} />
        ) : view === 'quiz' && selectedTopic ? (
          <QuizView topicId={selectedTopic} onBack={() => setView('subject')} />
        ) : view === 'interview' && selectedTopic ? (
          <InterviewView topicId={selectedTopic} onBack={() => setView('subject')} />
        ) : view === 'chat' && selectedTopic ? (
          <ChatView topicId={selectedTopic} onBack={() => setView('subject')} />
        ) : view === 'saved' && selectedTopic ? (
          <SavedView topicId={selectedTopic} onBack={() => setView('subject')} />
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
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--border)]" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" style={{ filter: 'drop-shadow(0 0 6px rgba(43,217,138,0.6))' }} />
        <Sparkles size={20} className="absolute inset-0 m-auto text-[var(--accent)]" />
      </div>
      {label && <p className="text-sm font-medium text-[var(--muted)]">{label}</p>}
    </div>
  )
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
      {onBack ? (
        <PressButton onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full glass text-[var(--muted)]"><ChevronLeft size={20} /></PressButton>
      ) : <div className="w-9" />}
      <h2 className="flex-1 truncate text-center text-base font-bold text-[var(--ink)]">{title}</h2>
      <div className="flex w-9 justify-end">{right}</div>
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
  const [error, setError] = useState<string | null>(null)

  const toggleSubject = (s: string) => setSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const generate = async () => {
    setCreating(true)
    setError(null)
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
      setError("We couldn't build all your decks just now. Check your connection and try again.")
      setCreating(false)
    }
  }

  if (creating) {
    return (
      <Centered>
        <div className="animate-pop-in flex flex-col items-center gap-6 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-grad-aurora opacity-30 blur-xl animate-glow" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" />
            <Sparkles size={30} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-grad-accent">Building your study deck…</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">Generating concepts for {subjects.length} subject{subjects.length > 1 ? 's' : ''}.<br/>This takes a few seconds.</p>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="animate-rise mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-[var(--danger)]" style={{ background: 'rgba(255,93,108,0.12)', border: '1px solid rgba(255,93,108,0.35)' }}>
            <X size={16} className="flex-none" /> {error}
          </div>
        )}
        <div className="animate-rise mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-grad-violet glow-violet">
            <GraduationCap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--ink)]">
            {step === 'grade' ? 'What grade are you in?' : step === 'subjects' ? 'Pick your subjects' : 'Anything specific?'}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {step === 'grade' ? "We'll tailor concepts to your level" : step === 'subjects' ? 'Choose what you want to study' : 'Exams, weak areas, chapters — optional'}
          </p>
        </div>

        {step === 'grade' && (
          <div className="grid grid-cols-2 gap-3">
            {GRADES.map((g, i) => (
              <PressButton key={g} onClick={() => { setGrade(g); setStep('subjects') }}
                className="grad-border animate-pop-in rounded-2xl py-4 text-center font-bold text-[var(--ink)]"
                style={{ animationDelay: `${i * 28}ms` }}>
                {g}
              </PressButton>
            ))}
          </div>
        )}

        {step === 'subjects' && (
          <div className="flex flex-col gap-2.5">
            {(SUBJECTS[grade] ?? []).map((s, i) => {
              const on = subjects.includes(s)
              return (
                <PressButton key={s} onClick={() => toggleSubject(s)}
                  className={`animate-pop-in flex items-center gap-3 rounded-2xl px-4 py-3.5 font-semibold ${on ? 'bg-grad-accent text-[var(--on-accent)] glow-accent' : 'grad-border text-[var(--ink)]'}`}
                  style={{ animationDelay: `${i * 28}ms` }}>
                  <span className="text-xl">{subjectEmoji(s)}</span>
                  <span className="flex-1 text-left">{s}</span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${on ? 'border-white/80 bg-white/20' : 'border-[var(--border-strong)]'}`}>
                    {on && <Check size={14} className="text-white" />}
                  </span>
                </PressButton>
              )
            })}
          </div>
        )}

        {step === 'extra' && (
          <textarea value={extraInfo} onChange={(e) => setExtraInfo(e.target.value)} rows={5}
            placeholder="e.g. Board exams in March, focus on Chapters 5–8 of Physics, I struggle with trigonometry…"
            className="grad-border w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        )}
      </div>

      {(step === 'subjects' || step === 'extra') && (
        <div className="flex-none border-t border-[var(--border)] px-6 py-4">
          {step === 'subjects' ? (
            <GradientButton onClick={() => setStep('extra')} disabled={subjects.length === 0} className="w-full">
              Next {subjects.length > 0 && `· ${subjects.length} selected`} <ChevronRight size={16} />
            </GradientButton>
          ) : (
            <GradientButton onClick={generate} className="w-full">
              <Sparkles size={18} /> Generate Concepts
            </GradientButton>
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
      <div className="flex flex-none items-center justify-between px-6 pt-6 pb-3">
        <div className="animate-rise">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--ink)]">Study<span className="text-grad-violet">PAL</span></h1>
          <p className="text-sm text-[var(--muted)]">Keep your brain sharp</p>
        </div>
        <PressButton onClick={onSetup} spring="lg" aria-label="Add subjects" className="sheen flex h-11 w-11 items-center justify-center rounded-full bg-grad-violet text-white glow-violet">
          <Plus size={20} strokeWidth={2.6} />
        </PressButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {/* Brain health — hero gradient card */}
        {stats && (
          <div className="animate-pop-in relative mb-6 overflow-hidden rounded-3xl p-5 shadow-pop" style={{ backgroundImage: 'var(--grad-card)' }}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-grad-aurora opacity-20 blur-2xl animate-aurora" />
            <div className="grad-border absolute inset-0 rounded-3xl" />
            <div className="relative">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-[var(--ink)]"><Brain size={18} className="text-[var(--violet)]" /> Brain Health</span>
                <span className="text-2xl font-extrabold text-grad-violet">{healthPct}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full rounded-full bg-grad-violet transition-all duration-700" style={{ width: `${healthPct}%`, boxShadow: '0 0 12px rgba(123,108,255,0.7)' }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat icon={<Flame size={15} className="text-[var(--warn)]" />} value={stats.streak} label="day streak" />
                <MiniStat icon={<BookOpen size={15} className="text-[var(--violet)]" />} value={stats.cardsDue} label="to review" />
                <MiniStat icon={<Check size={15} className="text-[var(--accent)]" />} value={stats.cardsMastered} label="mastered" />
              </div>
            </div>
          </div>
        )}

        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">Subjects</p>
        <div className="flex flex-col gap-3">
          {topics.map((t, i) => {
            const pct = t.totalCards > 0 ? Math.round(((t.totalCards - t.cardsDue) / t.totalCards) * 100) : 0
            return (
              <PressButton key={t.id} onClick={() => onSelect(t.id)}
                className="grad-border animate-pop-in flex items-center gap-4 rounded-2xl p-4 text-left"
                style={{ animationDelay: `${i * 40}ms` }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-2xl ring-1 ring-[var(--border)]">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--ink)]">{t.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {t.totalCards === 0 ? 'Generating…' : `${t.totalCards} concepts · ${t.cardsDue} to review`}
                  </p>
                </div>
                {t.totalCards > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-extrabold text-grad-accent">{pct}%</span>
                    <ChevronRight size={16} className="text-[var(--faint)]" />
                  </div>
                )}
              </PressButton>
            )
          })}
        </div>
      </div>
    </>
  )
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-[var(--surface-2)] py-2.5 ring-1 ring-[var(--border)]">
      <span className="flex items-center gap-1 text-base font-extrabold text-[var(--ink)]">{icon}{value}</span>
      <span className="text-[10px] font-medium text-[var(--muted)]">{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SUBJECT HUB
// ═══════════════════════════════════════════════════════════════════════

function SubjectHub({ topicId, onBack, onConcepts, onQuiz, onInterview, onChat, onSaved }: {
  topicId: string; onBack: () => void; onConcepts: () => void; onQuiz: () => void; onInterview: () => void; onChat: () => void; onSaved: () => void
}) {
  const qc = useQueryClient()
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
  const documents = data?.documents ?? []
  const generating = total === 0 && documents.some((d) => d.processingStatus !== 'failed')

  const [showMaterials, setShowMaterials] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const regenerate = async () => {
    setRegenerating(true)
    try {
      await api(`/study/topics/${topicId}/regenerate`, { method: 'POST' })
      qc.invalidateQueries({ queryKey: ['study-topic', topicId] })
      qc.invalidateQueries({ queryKey: ['study-cards', topicId] })
      qc.invalidateQueries({ queryKey: ['study-topics'] })
    } catch {
      /* ignore */
    }
    setRegenerating(false)
    setConfirmRegen(false)
  }

  return (
    <>
      <Header title={`${topic?.emoji ?? ''} ${topic?.title ?? ''}`} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="animate-pop-in mb-6 flex items-center gap-5 rounded-3xl p-5 shadow-pop grad-border" style={{ backgroundImage: 'var(--grad-card)' }}>
          <ProgressRing pct={pct} />
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--muted)]">Your progress</p>
            <p className="text-2xl font-extrabold text-[var(--ink)]">{mastered}<span className="text-base font-semibold text-[var(--muted)]">/{total} concepts</span></p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{generating ? 'Generating concepts…' : due > 0 ? `${due} ready to review` : 'All caught up 🎉'}</p>
          </div>
        </div>

        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">What would you like to do?</p>
        <div className="flex flex-col gap-3">
          <HubOption icon={<BookOpen size={22} />} tint="var(--grad-accent)" title="Study Concepts" subtitle={generating ? 'Preparing your cards…' : `${total} flashcards · swipe to learn`} onClick={onConcepts} disabled={generating} delay={0} />
          <HubOption icon={<MessageCircle size={22} />} tint="var(--grad-accent-bright)" title="Chat with this lesson" subtitle="Ask anything — the tutor knows this topic" onClick={onChat} delay={60} />
          <HubOption icon={<Sparkles size={22} />} tint="var(--grad-violet)" title="Take a Quiz" subtitle="Test yourself with auto-generated questions" onClick={onQuiz} disabled={generating} delay={120} />
          <HubOption icon={<Mic size={22} />} tint="var(--grad-gold)" title="AI Interview" subtitle="Explain concepts out loud to a tutor" onClick={onInterview} disabled={generating} delay={180} />
          <HubOption icon={<Bookmark size={22} />} tint="var(--grad-violet)" title="Saved cards" subtitle="Your bookmarked concepts" onClick={onSaved} delay={240} />
        </div>

        {/* Materials */}
        <div className="mt-7 flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">Materials</p>
          <PressButton onClick={() => setShowMaterials((v) => !v)} className="text-sm font-bold text-grad-accent">
            {showMaterials ? 'Hide' : 'Add material'}
          </PressButton>
        </div>

        {documents.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {documents.map((doc) => (
              <div key={doc.id} className="grad-border flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ backgroundImage: 'var(--grad-card)' }}>
                <span className="text-base">{docIcon(doc.fileType)}</span>
                <p className="flex-1 truncate text-sm font-medium text-[var(--ink)]">{doc.title}</p>
                <DocStatus status={doc.processingStatus} />
              </div>
            ))}
          </div>
        )}

        {showMaterials && <MaterialsUploader topicId={topicId} onUploaded={() => qc.invalidateQueries({ queryKey: ['study-topic', topicId] })} />}

        {/* Regenerate */}
        <div className="mt-7">
          <PressButton onClick={() => setConfirmRegen(true)} className="grad-border flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-[var(--ink)]">
            <RefreshCw size={16} className="text-[var(--accent)]" /> Regenerate concepts
          </PressButton>
        </div>
      </div>

      {/* Regenerate confirm */}
      {confirmRegen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" onClick={() => !regenerating && setConfirmRegen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="animate-rise grad-border relative w-full max-w-sm rounded-3xl p-6 shadow-pop" style={{ backgroundImage: 'var(--grad-card)' }}>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-grad-accent-bright glow-accent"><RefreshCw size={22} className="text-[var(--on-accent)]" /></div>
            <h3 className="text-lg font-extrabold text-[var(--ink)]">Regenerate concepts?</h3>
            <p className="mt-1.5 text-sm text-[var(--muted)]">We'll rebuild this topic's flashcards from your current materials. Your <span className="font-semibold text-[var(--ink)]">saved (bookmarked) cards are kept</span> — the rest are replaced, which resets their review progress.</p>
            <div className="mt-4 flex gap-2">
              <PressButton onClick={() => setConfirmRegen(false)} disabled={regenerating} className="glass flex-1 rounded-full py-3 text-sm font-bold text-[var(--ink)]">Cancel</PressButton>
              <GradientButton onClick={regenerate} disabled={regenerating} className="flex-1 rounded-full py-3 text-sm">{regenerating ? 'Rebuilding…' : 'Regenerate'}</GradientButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** File + paste uploader — accepts PDF, images, text, and any file. */
function MaterialsUploader({ topicId, onUploaded }: { topicId: string; onUploaded: () => void }) {
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)

  const upload = async (body: Record<string, unknown>) => {
    setUploading(true)
    await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {})
    setUploading(false)
    setNotes('')
    setTimeout(onUploaded, 2500)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    fileToDocBody(file).then(upload)
    e.target.value = ''
  }

  return (
    <div className="animate-rise mt-3 rounded-2xl p-4 grad-border" style={{ backgroundImage: 'var(--grad-card)' }}>
      <label className="sheen mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-grad-accent-bright py-3 text-sm font-bold text-[var(--on-accent)] glow-accent">
        <Upload size={16} /> Upload PDF, image, or any file
        <input type="file" className="hidden" onChange={onFile} />
      </label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Or paste notes / textbook text…" className="grad-border mb-2 w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
      {notes.trim() && (
        <GradientButton onClick={() => upload({ title: 'My notes', fileUrl: 'text://inline', fileType: 'text', content: notes.trim() })} disabled={uploading} className="w-full py-2.5 text-sm">
          {uploading ? 'Processing…' : 'Add & generate cards'}
        </GradientButton>
      )}
    </div>
  )
}

function HubOption({ icon, tint, title, subtitle, onClick, disabled, delay }: {
  icon: React.ReactNode; tint: string; title: string; subtitle: string; onClick: () => void; disabled?: boolean; delay: number
}) {
  return (
    <PressButton onClick={onClick} disabled={disabled}
      className="grad-border animate-pop-in flex items-center gap-4 rounded-2xl p-4 text-left disabled:opacity-50"
      style={{ animationDelay: `${delay}ms` }}>
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-white" style={{ backgroundImage: tint }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[var(--ink)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>
      </div>
      <ChevronRight size={18} className="flex-none text-[var(--faint)]" />
    </PressButton>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <div className="relative h-16 w-16 flex-none">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5cf9c0" />
            <stop offset="100%" stopColor="#12b06a" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)', filter: 'drop-shadow(0 0 4px rgba(43,217,138,0.5))' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-[var(--ink)]">{pct}%</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CONCEPTS — swipe-through cards + celebration
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// CONCEPT WINDOW — a subject's concepts (grouped by source material)
// ═══════════════════════════════════════════════════════════════════════

function ConceptList({ topicId, onBack, onOpenDeck }: { topicId: string; onBack: () => void; onOpenDeck: (docId: string | null) => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic; cardsDue: number; documents: Doc[] }>(`/study/topics/${topicId}`),
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: Doc[] } | undefined)?.documents ?? []
      return docs.some((d) => d.processingStatus === 'pending' || d.processingStatus === 'processing') ? 2500 : false
    },
  })
  const { data: cardsData } = useQuery({
    queryKey: ['study-cards', topicId],
    queryFn: () => api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards`),
    refetchInterval: (q) => ((q.state.data as { cards?: ConceptCard[] } | undefined)?.cards?.length ?? 0) === 0 ? 2500 : false,
  })

  const topic = data?.topic
  const documents = data?.documents ?? []
  const cards = cardsData?.cards ?? []
  const generating = cards.length === 0 && documents.some((d) => d.processingStatus !== 'failed')

  const [showUpload, setShowUpload] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Group cards into concepts by their source material (each upload = a concept set).
  const groups = (() => {
    const byDoc = new Map<string, ConceptCard[]>()
    for (const c of cards) {
      const key = c.documentId ?? 'general'
      if (!byDoc.has(key)) byDoc.set(key, [])
      byDoc.get(key)!.push(c)
    }
    return Array.from(byDoc, ([key, cs]) => ({
      docId: key === 'general' ? null : key,
      title: documents.find((d) => d.id === key)?.title ?? 'Key concepts',
      cards: cs,
    }))
  })()

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['study-topic', topicId] })
    qc.invalidateQueries({ queryKey: ['study-cards', topicId] })
  }

  const regenerate = async () => {
    setRegenerating(true)
    try {
      await api(`/study/topics/${topicId}/regenerate`, { method: 'POST' })
      refresh()
      qc.invalidateQueries({ queryKey: ['study-topics'] })
    } catch {
      /* ignore */
    }
    setRegenerating(false)
    setConfirmRegen(false)
  }

  return (
    <>
      <Header
        title={`${topic?.emoji ?? ''} ${topic?.title ?? 'Concepts'}`}
        onBack={onBack}
        right={
          <PressButton onClick={() => setShowUpload((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full glass text-[var(--accent)]" aria-label="Add material">
            <Plus size={18} />
          </PressButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">Concepts</p>
          <span className="text-xs text-[var(--muted)]">{groups.length} {groups.length === 1 ? 'set' : 'sets'} · {cards.length} cards</span>
        </div>

        {showUpload && <MaterialsUploader topicId={topicId} onUploaded={refresh} />}

        {generating && groups.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <Spinner label="Building your concepts…" />
            <PressButton onClick={() => setShowUpload(true)} className="text-sm font-semibold text-[var(--accent)]">+ Add your own material</PressButton>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-[var(--muted)]">No concepts yet. Upload notes, a PDF, or a photo to generate some.</p>
            <PressButton onClick={() => setShowUpload(true)} className="text-sm font-semibold text-[var(--accent)]">+ Add material</PressButton>
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-3">
            {groups.map((g, i) => {
              const total = g.cards.length
              const mastered = g.cards.filter((c) => c.status === 'mastered').length
              const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
              return (
                <PressButton key={g.docId ?? 'general'} onClick={() => onOpenDeck(g.docId)} className="grad-border animate-pop-in flex items-center gap-4 rounded-2xl p-4 text-left" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-grad-violet text-white"><BookOpen size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[var(--ink)]">{g.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{total} {total === 1 ? 'card' : 'cards'} · {mastered} mastered</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-extrabold text-grad-violet">{pct}%</span>
                    <ChevronRight size={16} className="text-[var(--faint)]" />
                  </div>
                </PressButton>
              )
            })}
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-7 flex flex-col gap-2.5">
            <PressButton onClick={() => setShowUpload(true)} className="sheen flex w-full items-center justify-center gap-2 rounded-2xl bg-grad-accent-bright py-3.5 text-sm font-bold text-[var(--on-accent)] glow-accent">
              <Upload size={16} /> Add more concepts
            </PressButton>
            <PressButton onClick={() => setConfirmRegen(true)} className="grad-border flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-[var(--ink)]">
              <RefreshCw size={16} className="text-[var(--accent)]" /> Regenerate concepts
            </PressButton>
          </div>
        )}
      </div>

      {confirmRegen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" onClick={() => !regenerating && setConfirmRegen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="animate-rise grad-border relative w-full max-w-sm rounded-3xl p-6 shadow-pop" style={{ backgroundImage: 'var(--grad-card)' }}>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-grad-accent-bright glow-accent"><RefreshCw size={22} className="text-[var(--on-accent)]" /></div>
            <h3 className="text-lg font-extrabold text-[var(--ink)]">Regenerate concepts?</h3>
            <p className="mt-1.5 text-sm text-[var(--muted)]">We'll rebuild this subject's cards from your current materials. Your <span className="font-semibold text-[var(--ink)]">saved (bookmarked) cards are kept</span> — the rest are replaced.</p>
            <div className="mt-4 flex gap-2">
              <PressButton onClick={() => setConfirmRegen(false)} disabled={regenerating} className="glass flex-1 rounded-full py-3 text-sm font-bold text-[var(--ink)]">Cancel</PressButton>
              <GradientButton onClick={regenerate} disabled={regenerating} className="flex-1 rounded-full py-3 text-sm">{regenerating ? 'Rebuilding…' : 'Regenerate'}</GradientButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ConceptsView({ topicId, docId, onBack, onQuiz }: { topicId: string; docId?: string | null; onBack: () => void; onQuiz: () => void }) {
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

  const allCards = cardsData?.cards ?? []
  const cards = docId ? allCards.filter((c) => (c.documentId ?? null) === docId) : allCards
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState('')

  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null)
  const startX = useRef<number | null>(null)

  const reviewMut = useMutation({
    mutationFn: (v: { cardId: string; quality: number }) => api(`/study/cards/${v.cardId}/review`, { method: 'POST', body: JSON.stringify({ quality: v.quality }) }),
  })

  // Optimistic bookmark state, keyed by card id.
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>({})
  const toggleBookmark = (c: ConceptCard) => {
    const next = !(bookmarks[c.id] ?? c.bookmarked ?? false)
    setBookmarks((b) => ({ ...b, [c.id]: next }))
    api(`/study/cards/${c.id}/bookmark`, { method: 'POST', body: JSON.stringify({ bookmarked: next }) })
      .then(() => qc.invalidateQueries({ queryKey: ['study-cards', topicId, 'bookmarked'] }))
      .catch(() => setBookmarks((b) => ({ ...b, [c.id]: !next }))) // revert on failure
  }

  const card = cards[current]
  const cardSaved = card ? (bookmarks[card.id] ?? card.bookmarked ?? false) : false

  // Self-rating drives the real SM-2 quality: Forgot=2 (reset), Got it=4, Easy=5.
  const advance = (quality: number, dir: 'left' | 'right') => {
    if (!card) return
    reviewMut.mutate({ cardId: card.id, quality })
    setLeaving(dir)
    setTimeout(() => {
      setLeaving(null); setDrag(0)
      if (current < cards.length - 1) setCurrent((c) => c + 1)
      else { setDone(true); qc.invalidateQueries({ queryKey: ['study-stats'] }) }
    }, 300)
  }

  const onPointerDown = (e: React.PointerEvent) => { startX.current = e.clientX }
  const onPointerMove = (e: React.PointerEvent) => { if (startX.current !== null) setDrag(e.clientX - startX.current) }
  const onPointerUp = () => {
    if (startX.current === null) return
    if (Math.abs(drag) > 90) advance(drag > 0 ? 4 : 2, drag > 0 ? 'right' : 'left')
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
    fileToDocBody(file).then(uploadDoc)
    e.target.value = ''
  }

  // ─── Celebration ───────────────────────────────────────────────────
  if (done) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <Confetti />
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-64 w-64 -translate-x-1/2 rounded-full bg-grad-aurora opacity-25 blur-[80px]" />
        <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="animate-trophy mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-grad-accent-bright shadow-pop glow-accent">
            <Trophy size={44} className="text-[var(--on-accent)]" />
          </div>
          <h2 className="animate-rise text-3xl font-extrabold text-grad-accent">Brilliant!</h2>
          <p className="animate-rise mt-2 text-base text-[var(--muted)]" style={{ animationDelay: '0.1s' }}>
            You reviewed all {cards.length} concepts in<br/>{data?.topic?.emoji} {data?.topic?.title}
          </p>
          <div className="animate-rise mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 grad-border" style={{ animationDelay: '0.2s' }}>
            <span className="text-lg">🧠</span><span className="font-bold text-grad-violet">Review 10 cards a day to earn Brains</span>
          </div>
        </div>
        <div className="animate-rise relative flex-none border-t border-[var(--border)] px-6 py-5" style={{ animationDelay: '0.35s' }}>
          <p className="mb-3 text-center text-sm font-semibold text-[var(--ink)]">Ready to test yourself?</p>
          <div className="flex gap-3">
            <GradientButton onClick={onQuiz} className="flex-1"><Sparkles size={18} /> Quiz</GradientButton>
            <GradientButton variant="violet" className="flex-1"><Mic size={18} /> Interview</GradientButton>
          </div>
          <PressButton onClick={onBack} className="mt-3 w-full py-2 text-sm font-medium text-[var(--muted)]">Back to subjects</PressButton>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header
        title={`${data?.topic?.emoji ?? ''} ${data?.topic?.title ?? ''}`}
        onBack={onBack}
        right={<PressButton onClick={() => setShowUpload(!showUpload)} className="flex h-9 w-9 items-center justify-center rounded-full glass text-[var(--accent)]"><Upload size={18} /></PressButton>}
      />

      {showUpload && (
        <div className="animate-rise flex-none border-b border-[var(--border)] px-6 py-4" style={{ backgroundImage: 'var(--grad-ink)' }}>
          <label className="sheen mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-grad-accent py-3 text-sm font-bold text-[var(--on-accent)]">
            <Upload size={14} /> Upload PDF / Image
            <input type="file" accept=".pdf,image/*,.txt,.md" className="hidden" onChange={handleFileUpload} />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Or paste notes, textbook content…" className="grad-border mb-2 w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
          {notes.trim() && <GradientButton onClick={() => uploadDoc({ title: 'My notes', fileUrl: 'text://inline', fileType: 'text', content: notes.trim() })} disabled={uploading} className="w-full py-2.5 text-sm">{uploading ? 'Processing…' : 'Generate cards'}</GradientButton>}
          {(data?.documents?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {data!.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2 ring-1 ring-[var(--border)]">
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
          <div className="flex-none px-6 pt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="h-full rounded-full bg-grad-accent-bright transition-all duration-300" style={{ width: `${(current / cards.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-[var(--muted)]">{current + 1} of {cards.length}</p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
            <div className="relative w-full" style={{ height: 'min(56vh, 440px)' }}>
              {cards[current + 1] && <div className="grad-border absolute inset-x-2 top-3 bottom-0 scale-[0.97] rounded-3xl opacity-40" style={{ backgroundImage: 'var(--grad-card)' }} />}
              <div
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                className="grad-border absolute inset-0 flex cursor-grab touch-none select-none flex-col overflow-hidden rounded-3xl p-6 shadow-pop active:cursor-grabbing"
                style={{
                  backgroundImage: 'var(--grad-card)',
                  transform: leaving ? `translateX(${leaving === 'right' ? 600 : -600}px) rotate(${leaving === 'right' ? 18 : -18}deg)` : `translateX(${drag}px) rotate(${drag * 0.035}deg)`,
                  transition: leaving || startX.current === null ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
                  opacity: leaving ? 0 : 1,
                }}
              >
                {/* swipe affordance glow */}
                {drag !== 0 && <div className="pointer-events-none absolute inset-0 rounded-3xl" style={{ background: drag > 0 ? 'radial-gradient(circle at 100% 50%, rgba(43,217,138,0.25), transparent 60%)' : 'radial-gradient(circle at 0% 50%, rgba(123,108,255,0.2), transparent 60%)' }} />}
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-grad-accent">Concept</span>
                  <button
                    onClick={() => toggleBookmark(card)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="press flex h-8 w-8 items-center justify-center rounded-full text-[var(--accent)]"
                    aria-label={cardSaved ? 'Remove bookmark' : 'Save card'}
                    title={cardSaved ? 'Saved' : 'Save'}
                  >
                    <Bookmark key={cardSaved ? 'on' : 'off'} size={18} fill={cardSaved ? 'currentColor' : 'none'} className={cardSaved ? 'animate-bookmark' : ''} />
                  </button>
                </div>
                <p className="text-xl font-bold leading-snug text-[var(--ink)]">{card.front}</p>
                <div className="my-4 h-px bg-[var(--border)]" />
                <span className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--muted)]">Explanation</span>
                <p className="flex-1 overflow-y-auto text-base leading-relaxed text-[var(--muted)]">{card.back}</p>
              </div>
            </div>
          </div>

          <div className="flex-none px-6 pb-6 pt-1">
            <p className="mb-2.5 text-center text-xs font-semibold text-[var(--muted)]">How well did you know it?</p>
            <div className="flex gap-2.5">
              <PressButton onClick={() => advance(2, 'left')} className="grad-border flex-1 rounded-2xl py-3.5 text-sm font-bold text-[var(--ink)]">Forgot</PressButton>
              <PressButton onClick={() => advance(4, 'right')} spring="lg" className="sheen flex-[1.4] rounded-2xl bg-grad-accent-bright py-3.5 text-sm font-extrabold text-[var(--on-accent)] glow-accent">Got it</PressButton>
              <PressButton onClick={() => advance(5, 'right')} className="grad-border flex-1 rounded-2xl py-3.5 text-sm font-bold text-[var(--ink)]">Easy</PressButton>
            </div>
            <p className="mt-2.5 text-center text-xs text-[var(--faint)]">swipe ← forgot · got it →</p>
          </div>
        </>
      ) : (
        <Centered>
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-grad-aurora opacity-25 blur-xl animate-glow" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" />
              <Brain size={26} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--ink)]">Generating concepts…</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Hang tight, this takes a few seconds.</p>
            </div>
            <PressButton onClick={() => setShowUpload(true)} className="text-sm font-semibold text-[var(--accent)]">+ Add your own material</PressButton>
          </div>
        </Centered>
      )}
    </>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 40 })
  const colors = ['#2bd98a', '#5ad7ff', '#8b7cff', '#ff7eb6', '#e9c98c', '#f5b544']
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
type ReviewedQuestion = QuizQuestion & { kidAnswer: string | null; isCorrect: boolean | null; concept?: string }
type QuizResult = { scorePct: number; brainsEarned: number; questions?: ReviewedQuestion[]; weakConcepts?: string[] }

function QuizView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const [quiz, setQuiz] = useState<{ id: string; questions: QuizQuestion[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [showReview, setShowReview] = useState(false)

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
      else if (quiz) api<QuizResult>(`/study/quizzes/${quiz.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: newAnswers.map((a, i) => ({ questionIndex: i, answer: a })) }) }).then(setResult).catch(() => {})
    }, 700)
  }

  if (loading) return (<><Header title="Quiz" onBack={onBack} /><Centered><div className="flex flex-col items-center gap-5 text-center"><div className="relative flex h-20 w-20 items-center justify-center"><div className="absolute inset-0 rounded-full bg-grad-violet opacity-25 blur-xl animate-glow" /><div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--violet)]" /><Sparkles size={26} className="text-[var(--violet)]" /></div><div><p className="text-lg font-bold text-[var(--ink)]">Creating your quiz…</p><p className="mt-1 text-sm text-[var(--muted)]">Building questions from your concepts.</p></div></div></Centered></>)
  if (failed || !quiz) return (<><Header title="Quiz" onBack={onBack} /><Centered><p className="text-center text-sm text-[var(--muted)]">Couldn't generate a quiz yet.<br/>Review some concepts first, then try again.</p></Centered></>)

  if (result) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {result.scorePct >= 80 && <Confetti />}
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-64 w-64 -translate-x-1/2 rounded-full bg-grad-aurora opacity-25 blur-[80px]" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-center gap-4 px-8 pt-8 text-center">
            <div className="animate-trophy flex h-24 w-24 items-center justify-center rounded-full bg-grad-accent-bright shadow-pop glow-accent">
              <span className="text-2xl font-extrabold text-[var(--on-accent)]">{result.scorePct}%</span>
            </div>
            <h2 className="animate-rise text-2xl font-extrabold text-[var(--ink)]">{result.scorePct >= 80 ? 'Excellent! 🎉' : result.scorePct >= 50 ? 'Good effort! 💪' : 'Keep studying! 📚'}</h2>
            {result.brainsEarned > 0 && <p className="animate-rise rounded-full px-5 py-2.5 font-bold text-grad-accent grad-border" style={{ animationDelay: '0.1s' }}>+{result.brainsEarned} 🧠 earned</p>}
            {result.questions && result.questions.length > 0 && (
              <PressButton onClick={() => setShowReview((v) => !v)} className="text-sm font-bold text-grad-violet">
                {showReview ? 'Hide answers' : 'Review answers'}
              </PressButton>
            )}
          </div>

          {showReview && result.questions && (
            <div className="animate-rise mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-4">
              {result.questions.map((q, i) => (
                <div key={i} className="grad-border rounded-2xl p-4" style={{ backgroundImage: 'var(--grad-card)' }}>
                  <p className="mb-2.5 text-sm font-bold leading-snug text-[var(--ink)]">{i + 1}. {q.question}</p>
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((opt, j) => {
                      const isCorrect = opt === q.correctAnswer
                      const isKid = opt === q.kidAnswer
                      return (
                        <div
                          key={j}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                          style={
                            isCorrect
                              ? { backgroundImage: 'var(--grad-accent)', color: 'var(--on-accent)' }
                              : isKid
                                ? { background: 'rgba(255,93,108,0.15)', color: 'var(--danger)' }
                                : { color: 'var(--muted)' }
                          }
                        >
                          {isCorrect ? <Check size={14} className="flex-none" /> : isKid ? <X size={14} className="flex-none" /> : <span className="w-3.5 flex-none" />}
                          <span className="flex-1">{opt}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-none border-t border-[var(--border)] px-6 pb-6 pt-3">
          <GradientButton onClick={onBack} className="w-full">Continue Studying</GradientButton>
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
          <div className="h-full rounded-full bg-grad-violet transition-all" style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-6">
        <p className="animate-rise mb-7 text-center text-xl font-bold leading-relaxed text-[var(--ink)]">{q.question}</p>
        <div className="flex flex-col gap-3">
          {q.options.map((opt, i) => {
            const isSel = selected === opt
            const isCorrect = !!selected && opt === q.correctAnswer
            return (
              <PressButton key={i} onClick={() => !selected && submit(opt)} disabled={!!selected}
                className={`animate-pop-in rounded-2xl px-5 py-4 text-left font-semibold ${isCorrect ? 'bg-grad-accent text-[var(--on-accent)] glow-accent' : isSel ? 'bg-[var(--danger)] text-white' : 'grad-border text-[var(--ink)]'}`}
                style={{ animationDelay: `${i * 50}ms` }}>
                {opt}
              </PressButton>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// INTERVIEW
// ═══════════════════════════════════════════════════════════════════════

function InterviewView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const { data: topicData } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`),
  })
  const account = useAuthStore((s) => s.account)
  const kidName = (account?.persona?.name as string) || undefined
  const qc = useQueryClient()

  type Phase = 'intro' | 'connecting' | 'live' | 'scoring' | 'done' | 'error'
  const [phase, setPhase] = useState<Phase>('intro')
  const [elapsed, setElapsed] = useState(0)
  const [palLine, setPalLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<{ role: 'tutor' | 'kid'; text: string }[]>([])
  const [result, setResult] = useState<{ brainsEarned: number; score?: number; summary?: string; keepPractising?: string[] } | null>(null)

  const sockRef = useRef<LiveRtSocket | null>(null)
  const micRef = useRef<MicCaptureHandle | null>(null)
  const playerRef = useRef<PcmPlayer | null>(null)
  const micOnRef = useRef(true)
  const replyBufRef = useRef('')
  const pendingUserRef = useRef('')
  const interviewIdRef = useRef<string | null>(null)
  const scoreRef = useRef<InterviewScore | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef(0)
  const transcriptRef = useRef<{ role: 'tutor' | 'kid'; text: string }[]>([])
  const endedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [transcript, palLine, userLine])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    try { sockRef.current?.end() } catch { /* ignore */ }
    try { sockRef.current?.close() } catch { /* ignore */ }
    micRef.current?.stop()
    playerRef.current?.close()
    sockRef.current = null
    micRef.current = null
    playerRef.current = null
  }
  useEffect(() => () => cleanup(), [])

  async function begin() {
    setPhase('connecting')
    setError(null)
    try {
      // 1) Create the interview server-side, get its id + focus concepts.
      const created = await api<{ interviewId: string }>(`/study/topics/${topicId}/interview`, { method: 'POST' })
      interviewIdRef.current = created.interviewId
      // 2) Pull the topic's concept cards to ground the tutor.
      const { cards } = await api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards`)
      const concepts = cards.slice(0, 20).map((c) => ({ front: c.front, back: c.back }))

      // 3) Audio: player + mic.
      const player = new PcmPlayer()
      playerRef.current = player
      await player.resume()
      try {
        micRef.current = await startMicCapture((pcm) => {
          if (micOnRef.current && sockRef.current?.isOpen()) sockRef.current.sendMicPcm(pcm)
        })
      } catch {
        setError('I need your microphone for the interview. Allow it and try again.')
        setPhase('error')
        return
      }

      // 4) Connect the live tutor.
      const token = useAuthStore.getState().token
      const sock = connectLiveRt(
        {
          onOpen: () => {
            sock.start('kid', 'interview', undefined, {
              topicTitle: topicData?.topic?.title ?? 'this topic',
              concepts,
              kidName,
            })
            setPhase('live')
            timerRef.current = setInterval(() => { elapsedRef.current += 1; setElapsed(elapsedRef.current) }, 1000)
          },
          onUserTranscript: (t) => { setUserLine(t); pendingUserRef.current = t },
          onReplyDelta: (t) => { replyBufRef.current += t; setPalLine(replyBufRef.current); setSpeaking(true) },
          onTurnComplete: () => {
            const u = pendingUserRef.current.trim()
            const r = replyBufRef.current.trim()
            setTranscript((prev) => {
              const add: { role: 'tutor' | 'kid'; text: string }[] = []
              if (u) add.push({ role: 'kid', text: u })
              if (r) add.push({ role: 'tutor', text: r })
              return [...prev, ...add]
            })
            pendingUserRef.current = ''
            replyBufRef.current = ''
            setUserLine('')
            setSpeaking(false)
          },
          onInterrupted: () => { playerRef.current?.clear(); setSpeaking(false) },
          onPalAudioMp3: (mp3) => void playerRef.current?.enqueueEncoded(mp3),
          onInterviewScored: (s) => { scoreRef.current = s; void finish(s) },
          onError: () => { /* keep session; transient */ },
        },
        token,
      )
      sockRef.current = sock
    } catch {
      setError('Could not start the interview. Try again.')
      setPhase('error')
    }
  }

  async function finish(score?: InterviewScore) {
    if (endedRef.current) return
    endedRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('scoring')
    try { sockRef.current?.end() } catch { /* ignore */ }
    micRef.current?.stop()
    const id = interviewIdRef.current
    const s = score ?? scoreRef.current
    try {
      const res = await api<{ brainsEarned: number; score?: number }>(`/study/interviews/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          transcript: transcriptRef.current.map((t) => ({ role: t.role, text: t.text })),
          durationSecs: elapsedRef.current,
          score: s?.score,
        }),
      })
      setResult({ brainsEarned: res.brainsEarned, score: res.score, summary: s?.summary, keepPractising: s?.keepPractising })
      qc.invalidateQueries({ queryKey: ['study-stats'] })
    } catch {
      setResult({ brainsEarned: 0, summary: s?.summary, keepPractising: s?.keepPractising })
    }
    // Let any final audio finish, then show the result.
    setTimeout(() => setPhase('done'), 600)
  }

  function toggleMic() {
    setMicOn((on) => {
      const next = !on
      micOnRef.current = next
      sockRef.current?.setMic(next)
      return next
    })
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ─── Intro ───────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <Centered>
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="animate-float relative flex h-32 w-32 items-center justify-center rounded-full bg-grad-violet shadow-pop glow-violet">
              <span className="text-6xl">🎓</span>
              <div className="absolute inset-0 rounded-full bg-grad-violet opacity-40 blur-xl animate-glow" />
            </div>
            <div>
              <p className="text-xl font-extrabold text-[var(--ink)]">Tutor Interview</p>
              <p className="mt-1.5 max-w-xs text-sm text-[var(--muted)]">
                Your tutor will ask you to explain key concepts from {topicData?.topic?.emoji} {topicData?.topic?.title} out loud, and give you feedback.
              </p>
            </div>
            <div className="w-full max-w-xs rounded-2xl px-4 py-3 text-sm font-medium text-[var(--violet)] grad-border">
              🎤 Speak naturally — answer out loud, just like a real tutor.
            </div>
            <GradientButton variant="violet" onClick={begin} className="px-8">
              <Mic size={18} /> Start Interview
            </GradientButton>
          </div>
        </Centered>
      </>
    )
  }

  // ─── Error ───────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <Centered>
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-[var(--muted)]">{error ?? 'Something went wrong.'}</p>
            <GradientButton variant="violet" onClick={begin} className="px-8">Try again</GradientButton>
          </div>
        </Centered>
      </>
    )
  }

  // ─── Done — result ─────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {(result?.brainsEarned ?? 0) > 0 && <Confetti />}
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-64 w-64 -translate-x-1/2 rounded-full bg-grad-aurora opacity-25 blur-[80px]" />
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="animate-trophy flex h-28 w-28 items-center justify-center rounded-full bg-grad-violet shadow-pop glow-violet">
            <Trophy size={44} className="text-white" />
          </div>
          <h2 className="animate-rise text-2xl font-extrabold text-[var(--ink)]">Interview complete!</h2>
          {result?.summary && <p className="animate-rise max-w-xs text-sm text-[var(--muted)]" style={{ animationDelay: '0.08s' }}>{result.summary}</p>}
          {typeof result?.score === 'number' && <p className="animate-rise text-sm font-semibold text-[var(--violet)]" style={{ animationDelay: '0.12s' }}>Score: {result.score}/10</p>}
          {(result?.brainsEarned ?? 0) > 0 && (
            <p className="animate-rise rounded-full px-5 py-2.5 font-bold text-grad-accent grad-border" style={{ animationDelay: '0.18s' }}>+{result!.brainsEarned} 🧠 earned</p>
          )}
          {result?.keepPractising && result.keepPractising.length > 0 && (
            <div className="animate-rise mt-1 w-full max-w-xs text-left" style={{ animationDelay: '0.24s' }}>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">What to work on next</p>
              {result.keepPractising.map((k, i) => (
                <p key={i} className="text-sm text-[var(--ink)]">• {k}</p>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-none px-6 pb-6">
          <GradientButton variant="violet" onClick={onBack} className="w-full">Back to subject</GradientButton>
        </div>
      </div>
    )
  }

  // ─── Live / connecting / scoring ───────────────────────────────────────
  return (
    <>
      <Header
        title="AI Interview"
        onBack={() => { void finish(); }}
        right={<span className="text-xs font-semibold text-[var(--muted)]">{fmt(elapsed)}</span>}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Live tutor presence — focused, no avatar */}
        <div className="relative flex h-44 flex-none items-center justify-center">
          <span className="pointer-events-none absolute h-32 w-32 rounded-full bg-grad-violet opacity-25 blur-2xl animate-glow" />
          <div
            className={`relative flex items-center justify-center rounded-full bg-grad-violet glow-violet transition-all duration-300 ${micOn && phase === 'live' ? 'animate-listen' : ''}`}
            style={{ width: speaking ? 104 : 92, height: speaking ? 104 : 92 }}
          >
            <GraduationCap size={40} className="text-white" />
          </div>
          <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold glass text-[var(--ink)]">
            {phase === 'connecting' ? 'Connecting…' : phase === 'scoring' ? 'Scoring…' : speaking ? '🟣 Tutor speaking' : '🟢 Listening'}
          </span>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3" aria-live="polite" aria-atomic="false">
          {transcript.map((t, i) => (
            <div key={i} className={`animate-line-in ${t.role === 'kid' ? 'text-right' : ''}`}>
              <span
                className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${t.role === 'kid' ? 'text-on-accent glow-accent' : 'grad-border text-[var(--ink)]'}`}
                style={t.role === 'kid' ? { backgroundImage: 'var(--grad-accent-bright)' } : { backgroundImage: 'var(--grad-card)' }}
              >
                {t.text}
              </span>
            </div>
          ))}
          {userLine && <div className="text-right"><span className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm text-on-accent opacity-70" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>{userLine}</span></div>}
          {palLine && <div><span className="grad-border inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm italic text-[var(--ink)]" style={{ backgroundImage: 'var(--grad-card)' }}>{palLine}</span></div>}
          {phase === 'connecting' && <p className="pt-6 text-center text-sm text-[var(--muted)]">Waking up your tutor…</p>}
        </div>

        {/* Controls */}
        <div className="flex-none border-t border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <div className={`relative ${micOn && phase === 'live' ? 'animate-listen' : ''} rounded-full`}>
              <PressButton onClick={toggleMic} spring="lg" className={`relative flex h-14 w-14 items-center justify-center rounded-full ${micOn ? 'text-on-accent glow-accent' : 'glass text-[var(--muted)]'}`} style={micOn ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}>
                {micOn ? <Mic size={22} /> : <MicOff size={22} />}
              </PressButton>
            </div>
            <GradientButton variant="violet" onClick={() => void finish()} className="px-6">
              End interview
            </GradientButton>
          </div>
          <p className="mt-2 text-center text-xs text-[var(--faint)]">{micOn ? 'Listening — answer out loud' : 'Muted'}</p>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// LESSON CHAT — text chat grounded in the topic
// ═══════════════════════════════════════════════════════════════════════

function ChatView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const { data } = useQuery({
    queryKey: ['study-topic', topicId],
    queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`),
  })
  type Msg = { role: 'user' | 'assistant'; content: string }
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    const history = messages.slice(-10)
    setMessages((m) => [...m, { role: 'user', content: text }])
    setSending(true)
    try {
      const res = await api<{ reply: string }>(`/study/topics/${topicId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text, history }),
      })
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: "Hmm, I couldn't answer that just now. Try again?" }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Header title={`Chat · ${data?.topic?.title ?? 'Lesson'}`} onBack={onBack} />
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <div className="animate-float mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-grad-accent-bright glow-accent"><MessageCircle size={26} className="text-[var(--on-accent)]" /></div>
            <p className="text-lg font-extrabold text-[var(--ink)]">Ask anything</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Your tutor knows {data?.topic?.emoji} {data?.topic?.title}. Ask it to explain, give examples, or help with homework.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`animate-msg-in flex ${m.role === 'user' ? 'justify-end' : ''}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md text-on-accent glow-accent' : 'grad-border rounded-bl-md text-[var(--ink)]'}`}
              style={m.role === 'user' ? { backgroundImage: 'var(--grad-accent-bright)' } : { backgroundImage: 'var(--grad-card)' }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex"><div className="glass flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5">
            <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--muted)]" style={{ animationDelay: '0ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--muted)]" style={{ animationDelay: '160ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--muted)]" style={{ animationDelay: '320ms' }} />
          </div></div>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex flex-none items-center gap-2 border-t border-[var(--border)] p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this lesson…" className="grad-border h-12 flex-1 rounded-full bg-transparent px-4 text-[var(--ink)] outline-none placeholder:text-[var(--faint)]" />
        <PressButton type="submit" spring="lg" disabled={sending || !input.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-accent disabled:opacity-40 disabled:saturate-50" style={{ backgroundImage: 'var(--grad-accent-bright)', boxShadow: input.trim() ? 'var(--glow-accent)' : undefined }}>
          <Send size={18} />
        </PressButton>
      </form>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SAVED — bookmarked concept cards
// ═══════════════════════════════════════════════════════════════════════

function SavedView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['study-cards', topicId, 'bookmarked'],
    queryFn: () => api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards?bookmarked=true`),
  })
  const cards = data?.cards ?? []

  const unbookmark = useMutation({
    mutationFn: (cardId: string) => api(`/study/cards/${cardId}/bookmark`, { method: 'POST', body: JSON.stringify({ bookmarked: false }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-cards', topicId, 'bookmarked'] })
      qc.invalidateQueries({ queryKey: ['study-cards', topicId] })
    },
  })

  return (
    <>
      <Header title="Saved cards" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <Centered><Spinner /></Centered>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center px-4 pt-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl grad-border" style={{ backgroundImage: 'var(--grad-card)' }}><Bookmark size={24} className="text-[var(--muted)]" /></div>
            <p className="text-base font-bold text-[var(--ink)]">No saved cards yet</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Tap the bookmark on any concept while studying to keep it here. Saved cards survive regeneration.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((c, i) => (
              <div key={c.id} className="grad-border animate-pop-in rounded-2xl p-4" style={{ backgroundImage: 'var(--grad-card)', animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-grad-accent">Concept</span>
                  <PressButton onClick={() => unbookmark.mutate(c.id)} ripple={false} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--accent)]" aria-label="Remove bookmark">
                    <Bookmark size={16} fill="currentColor" />
                  </PressButton>
                </div>
                <p className="mt-1 font-bold leading-snug text-[var(--ink)]">{c.front}</p>
                <div className="my-3 h-px bg-[var(--border)]" />
                <p className="text-sm leading-relaxed text-[var(--muted)]">{c.back}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/** Build a study-document upload body from a picked file (shared by all uploaders). */
async function fileToDocBody(file: File): Promise<Record<string, unknown>> {
  if (file.type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.readAsDataURL(file)
    })
    return { title: file.name, fileUrl: dataUrl, fileType: 'image', content: `[Image: ${file.name}. Extract all text, formulas, diagrams and concepts.]` }
  }
  if (file.type === 'application/pdf') {
    const t = await file.text()
    return { title: file.name, fileUrl: `local://${file.name}`, fileType: 'pdf', content: t.length > 100 ? t.slice(0, 15000) : `[PDF: ${file.name}. Generate concepts for this subject.]` }
  }
  const t = await file.text()
  return {
    title: file.name,
    fileUrl: `local://${file.name}`,
    fileType: t.trim().length > 20 ? 'text' : 'file',
    content: t.trim().length > 20 ? t.slice(0, 15000) : `[File: ${file.name}. Generate study concepts relevant to this subject.]`,
  }
}

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
  if (status === 'ready') return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] grad-border">Ready</span>
  if (status === 'failed') return <span className="rounded-full bg-[var(--danger)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--danger)]">Failed</span>
  return <span className="flex items-center gap-1 rounded-full bg-[var(--warn)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--warn)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--warn)]" />Processing</span>
}
