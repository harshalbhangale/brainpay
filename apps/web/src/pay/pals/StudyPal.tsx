/**
 * StudyPal — the learning Pal, in the light "Soft Light Premium" system.
 * ───────────────────────────────────────────────────────────────────────────
 * A full port of the original dark StudyPal onto the `.pv` design language so it
 * sits seamlessly beside MoneyPal in the Pal switcher. Same backend, same flows
 * (setup → subjects → concepts / quiz / interview / chat / saved), restyled with
 * the shared primitives. The studypal accent (lilac) is supplied by the
 * `.pv[data-pal='studypal']` palette, so every var(--pv-accent) reads lilac here.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Brain, ChevronLeft, ChevronRight, GraduationCap, Mic, MicOff, Sparkles, Upload,
  Check, Plus, Flame, Trophy, Bookmark, MessageCircle, RefreshCw, Send as SendIcon, X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { uploadFile } from '../../lib/uploads'
import { connectLiveRt, type LiveRtSocket, type InterviewScore } from '../../lib/liveRt'
import { startMicCapture, PcmPlayer, type MicCaptureHandle } from '../../lib/liveAudio'
import { avatarSrc, useAvatar } from '../../lib/avatar'
import { useAuthStore } from '../../stores/auth'
import { VrmCompanion, type CompanionMood } from '../../components/VrmCompanion'
import { Button, Card, IconButton, ProgressBar } from '../components/primitives'
import { TopBar } from '../components/shell'
import { InterviewView } from './StudyInterview'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsDue: number; cardsMastered: number; topicsActive: number }
type ConceptCard = { id: string; front: string; back: string; status: string; bookmarked?: boolean }
type Doc = { id: string; title: string; fileType: string; processingStatus: string; chunkCount: number }
type View = 'setup' | 'home' | 'subject' | 'concepts' | 'quiz' | 'interview' | 'chat' | 'saved'

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

  useEffect(() => {
    if (!isLoading && topicsData && topicsData.topics.length === 0) setView('setup')
  }, [isLoading, topicsData])

  return (
    <div className="pv-pal-enter flex min-h-0 flex-1 flex-col">
      {isLoading ? (
        <Centered><Spinner label="Loading StudyPal…" /></Centered>
      ) : view === 'setup' ? (
        <GradeSetup onDone={() => setView('home')} canCancel={hasTopics} onCancel={() => setView('home')} />
      ) : view === 'subject' && selectedTopic ? (
        <SubjectHub topicId={selectedTopic} onBack={() => setView('home')} onConcepts={() => setView('concepts')} onQuiz={() => setView('quiz')} onInterview={() => setView('interview')} onChat={() => setView('chat')} onSaved={() => setView('saved')} />
      ) : view === 'concepts' && selectedTopic ? (
        <ConceptsView topicId={selectedTopic} onBack={() => setView('subject')} onQuiz={() => setView('quiz')} />
      ) : view === 'quiz' && selectedTopic ? (
        <QuizView topicId={selectedTopic} onBack={() => setView('subject')} />
      ) : view === 'interview' && selectedTopic ? (
        <InterviewView topicId={selectedTopic} onBack={() => setView('subject')} onChat={() => setView('chat')} />
      ) : view === 'chat' && selectedTopic ? (
        <ChatView topicId={selectedTopic} onBack={() => setView('subject')} />
      ) : view === 'saved' && selectedTopic ? (
        <SavedView topicId={selectedTopic} onBack={() => setView('subject')} />
      ) : (
        <HomeView stats={stats} topics={topicsData?.topics ?? []} onSelect={(id) => { setSelectedTopic(id); setView('subject') }} onSetup={() => setView('setup')} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED LAYOUT
// ═══════════════════════════════════════════════════════════════════════

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6">{children}</div>
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full" style={{ border: '3px solid var(--pv-surface-3)' }} />
        <div className="absolute inset-0 animate-spin rounded-full" style={{ border: '3px solid transparent', borderTopColor: 'var(--pv-accent)' }} />
        <Sparkles size={18} className="absolute inset-0 m-auto" style={{ color: 'var(--pv-accent)' }} />
      </div>
      {label && <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>{label}</p>}
    </div>
  )
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-3 px-4 pb-2 pt-2">
      {onBack ? <IconButton Icon={ChevronLeft} ariaLabel="Back" tone="light" size={40} onClick={onBack} /> : <div className="w-10" />}
      <h2 className="pv-title flex-1 truncate text-center">{title}</h2>
      <div className="flex w-10 justify-end">{right}</div>
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
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleSubject = (s: string) => setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length) setFiles((prev) => [...prev, ...picked])
    e.target.value = ''
  }
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const generate = async () => {
    setCreating(true)
    setError(null)
    try {
      // Read uploaded materials once, then attach them to every selected subject.
      const fileBodies = await Promise.all(files.map(fileToDocBody))
      for (const subject of subjects) {
        const { topic } = await api<{ topic: { id: string } }>('/study/topics', {
          method: 'POST', body: JSON.stringify({ title: `${subject} — ${grade}`, emoji: subjectEmoji(subject) }),
        })
        const content = `Generate key concepts, important definitions, formulas, and study material for:\nSubject: ${subject}\nGrade: ${grade}\n${extraInfo ? `Additional context from student: ${extraInfo}` : ''}\n\nCreate comprehensive study material covering the most important topics for this grade level.`
        await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify({ title: `${subject} concepts`, fileUrl: 'text://inline', fileType: 'text', content }) })
        // Attach the student's uploaded PDFs / images / notes as extra material.
        for (const body of fileBodies) {
          await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify(body) })
        }
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
        <div className="pv-pop flex flex-col items-center gap-6 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full" style={{ border: '3px solid transparent', borderTopColor: 'var(--pv-accent)' }} />
            <Sparkles size={30} style={{ color: 'var(--pv-accent)' }} />
          </div>
          <div>
            <p className="pv-h2 pv-text-accent">Building your study deck…</p>
            <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>Generating concepts for {subjects.length} subject{subjects.length > 1 ? 's' : ''}.<br />This takes a few seconds.</p>
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

      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="pv-rise mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
            <X size={16} className="flex-none" /> {error}
          </div>
        )}
        <div className="pv-rise mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
            <GraduationCap size={28} />
          </div>
          <h1 className="pv-h1">{step === 'grade' ? 'What grade are you in?' : step === 'subjects' ? 'Pick your subjects' : 'Anything specific?'}</h1>
          <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>
            {step === 'grade' ? "We'll tailor concepts to your level" : step === 'subjects' ? 'Choose what you want to study' : 'Exams, weak areas, chapters — optional'}
          </p>
        </div>

        {step === 'grade' && (
          <div className="grid grid-cols-2 gap-3">
            {GRADES.map((g, i) => (
              <button key={g} onClick={() => { setGrade(g); setStep('subjects') }}
                className="pv-press pv-pop pv-title rounded-2xl py-4 text-center"
                style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 28}ms` }}>
                {g}
              </button>
            ))}
          </div>
        )}

        {step === 'subjects' && (
          <div className="flex flex-col gap-2.5">
            {(SUBJECTS[grade] ?? []).map((s, i) => {
              const on = subjects.includes(s)
              return (
                <button key={s} onClick={() => toggleSubject(s)}
                  className="pv-press pv-pop flex items-center gap-3 rounded-2xl px-4 py-3.5 font-bold"
                  style={on ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 28}ms` } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 28}ms` }}>
                  <span className="text-xl">{subjectEmoji(s)}</span>
                  <span className="flex-1 text-left">{s}</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ border: on ? '2px solid currentColor' : '2px solid var(--pv-line-strong)' }}>
                    {on && <Check size={14} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {step === 'extra' && (
          <div className="flex flex-col gap-4">
            <textarea value={extraInfo} onChange={(e) => setExtraInfo(e.target.value)} rows={5}
              placeholder="e.g. Board exams in March, focus on Chapters 5–8 of Physics, I struggle with trigonometry…"
              className="pv-body w-full resize-none rounded-2xl px-4 py-3.5 outline-none"
              style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink)' }} />

            <div>
              <label className="pv-sheen flex cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                <Upload size={16} /> Upload PDFs, images or notes
                <input type="file" multiple accept=".pdf,image/*,.txt,.md,.doc,.docx,.ppt,.pptx" className="hidden" onChange={onPickFiles} />
              </label>
              <p className="mt-2 text-center text-xs" style={{ color: 'var(--pv-ink-3)' }}>
                Syllabus, past papers, textbook photos — your tutor learns from them.
              </p>

              {files.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="pv-pop flex items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
                      <span className="text-base">{f.type === 'application/pdf' ? '📄' : f.type.startsWith('image/') ? '🖼️' : '📝'}</span>
                      <p className="flex-1 truncate text-sm font-medium">{f.name}</p>
                      <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`} className="pv-press flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(step === 'subjects' || step === 'extra') && (
        <div className="flex-none px-6 pb-6 pt-2">
          {step === 'subjects' ? (
            <Button variant="accent" size="lg" full onClick={() => setStep('extra')} disabled={subjects.length === 0}>
              Next {subjects.length > 0 && `· ${subjects.length} selected`}
            </Button>
          ) : (
            <Button variant="accent" size="lg" full leadingIcon={Sparkles} onClick={generate}>Generate Concepts{files.length > 0 ? ` · ${files.length} file${files.length > 1 ? 's' : ''}` : ''}</Button>
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
  const healthPct = stats && stats.cardsMastered + stats.cardsDue > 0
    ? Math.min(100, Math.round((stats.cardsMastered / (stats.cardsMastered + stats.cardsDue)) * 100))
    : 0

  return (
    <>
      <TopBar
        leading={<div><div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Keep your brain sharp</div><div className="pv-title leading-tight">StudyPal</div></div>}
        trailing={<IconButton Icon={Plus} ariaLabel="Add subjects" tone="dark" onClick={onSetup} />}
      />

      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <h1 className="pv-display pv-rise mt-3" style={{ ['--i' as string]: 0 }}>
          Hi there,
          <br />
          <span style={{ color: 'var(--pv-ink-3)' }}>let's learn.</span>
        </h1>

        {stats && (
          <Card className="pv-rise mt-6 overflow-hidden p-5" style={{ ['--i' as string]: 1, background: 'var(--pv-grad-ink)' }}>
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold" style={{ color: 'var(--pv-on-dark)' }}><Brain size={18} style={{ color: 'var(--pv-accent)' }} /> Brain Health</span>
              <span className="pv-amount text-2xl" style={{ color: 'var(--pv-accent)' }}>{healthPct}%</span>
            </div>
            <div className="pv-progress" style={{ background: 'rgba(255,255,255,0.16)' }}>
              <span style={{ width: `${healthPct}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat icon={<Flame size={15} style={{ color: '#ffb24a' }} />} value={stats.streak} label="day streak" />
              <MiniStat icon={<BookOpen size={15} style={{ color: 'var(--pv-accent)' }} />} value={stats.cardsDue} label="to review" />
              <MiniStat icon={<Check size={15} style={{ color: 'var(--pv-accent)' }} />} value={stats.cardsMastered} label="mastered" />
            </div>
          </Card>
        )}

        <p className="pv-label pv-rise mb-3 mt-7" style={{ ['--i' as string]: 2 }}>Subjects</p>
        <div className="flex flex-col gap-3">
          {topics.map((t, i) => {
            const pct = t.totalCards > 0 ? Math.round(((t.totalCards - t.cardsDue) / t.totalCards) * 100) : 0
            return (
              <Card key={t.id} onClick={() => onSelect(t.id)} className="pv-rise flex items-center gap-4 p-4" style={{ ['--i' as string]: 3 + i }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: 'var(--pv-surface-2)' }}>{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="pv-title truncate">{t.title}</p>
                  <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>
                    {t.totalCards === 0 ? 'Generating…' : `${t.totalCards} concepts · ${t.cardsDue} to review`}
                  </p>
                </div>
                {t.totalCards > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="pv-amount text-sm pv-text-accent">{pct}%</span>
                    <ChevronRight size={16} style={{ color: 'var(--pv-ink-3)' }} />
                  </div>
                )}
              </Card>
            )
          })}
          {topics.length === 0 && (
            <Card className="flex flex-col items-center gap-3 p-8 text-center">
              <BookOpen size={28} style={{ color: 'var(--pv-ink-3)' }} />
              <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>No subjects yet. Add some to start learning.</p>
              <Button variant="accent" leadingIcon={Plus} onClick={onSetup}>Add subjects</Button>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl py-2.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
      <span className="pv-amount flex items-center gap-1 text-base" style={{ color: 'var(--pv-on-dark)' }}>{icon}{value}</span>
      <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
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
    } catch { /* ignore */ }
    setRegenerating(false)
    setConfirmRegen(false)
  }

  return (
    <>
      <Header title={`${topic?.emoji ?? ''} ${topic?.title ?? ''}`} onBack={onBack} />

      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Card className="pv-pop mb-6 flex items-center gap-5 p-5">
          <ProgressRing pct={pct} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--pv-ink-2)' }}>Your progress</p>
            <p className="pv-amount text-2xl">{mastered}<span className="text-base font-semibold" style={{ color: 'var(--pv-ink-3)' }}>/{total} concepts</span></p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>{generating ? 'Generating concepts…' : due > 0 ? `${due} ready to review` : 'All caught up 🎉'}</p>
          </div>
        </Card>

        <p className="pv-label mb-3">What would you like to do?</p>
        <div className="flex flex-col gap-3">
          <HubOption icon={<BookOpen size={22} />} title="Study Concepts" subtitle={generating ? 'Preparing your cards…' : `${total} flashcards · swipe to learn`} onClick={onConcepts} disabled={generating} delay={0} />
          <HubOption icon={<MessageCircle size={22} />} title="Chat with this lesson" subtitle="Ask anything — the tutor knows this topic" onClick={onChat} delay={60} />
          <HubOption icon={<Sparkles size={22} />} title="Take a Quiz" subtitle="Test yourself with auto-generated questions" onClick={onQuiz} disabled={generating} delay={120} />
          <HubOption icon={<Mic size={22} />} title="AI Interview" subtitle="Explain concepts out loud to a tutor" onClick={onInterview} disabled={generating} delay={180} />
          <HubOption icon={<Bookmark size={22} />} title="Saved cards" subtitle="Your bookmarked concepts" onClick={onSaved} delay={240} />
        </div>

        <div className="mt-7 flex items-center justify-between">
          <p className="pv-label">Materials</p>
          <button onClick={() => setShowMaterials((v) => !v)} className="pv-press text-sm font-bold pv-text-accent">{showMaterials ? 'Hide' : 'Add material'}</button>
        </div>

        {documents.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {documents.map((doc) => (
              <Card key={doc.id} flat className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="text-base">{docIcon(doc.fileType)}</span>
                <p className="flex-1 truncate text-sm font-medium">{doc.title}</p>
                <DocStatus status={doc.processingStatus} />
              </Card>
            ))}
          </div>
        )}

        {showMaterials && <MaterialsUploader topicId={topicId} onUploaded={() => qc.invalidateQueries({ queryKey: ['study-topic', topicId] })} />}

        <div className="mt-7">
          <button onClick={() => setConfirmRegen(true)} className="pv-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            <RefreshCw size={16} style={{ color: 'var(--pv-accent)' }} /> Regenerate concepts
          </button>
        </div>
      </div>

      {confirmRegen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" onClick={() => !regenerating && setConfirmRegen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)', backdropFilter: 'blur(4px)' }} />
          <div onClick={(e) => e.stopPropagation()} className="pv-rise relative m-4 w-full max-w-sm rounded-[28px] p-6" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><RefreshCw size={22} /></div>
            <h3 className="pv-h2">Regenerate concepts?</h3>
            <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>We'll rebuild this topic's flashcards from your current materials. Your <span style={{ fontWeight: 700, color: 'var(--pv-ink)' }}>saved (bookmarked) cards are kept</span> — the rest are replaced, which resets their review progress.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="soft" full onClick={() => setConfirmRegen(false)} disabled={regenerating}>Cancel</Button>
              <Button variant="accent" full onClick={regenerate} disabled={regenerating}>{regenerating ? 'Rebuilding…' : 'Regenerate'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

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
    <Card className="pv-rise mt-3 p-4">
      <label className="pv-sheen mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
        <Upload size={16} /> Upload PDF, image, or any file
        <input type="file" className="hidden" onChange={onFile} />
      </label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Or paste notes / textbook text…" className="pv-body mb-2 w-full resize-none rounded-2xl px-3 py-2.5 outline-none" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }} />
      {notes.trim() && (
        <Button variant="primary" full onClick={() => upload({ title: 'My notes', fileUrl: 'text://inline', fileType: 'text', content: notes.trim() })} disabled={uploading}>
          {uploading ? 'Processing…' : 'Add & generate cards'}
        </Button>
      )}
    </Card>
  )
}

function HubOption({ icon, title, subtitle, onClick, disabled, delay }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; disabled?: boolean; delay: number }) {
  return (
    <Card onClick={disabled ? undefined : onClick} className="pv-rise flex items-center gap-4 p-4" style={{ animationDelay: `${delay}ms`, opacity: disabled ? 0.5 : 1 }}>
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="pv-title">{title}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>{subtitle}</p>
      </div>
      <ChevronRight size={18} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
    </Card>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <div className="relative h-16 w-16 flex-none">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--pv-surface-3)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--pv-accent)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <span className="pv-amount absolute inset-0 flex items-center justify-center text-sm">{pct}%</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// CONCEPTS
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

  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null)
  const startX = useRef<number | null>(null)

  const reviewMut = useMutation({
    mutationFn: (v: { cardId: string; quality: number }) => api(`/study/cards/${v.cardId}/review`, { method: 'POST', body: JSON.stringify({ quality: v.quality }) }),
  })

  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>({})
  const toggleBookmark = (cd: ConceptCard) => {
    const next = !(bookmarks[cd.id] ?? cd.bookmarked ?? false)
    setBookmarks((b) => ({ ...b, [cd.id]: next }))
    api(`/study/cards/${cd.id}/bookmark`, { method: 'POST', body: JSON.stringify({ bookmarked: next }) })
      .then(() => qc.invalidateQueries({ queryKey: ['study-cards', topicId, 'bookmarked'] }))
      .catch(() => setBookmarks((b) => ({ ...b, [cd.id]: !next })))
  }

  const card = cards[current]
  const cardSaved = card ? (bookmarks[card.id] ?? card.bookmarked ?? false) : false

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

  if (done) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <Confetti />
        <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="animate-trophy mb-6 flex h-28 w-28 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
            <Trophy size={44} />
          </div>
          <h2 className="pv-h1 pv-rise pv-text-accent">Brilliant!</h2>
          <p className="pv-body pv-rise mt-2" style={{ animationDelay: '0.1s', color: 'var(--pv-ink-2)' }}>
            You reviewed all {cards.length} concepts in<br />{data?.topic?.emoji} {data?.topic?.title}
          </p>
          <div className="pv-rise mt-6 flex items-center gap-2 rounded-full px-5 py-2.5" style={{ animationDelay: '0.2s', background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            <span className="text-lg">🧠</span><span className="font-bold">Review 10 cards a day to earn Brains</span>
          </div>
        </div>
        <div className="pv-rise flex-none px-6 py-5" style={{ animationDelay: '0.35s' }}>
          <div className="flex gap-3">
            <Button variant="accent" full leadingIcon={Sparkles} onClick={onQuiz}>Quiz</Button>
            <Button variant="primary" full leadingIcon={Mic}>Interview</Button>
          </div>
          <button onClick={onBack} className="pv-press mt-3 w-full py-2 text-sm font-medium" style={{ color: 'var(--pv-ink-3)' }}>Back to subjects</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header title={`${data?.topic?.emoji ?? ''} ${data?.topic?.title ?? ''}`} onBack={onBack} />

      {card ? (
        <>
          <div className="flex-none px-6 pt-2">
            <ProgressBar value={current} max={cards.length} />
            <p className="mt-2 text-center text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{current + 1} of {cards.length}</p>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
            <div className="relative w-full" style={{ height: 'min(56vh, 440px)' }}>
              {cards[current + 1] && <div className="absolute inset-x-2 top-3 bottom-0 scale-[0.97] rounded-[28px]" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', opacity: 0.6 }} />}
              <div
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                className="absolute inset-0 flex cursor-grab touch-none select-none flex-col overflow-hidden rounded-[28px] p-6 active:cursor-grabbing"
                style={{
                  background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)',
                  transform: leaving ? `translateX(${leaving === 'right' ? 600 : -600}px) rotate(${leaving === 'right' ? 18 : -18}deg)` : `translateX(${drag}px) rotate(${drag * 0.035}deg)`,
                  transition: leaving || startX.current === null ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
                  opacity: leaving ? 0 : 1,
                }}
              >
                {drag !== 0 && <div className="pointer-events-none absolute inset-0 rounded-[28px]" style={{ background: drag > 0 ? 'radial-gradient(circle at 100% 50%, var(--pv-accent-soft), transparent 60%)' : 'radial-gradient(circle at 0% 50%, var(--pv-neg-soft), transparent 60%)' }} />}
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="pv-label pv-text-accent">Concept</span>
                  <button onClick={() => toggleBookmark(card)} onPointerDown={(e) => e.stopPropagation()} className="pv-press flex h-8 w-8 items-center justify-center rounded-full" style={{ color: 'var(--pv-accent)' }} aria-label={cardSaved ? 'Remove bookmark' : 'Save card'}>
                    <Bookmark size={18} fill={cardSaved ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <p className="text-xl font-bold leading-snug">{card.front}</p>
                <div className="my-4 h-px" style={{ background: 'var(--pv-line)' }} />
                <span className="pv-label mb-2">Explanation</span>
                <p className="pv-no-scrollbar flex-1 overflow-y-auto text-base leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>{card.back}</p>
              </div>
            </div>
          </div>

          <div className="flex-none px-6 pb-6 pt-1">
            <p className="mb-2.5 text-center text-xs font-semibold" style={{ color: 'var(--pv-ink-2)' }}>How well did you know it?</p>
            <div className="flex gap-2.5">
              <button onClick={() => advance(2, 'left')} className="pv-press flex-1 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>Forgot</button>
              <button onClick={() => advance(4, 'right')} className="pv-press pv-sheen flex-[1.4] rounded-2xl py-3.5 text-sm font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>Got it</button>
              <button onClick={() => advance(5, 'right')} className="pv-press flex-1 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>Easy</button>
            </div>
            <p className="mt-2.5 text-center text-xs" style={{ color: 'var(--pv-ink-3)' }}>swipe ← forgot · got it →</p>
          </div>
        </>
      ) : (
        <Centered>
          <div className="flex flex-col items-center gap-5 text-center">
            <Spinner />
            <div>
              <p className="pv-title">Generating concepts…</p>
              <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>Hang tight, this takes a few seconds.</p>
            </div>
          </div>
        </Centered>
      )}
    </>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 40 })
  const colors = ['#c5f441', '#8b7cff', '#34d399', '#38bdf8', '#ffb24a', '#ff7eb6']
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

  if (loading) return (<><Header title="Quiz" onBack={onBack} /><Centered><div className="flex flex-col items-center gap-5 text-center"><Spinner /><div><p className="pv-title">Creating your quiz…</p><p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>Building questions from your concepts.</p></div></div></Centered></>)
  if (failed || !quiz) return (<><Header title="Quiz" onBack={onBack} /><Centered><p className="pv-body text-center" style={{ color: 'var(--pv-ink-2)' }}>Couldn't generate a quiz yet.<br />Review some concepts first, then try again.</p></Centered></>)

  if (result) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {result.scorePct >= 80 && <Confetti />}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-center gap-4 px-8 pt-8 text-center">
            <div className="animate-trophy flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
              <span className="pv-amount text-2xl">{result.scorePct}%</span>
            </div>
            <h2 className="pv-h1 pv-rise">{result.scorePct >= 80 ? 'Excellent! 🎉' : result.scorePct >= 50 ? 'Good effort! 💪' : 'Keep studying! 📚'}</h2>
            {result.brainsEarned > 0 && <p className="pv-rise rounded-full px-5 py-2.5 font-bold pv-text-accent" style={{ animationDelay: '0.1s', background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>+{result.brainsEarned} 🧠 earned</p>}
            {result.questions && result.questions.length > 0 && (
              <button onClick={() => setShowReview((v) => !v)} className="pv-press text-sm font-bold pv-text-accent">{showReview ? 'Hide answers' : 'Review answers'}</button>
            )}
          </div>

          {showReview && result.questions && (
            <div className="pv-no-scrollbar pv-rise mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-4">
              {result.questions.map((q, i) => (
                <Card key={i} className="p-4">
                  <p className="mb-2.5 text-sm font-bold leading-snug">{i + 1}. {q.question}</p>
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((opt, j) => {
                      const isCorrect = opt === q.correctAnswer
                      const isKid = opt === q.kidAnswer
                      return (
                        <div key={j} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                          style={isCorrect ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : isKid ? { background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' } : { color: 'var(--pv-ink-2)' }}>
                          {isCorrect ? <Check size={14} className="flex-none" /> : isKid ? <X size={14} className="flex-none" /> : <span className="w-3.5 flex-none" />}
                          <span className="flex-1">{opt}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-none px-6 pb-6 pt-3">
          <Button variant="accent" size="lg" full onClick={onBack}>Continue Studying</Button>
        </div>
      </div>
    )
  }

  const q = quiz.questions[current]
  return (
    <>
      <Header title="Quiz" onBack={onBack} right={<span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{current + 1}/{quiz.questions.length}</span>} />
      <div className="flex-none px-6 pt-2">
        <ProgressBar value={current + 1} max={quiz.questions.length} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-6">
        <p className="pv-rise mb-7 text-center text-xl font-bold leading-relaxed">{q.question}</p>
        <div className="flex flex-col gap-3">
          {q.options.map((opt, i) => {
            const isSel = selected === opt
            const isCorrect = !!selected && opt === q.correctAnswer
            return (
              <button key={i} onClick={() => !selected && submit(opt)} disabled={!!selected}
                className="pv-press pv-pop rounded-2xl px-5 py-4 text-left font-semibold"
                style={isCorrect ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 50}ms` } : isSel ? { background: 'var(--pv-neg)', color: '#fff', animationDelay: `${i * 50}ms` } : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 50}ms` }}>
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
// INTERVIEW
// ═══════════════════════════════════════════════════════════════════════

function LegacyInterviewView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const { data: topicData } = useQuery({ queryKey: ['study-topic', topicId], queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`) })
  const account = useAuthStore((s) => s.account)
  const kidName = (account?.persona?.name as string) || undefined
  const avatar = useAvatar((s) => s.avatar)
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
      const created = await api<{ interviewId: string }>(`/study/topics/${topicId}/interview`, { method: 'POST' })
      interviewIdRef.current = created.interviewId
      const { cards } = await api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards`)
      const concepts = cards.slice(0, 20).map((c) => ({ front: c.front, back: c.back }))

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

      const token = useAuthStore.getState().token
      const sock = connectLiveRt(
        {
          onOpen: () => {
            sock.start('kid', 'interview', undefined, { topicTitle: topicData?.topic?.title ?? 'this topic', concepts, kidName })
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
        body: JSON.stringify({ transcript: transcriptRef.current.map((t) => ({ role: t.role, text: t.text })), durationSecs: elapsedRef.current, score: s?.score }),
      })
      setResult({ brainsEarned: res.brainsEarned, score: res.score, summary: s?.summary, keepPractising: s?.keepPractising })
      qc.invalidateQueries({ queryKey: ['study-stats'] })
    } catch {
      setResult({ brainsEarned: 0, summary: s?.summary, keepPractising: s?.keepPractising })
    }
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

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const mood: CompanionMood = speaking ? 'happy' : 'neutral'

  if (phase === 'intro') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <Centered>
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="animate-float relative flex h-32 w-32 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
              <span className="text-6xl">🎓</span>
            </div>
            <div>
              <p className="pv-h2">Tutor Interview</p>
              <p className="pv-body mt-1.5 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>
                Your tutor will ask you to explain key concepts from {topicData?.topic?.emoji} {topicData?.topic?.title} out loud, and give you feedback.
              </p>
            </div>
            <div className="w-full max-w-xs rounded-2xl px-4 py-3 text-sm font-medium" style={{ background: 'var(--pv-accent-soft)', color: 'var(--pv-ink)' }}>
              🎤 Speak naturally — answer out loud, just like a real tutor.
            </div>
            <Button variant="accent" size="lg" leadingIcon={Mic} onClick={begin}>Start Interview</Button>
          </div>
        </Centered>
      </>
    )
  }

  if (phase === 'error') {
    return (
      <>
        <Header title="AI Interview" onBack={onBack} />
        <Centered>
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>{error ?? 'Something went wrong.'}</p>
            <Button variant="accent" size="lg" onClick={begin}>Try again</Button>
          </div>
        </Centered>
      </>
    )
  }

  if (phase === 'done') {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        {(result?.brainsEarned ?? 0) > 0 && <Confetti />}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="animate-trophy flex h-28 w-28 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
            <Trophy size={44} />
          </div>
          <h2 className="pv-h1 pv-rise">Interview complete!</h2>
          {result?.summary && <p className="pv-body pv-rise max-w-xs" style={{ animationDelay: '0.08s', color: 'var(--pv-ink-2)' }}>{result.summary}</p>}
          {typeof result?.score === 'number' && <p className="pv-rise text-sm font-semibold pv-text-accent" style={{ animationDelay: '0.12s' }}>Score: {result.score}/10</p>}
          {(result?.brainsEarned ?? 0) > 0 && (
            <p className="pv-rise rounded-full px-5 py-2.5 font-bold pv-text-accent" style={{ animationDelay: '0.18s', background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>+{result!.brainsEarned} 🧠 earned</p>
          )}
          {result?.keepPractising && result.keepPractising.length > 0 && (
            <div className="pv-rise mt-1 w-full max-w-xs text-left" style={{ animationDelay: '0.24s' }}>
              <p className="pv-label mb-1">Keep practising</p>
              {result.keepPractising.map((k, i) => (<p key={i} className="text-sm">• {k}</p>))}
            </div>
          )}
        </div>
        <div className="relative flex-none px-6 pb-6">
          <Button variant="accent" size="lg" full onClick={onBack}>Back to subject</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header title="AI Interview" onBack={() => { void finish() }} right={<span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{fmtTime(elapsed)}</span>} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative h-52 flex-none">
          <VrmCompanion src={avatarSrc(avatar)} getLevel={() => playerRef.current?.getLevel() ?? 0} mood={mood} className="absolute inset-0 animate-float" />
          <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            {phase === 'connecting' ? 'Connecting…' : phase === 'scoring' ? 'Scoring…' : '🟢 Live'}
          </span>
        </div>

        <div ref={scrollRef} className="pv-no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3" aria-live="polite" aria-atomic="false">
          {transcript.map((t, i) => (
            <div key={i} className={`animate-line-in ${t.role === 'kid' ? 'text-right' : ''}`}>
              <span className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm"
                style={t.role === 'kid' ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
                {t.text}
              </span>
            </div>
          ))}
          {userLine && <div className="text-right"><span className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm opacity-70" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>{userLine}</span></div>}
          {palLine && <div><span className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm italic" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>{palLine}</span></div>}
          {phase === 'connecting' && <p className="pt-6 text-center text-sm" style={{ color: 'var(--pv-ink-2)' }}>Waking up your tutor…</p>}
        </div>

        <div className="flex-none px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <div className={`relative ${micOn && phase === 'live' ? 'animate-listen' : ''} rounded-full`}>
              <button onClick={toggleMic} className="pv-press-lg relative flex h-14 w-14 items-center justify-center rounded-full" style={micOn ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}>
                {micOn ? <Mic size={22} /> : <MicOff size={22} />}
              </button>
            </div>
            <Button variant="primary" size="lg" onClick={() => void finish()}>End interview</Button>
          </div>
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--pv-ink-3)' }}>{micOn ? 'Listening — answer out loud' : 'Muted'}</p>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// LESSON CHAT
// ═══════════════════════════════════════════════════════════════════════

function ChatView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const { data } = useQuery({ queryKey: ['study-topic', topicId], queryFn: () => api<{ topic: Topic }>(`/study/topics/${topicId}`) })
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
      const res = await api<{ reply: string }>(`/study/topics/${topicId}/chat`, { method: 'POST', body: JSON.stringify({ message: text, history }) })
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
      <div ref={scrollRef} className="pv-no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <div className="animate-float mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><MessageCircle size={26} /></div>
            <p className="pv-h2">Ask anything</p>
            <p className="pv-body mt-1 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>Your tutor knows {data?.topic?.emoji} {data?.topic?.title}. Ask it to explain, give examples, or help with homework.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              style={m.role === 'user' ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 } : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', borderBottomLeftRadius: 6 }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex"><div className="flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
          </div></div>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex flex-none items-center gap-2 p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this lesson…" className="pv-body h-12 flex-1 rounded-full px-4 outline-none" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink)' }} />
        <button type="submit" disabled={sending || !input.trim()} className="pv-press-lg flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
          <SendIcon size={18} />
        </button>
      </form>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SAVED
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
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <Centered><Spinner /></Centered>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center px-4 pt-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><Bookmark size={24} style={{ color: 'var(--pv-ink-3)' }} /></div>
            <p className="pv-title">No saved cards yet</p>
            <p className="pv-body mt-1 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>Tap the bookmark on any concept while studying to keep it here. Saved cards survive regeneration.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((c, i) => (
              <Card key={c.id} className="pv-pop p-4" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="pv-label pv-text-accent">Concept</span>
                  <button onClick={() => unbookmark.mutate(c.id)} className="pv-press flex h-7 w-7 items-center justify-center rounded-full" style={{ color: 'var(--pv-accent)' }} aria-label="Remove bookmark">
                    <Bookmark size={16} fill="currentColor" />
                  </button>
                </div>
                <p className="mt-1 font-bold leading-snug">{c.front}</p>
                <div className="my-3 h-px" style={{ background: 'var(--pv-line)' }} />
                <p className="text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>{c.back}</p>
              </Card>
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

async function fileToDocBody(file: File): Promise<Record<string, unknown>> {
  if (file.type.startsWith('image/')) {
    try {
      const { fileRef } = await uploadFile(file, 'study-doc')
      return { title: file.name, fileUrl: fileRef, fileType: 'image', content: `[Image: ${file.name}. Extract all text, formulas, diagrams and concepts.]` }
    } catch {
      // Fallback to an inline data URL so uploads still work if storage is down.
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.readAsDataURL(file)
      })
      return { title: file.name, fileUrl: dataUrl, fileType: 'image', content: `[Image: ${file.name}. Extract all text, formulas, diagrams and concepts.]` }
    }
  }
  if (file.type === 'application/pdf') {
    const t = await file.text()
    let fileUrl = `local://${file.name}`
    try { fileUrl = (await uploadFile(file, 'study-doc')).fileRef } catch { /* keep local ref */ }
    return { title: file.name, fileUrl, fileType: 'pdf', content: t.length > 100 ? t.slice(0, 15000) : `[PDF: ${file.name}. Generate concepts for this subject.]` }
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
  if (status === 'ready') return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-pos-soft)', color: 'var(--pv-pos)' }}>Ready</span>
  if (status === 'failed') return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>Failed</span>
  return <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-warn)' }}><span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--pv-warn)' }} />Processing</span>
}
