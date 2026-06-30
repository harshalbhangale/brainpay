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
  History, Clock, Eye, ExternalLink, SlidersHorizontal,
} from 'lucide-react'
import { api } from '../../lib/api'
import { uploadFile } from '../../lib/uploads'
import { useAuthStore } from '../../stores/auth'
import { Button, Card, IconButton, ProgressBar } from '../components/primitives'
import { TopBar } from '../components/shell'
import { InterviewView } from './StudyInterview'
import { GRADES, BOARDS, subjectsForGrade, subjectEmoji } from './subjects'
import { ParentStudyView } from './ParentStudy'
import { BrainCoin, Brains, BrainsPill, RewardsHelp } from '../components/Brains'
import { InterviewInsights, type InterviewAnalysis } from './InterviewInsights'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsDue: number; cardsMastered: number; topicsActive: number }
type ConceptCard = { id: string; front: string; back: string; status: string; bookmarked?: boolean }
type Cheatsheet = { emoji: string; title: string; definition: string; keyPoints: string[]; example: string; analogy: string; formula: string; mistake: string }
type Doc = { id: string; title: string; fileType: string; processingStatus: string; chunkCount: number }
type Focus = { lookingPct?: number; flags?: string[]; notes?: string }
type ChapterRowT = { chapter: string; total: number; due: number; mastered: number }
type InterviewRow = {
  id: string; chapter: string | null; mode: string; score: number | null; summary: string | null
  durationSecs: number | null; brainsEarned: number | null; keepPractising?: string[]; focus?: Focus | null
  completedAt: string | null; createdAt: string; topicTitle?: string | null; topicEmoji?: string | null
  analysis?: InterviewAnalysis | null
}
type View = 'setup' | 'home' | 'subject' | 'concepts' | 'quiz' | 'interview' | 'chat' | 'saved' | 'history' | 'interviewDetail' | 'lesson' | 'cheatsheet'

export function StudyPal() {
  // Parents get an oversight view of their kids' studying; kids get the full
  // study surface. (The study tools — cards, quizzes, interviews — are the kid's.)
  const accountType = useAuthStore((s) => s.account?.accountType)
  if (accountType === 'parent') return <ParentStudyView />

  const { data: stats } = useQuery({ queryKey: ['study-stats'], queryFn: () => api<Stats>('/study/stats') })
  const { data: topicsData, isLoading } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })

  const hasTopics = (topicsData?.topics?.length ?? 0) > 0
  const [view, setView] = useState<View>('home')
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null) // chapter name, null = whole subject
  const [selectedCard, setSelectedCard] = useState<ConceptCard | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

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
        <SubjectHub topicId={selectedTopic} onBack={() => setView('home')} onConcepts={() => { setSelectedLesson(null); setView('concepts') }} onQuiz={() => setView('quiz')} onInterview={() => { setSelectedLesson(null); setView('interview') }} onChat={() => setView('chat')} onSaved={() => setView('saved')} onHistory={() => { setSelectedLesson(null); setView('history') }} onLesson={(ch) => { setSelectedLesson(ch); setView('lesson') }} />
      ) : view === 'lesson' && selectedTopic && selectedLesson ? (
        <LessonHub topicId={selectedTopic} chapter={selectedLesson} onBack={() => setView('subject')} onStudy={() => setView('concepts')} onInterview={() => setView('interview')} onHistory={() => setView('history')} />
      ) : view === 'concepts' && selectedTopic ? (
        <ConceptsView topicId={selectedTopic} chapter={selectedLesson ?? undefined} onBack={() => setView(selectedLesson ? 'lesson' : 'subject')} onQuiz={() => setView('quiz')} onCheatsheet={(card) => { setSelectedCard(card); setView('cheatsheet') }} />
      ) : view === 'cheatsheet' && selectedCard ? (
        <ConceptCheatSheet card={selectedCard} onBack={() => setView('concepts')} onQuiz={() => setView('quiz')} onChat={() => setView('chat')} />
      ) : view === 'quiz' && selectedTopic ? (
        <QuizView topicId={selectedTopic} onBack={() => setView('subject')} />
      ) : view === 'interview' && selectedTopic ? (
        <InterviewView topicId={selectedTopic} initialChapter={selectedLesson ?? undefined} onBack={() => setView(selectedLesson ? 'lesson' : 'subject')} onChat={() => setView('chat')} />
      ) : view === 'chat' && selectedTopic ? (
        <ChatView topicId={selectedTopic} onBack={() => setView('subject')} />
      ) : view === 'saved' && selectedTopic ? (
        <SavedView topicId={selectedTopic} onBack={() => setView('subject')} />
      ) : view === 'history' && selectedTopic ? (
        <HistoryView topicId={selectedTopic} chapter={selectedLesson ?? undefined} onBack={() => setView(selectedLesson ? 'lesson' : 'subject')} onOpen={(id) => { setSelectedInterview(id); setView('interviewDetail') }} />
      ) : view === 'interviewDetail' && selectedInterview ? (
        <InterviewDetailView interviewId={selectedInterview} onBack={() => setView('history')} />
      ) : (
        <HomeView stats={stats} topics={topicsData?.topics ?? []} onSelect={(id) => { setSelectedTopic(id); setView('subject') }} onSetup={() => setView('setup')} onRewards={() => setHelpOpen(true)} />
      )}
      {helpOpen && <RewardsHelp onClose={() => setHelpOpen(false)} />}
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
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  // Grade + board come from the child's profile. We only ask once (first run),
  // then persist to the persona so StudyPal never asks again.
  const profileGrade = (account?.persona?.grade as string) || ''
  const profileBoard = (account?.persona?.board as string) || ''

  const [step, setStep] = useState<'grade' | 'subjects' | 'extra'>(profileGrade ? 'subjects' : 'grade')
  const [grade, setGrade] = useState(profileGrade)
  const [board, setBoard] = useState(profileBoard)
  const [savingGrade, setSavingGrade] = useState(false)
  const [subjects, setSubjects] = useState<string[]>([])
  const [extraInfo, setExtraInfo] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist grade + board to the profile (once), then move on to subjects.
  const saveGradeAndContinue = async () => {
    if (!grade) return
    setSavingGrade(true)
    setError(null)
    try {
      const persona = { ...(account?.persona ?? {}), grade, ...(board ? { board } : {}) }
      const res = await api<{ account: NonNullable<typeof account> }>('/me', { method: 'PATCH', body: JSON.stringify({ persona }) })
      updateAccount(res.account)
    } catch {
      /* even if saving fails, let them continue with the picked grade */
    } finally {
      setSavingGrade(false)
      setStep('subjects')
    }
  }

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
          method: 'POST', body: JSON.stringify({ title: subject, emoji: subjectEmoji(subject) }),
        })
        const content = `Generate key concepts, important definitions, formulas, and study material for:\nSubject: ${subject}\nGrade: ${grade}${board ? `\nBoard / exam: ${board}` : ''}\n${extraInfo ? `Additional context from student: ${extraInfo}` : ''}\n\nCreate comprehensive study material covering the most important topics for this grade level.`
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
        onBack={
          step === 'grade'
            ? (canCancel ? onCancel : undefined)
            : step === 'extra'
              ? () => setStep('subjects')
              : profileGrade
                ? (canCancel ? onCancel : undefined)
                : () => setStep('grade')
        }
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
          <>
            <div className="grid grid-cols-2 gap-3">
              {GRADES.map((g, i) => {
                const on = grade === g
                return (
                  <button key={g} onClick={() => setGrade(g)}
                    className="pv-press pv-pop pv-title rounded-2xl py-4 text-center"
                    style={on
                      ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 28}ms` }
                      : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 28}ms` }}>
                    {g}
                  </button>
                )
              })}
            </div>
            <p className="pv-label mb-2.5 mt-7">Board / exam <span style={{ color: 'var(--pv-ink-3)', fontWeight: 600 }}>· optional</span></p>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map((b) => {
                const on = board === b
                return (
                  <button key={b} onClick={() => setBoard(on ? '' : b)}
                    className="pv-press rounded-full px-3.5 py-2 text-sm font-bold"
                    style={on
                      ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
                      : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
                    {b}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {step === 'subjects' && (
          <div className="flex flex-col gap-2.5">
            {subjectsForGrade(grade).map((s, i) => {
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

      {step === 'grade' && (
        <div className="flex-none px-6 pb-6 pt-2">
          <Button variant="accent" size="lg" full onClick={saveGradeAndContinue} disabled={!grade || savingGrade}>
            {savingGrade ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      )}
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

function HomeView({ stats, topics, onSelect, onSetup, onRewards }: { stats?: Stats | null; topics: Topic[]; onSelect: (id: string) => void; onSetup: () => void; onRewards: () => void }) {
  const healthPct = stats && stats.cardsMastered + stats.cardsDue > 0
    ? Math.min(100, Math.round((stats.cardsMastered / (stats.cardsMastered + stats.cardsDue)) * 100))
    : 0

  return (
    <>
      <TopBar
        leading={<div><div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Keep your brain sharp</div><div className="pv-title leading-tight">StudyPal</div></div>}
        trailing={
          <div className="flex items-center gap-2">
            <button onClick={onRewards} aria-label="How Brains work" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><BrainCoin size={22} /></button>
            <IconButton Icon={Plus} ariaLabel="Add subjects" tone="dark" onClick={onSetup} />
          </div>
        }
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
            <button onClick={onRewards} className="pv-press mt-4 flex w-full items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <span className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--pv-on-dark)' }}><BrainCoin size={20} /> Earn Brains as you learn</span>
              <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>How it works →</span>
            </button>
            <div className="mt-3 grid grid-cols-3 gap-2">
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

function SubjectHub({ topicId, onBack, onConcepts, onQuiz, onInterview, onChat, onSaved, onHistory, onLesson }: {
  topicId: string; onBack: () => void; onConcepts: () => void; onQuiz: () => void; onInterview: () => void; onChat: () => void; onSaved: () => void; onHistory: () => void; onLesson: (chapter: string) => void
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
  const { data: ivData } = useQuery({
    queryKey: ['study-interviews', topicId],
    queryFn: () => api<{ interviews: InterviewRow[] }>(`/study/interviews?topicId=${topicId}`),
  })
  const interviews = ivData?.interviews ?? []
  const mastered = Math.max(0, total - due)
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
  const documents = data?.documents ?? []
  const generating = total === 0 && documents.some((d) => d.processingStatus !== 'failed')

  const [newLesson, setNewLesson] = useState(false)

  const { data: chaptersData } = useQuery({
    queryKey: ['study-chapters', topicId],
    queryFn: () => api<{ chapters: ChapterRowT[] }>(`/study/topics/${topicId}/chapters`),
    refetchInterval: generating ? 3000 : false,
  })
  const lessons = (chaptersData?.chapters ?? []).filter((ch) => ch.total > 0)

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

        {/* The three things to do — clear and primary. */}
        <p className="pv-label mb-3">Practise</p>
        <div className="flex flex-col gap-3">
          <HubOption tile={TILE.lilac} icon={<BookOpen size={22} />} title="Learn the concepts" subtitle={generating ? 'Preparing your cards…' : `${total} flashcards · tap for cheat sheets`} onClick={onConcepts} disabled={generating} delay={0} />
          <HubOption tile={TILE.sky} icon={<Sparkles size={22} />} title="Quiz me" subtitle="Quick questions from your concepts" onClick={onQuiz} disabled={generating} delay={60} />
          <HubOption tile={TILE.amber} icon={<Mic size={22} />} title="AI interview" subtitle="A spoken viva with your tutor" onClick={onInterview} disabled={generating} delay={120} />
        </div>

        {/* Secondary, clearly lighter-weight. */}
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <MiniAction icon={<MessageCircle size={18} />} label="Ask tutor" onClick={onChat} />
          <MiniAction icon={<History size={18} />} label="History" onClick={onHistory} />
          <MiniAction icon={<Bookmark size={18} />} label="Saved" onClick={onSaved} />
        </div>

        {/* Lessons — optional chapter breakdown, tucked at the bottom. */}
        <div className="mb-3 mt-7 flex items-center justify-between">
          <div>
            <p className="pv-label">Lessons</p>
            <p className="text-xs" style={{ color: 'var(--pv-ink-3)' }}>Split the subject into chapters — optional</p>
          </div>
          <button onClick={() => setNewLesson((v) => !v)} className="pv-press flex flex-none items-center gap-1 text-sm font-bold pv-text-accent">
            {newLesson ? <X size={15} /> : <Plus size={15} />} {newLesson ? 'Close' : 'New'}
          </button>
        </div>
        {newLesson && (
          <LessonCreator topicId={topicId} onDone={() => {
            setNewLesson(false)
            qc.invalidateQueries({ queryKey: ['study-chapters', topicId] })
            qc.invalidateQueries({ queryKey: ['study-topic', topicId] })
          }} />
        )}
        {lessons.length > 0 && (
          <div className="mt-1 flex flex-col gap-2.5">
            {lessons.map((ch, i) => {
              const lpct = ch.total > 0 ? Math.round((ch.mastered / ch.total) * 100) : 0
              return (
                <Card key={ch.chapter} onClick={() => onLesson(ch.chapter)} className="pv-rise flex items-center gap-3 p-3.5" style={{ ['--i' as string]: Math.min(i, 8) }}>
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl text-base" style={{ background: 'var(--pv-surface-2)' }}>📘</span>
                  <div className="min-w-0 flex-1">
                    <p className="pv-title truncate text-sm">{ch.chapter}</p>
                    <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{ch.total} concepts · {ch.due} to review</p>
                  </div>
                  <span className="pv-amount text-sm pv-text-accent">{lpct}%</span>
                  <ChevronRight size={16} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
                </Card>
              )
            })}
          </div>
        )}
      </div>
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

// Materials + regenerate, as a bottom sheet inside the concepts screen (this is
// where they belong — they shape the cards). Materials are openable.
function ConceptTools({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['study-docs', topicId],
    queryFn: () => api<{ documents: Doc[] }>(`/study/topics/${topicId}/documents`),
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: Doc[] } | undefined)?.documents ?? []
      return docs.some((d) => d.processingStatus === 'pending' || d.processingStatus === 'processing') ? 2500 : false
    },
  })
  const docs = data?.documents ?? []
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)

  const openable = (d: Doc) => d.fileType === 'pdf' || d.fileType === 'image'
  const open = async (id: string) => {
    setOpening(id)
    try {
      const { url } = await api<{ url?: string }>(`/study/documents/${id}/url`)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch { /* ignore */ }
    setOpening(null)
  }
  const regenerate = async () => {
    setRegenerating(true)
    try {
      await api(`/study/topics/${topicId}/regenerate`, { method: 'POST' })
      qc.invalidateQueries({ queryKey: ['study-topic', topicId] })
      qc.invalidateQueries({ queryKey: ['study-cards', topicId] })
      qc.invalidateQueries({ queryKey: ['study-chapters', topicId] })
      qc.invalidateQueries({ queryKey: ['study-topics'] })
    } catch { /* ignore */ }
    setRegenerating(false)
    setConfirmRegen(false)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)', backdropFilter: 'blur(4px)' }} />
      <div onClick={(e) => e.stopPropagation()} className="pv-rise pv-no-scrollbar relative max-h-[82%] w-full overflow-y-auto rounded-t-[28px] p-5 pb-8" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
        <h3 className="pv-h2 mb-1">Materials &amp; tools</h3>
        <p className="pv-body mb-4" style={{ color: 'var(--pv-ink-2)' }}>The notes &amp; files your concepts are built from.</p>

        <p className="pv-label mb-2">Materials</p>
        {docs.length === 0 ? (
          <p className="mb-3 text-sm" style={{ color: 'var(--pv-ink-3)' }}>No materials yet — add notes or upload a file below.</p>
        ) : (
          <div className="mb-3 flex flex-col gap-1.5">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: 'var(--pv-surface-2)' }}>
                <span className="text-base">{docIcon(doc.fileType)}</span>
                <p className="flex-1 truncate text-sm font-medium">{doc.title}</p>
                {openable(doc) ? (
                  <button onClick={() => open(doc.id)} disabled={opening === doc.id} className="pv-press flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'var(--pv-surface)', color: 'var(--pv-accent)', boxShadow: 'var(--pv-shadow-sm)' }}>
                    <ExternalLink size={12} /> {opening === doc.id ? 'Opening…' : 'Open'}
                  </button>
                ) : (
                  <DocStatus status={doc.processingStatus} />
                )}
              </div>
            ))}
          </div>
        )}

        <MaterialsUploader topicId={topicId} onUploaded={() => { qc.invalidateQueries({ queryKey: ['study-docs', topicId] }); qc.invalidateQueries({ queryKey: ['study-topic', topicId] }) }} />

        {!confirmRegen ? (
          <button onClick={() => setConfirmRegen(true)} className="pv-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-surface-2)' }}>
            <RefreshCw size={16} style={{ color: 'var(--pv-accent)' }} /> Regenerate concepts
          </button>
        ) : (
          <div className="pv-rise mt-4 rounded-2xl p-4" style={{ background: 'var(--pv-surface-2)' }}>
            <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>Rebuild flashcards from your materials? <span style={{ fontWeight: 700, color: 'var(--pv-ink)' }}>Saved cards are kept</span>; the rest are replaced.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="soft" full onClick={() => setConfirmRegen(false)} disabled={regenerating}>Cancel</Button>
              <Button variant="accent" full onClick={regenerate} disabled={regenerating}>{regenerating ? 'Rebuilding…' : 'Regenerate'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TILE = {
  lilac: { bg: 'rgba(139,124,255,0.16)', fg: '#7c6cff' },
  sky: { bg: 'rgba(56,189,248,0.16)', fg: '#0ea5e9' },
  mint: { bg: 'rgba(52,211,153,0.16)', fg: '#10b981' },
  amber: { bg: 'rgba(255,178,74,0.18)', fg: '#e8902a' },
  pink: { bg: 'rgba(255,126,182,0.16)', fg: '#ec4899' },
  violet: { bg: 'rgba(168,85,247,0.16)', fg: '#a855f7' },
} as const

function HubOption({ icon, title, subtitle, onClick, disabled, delay, tile }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; disabled?: boolean; delay: number; tile?: { bg: string; fg: string } }) {
  return (
    <Card onClick={disabled ? undefined : onClick} className="pv-rise flex items-center gap-4 p-4" style={{ animationDelay: `${delay}ms`, opacity: disabled ? 0.5 : 1 }}>
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl" style={tile ? { background: tile.bg, color: tile.fg } : { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="pv-title">{title}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>{subtitle}</p>
      </div>
      <ChevronRight size={18} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
    </Card>
  )
}

function MiniAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pv-press flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
      <span style={{ color: 'var(--pv-accent)' }}>{icon}</span>
      <span className="text-xs font-bold" style={{ color: 'var(--pv-ink-2)' }}>{label}</span>
    </button>
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

function ConceptsView({ topicId, chapter, onBack, onQuiz, onCheatsheet }: { topicId: string; chapter?: string; onBack: () => void; onQuiz: () => void; onCheatsheet: (card: ConceptCard) => void }) {
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
    queryKey: ['study-cards', topicId, chapter ?? 'all'],
    queryFn: () => api<{ cards: ConceptCard[] }>(`/study/topics/${topicId}/cards${chapter ? `?chapter=${encodeURIComponent(chapter)}` : ''}`),
    refetchInterval: (q) => ((q.state.data as { cards?: ConceptCard[] } | undefined)?.cards?.length ?? 0) === 0 ? 2500 : false,
  })

  const readyDocCount = (data?.documents ?? []).filter((d) => d.processingStatus === 'ready').length
  useEffect(() => { refetch() }, [readyDocCount, refetch])

  const cards = cardsData?.cards ?? []
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)
  const [tools, setTools] = useState(false)

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
            <BrainCoin size={18} /><span className="font-bold">Review 10 cards a day to earn Brains</span>
          </div>
        </div>
        <div className="pv-rise flex-none px-6 py-5" style={{ animationDelay: '0.35s' }}>
          <Button variant="accent" size="lg" full leadingIcon={Sparkles} onClick={onQuiz}>Take a quiz</Button>
          <button onClick={onBack} className="pv-press mt-3 w-full py-2 text-sm font-medium" style={{ color: 'var(--pv-ink-3)' }}>Back to subject</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header
        title={`${data?.topic?.emoji ?? ''} ${data?.topic?.title ?? ''}`}
        onBack={onBack}
        right={<button onClick={() => setTools(true)} aria-label="Materials & tools" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><SlidersHorizontal size={18} /></button>}
      />
      {tools && <ConceptTools topicId={topicId} onClose={() => setTools(false)} />}

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
                  <button
                    onClick={() => onCheatsheet(card)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="pv-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold"
                    style={{ background: 'var(--pv-accent-soft)', color: 'var(--pv-accent)' }}
                  >
                    <Sparkles size={13} /> Cheat sheet
                  </button>
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
// CONCEPT CHEAT SHEET
// ═══════════════════════════════════════════════════════════════════════

function ConceptCheatSheet({ card, onBack, onQuiz, onChat }: { card: ConceptCard; onBack: () => void; onQuiz: () => void; onChat: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['study-cheatsheet', card.id],
    queryFn: () => api<{ cheatsheet: Cheatsheet }>(`/study/cards/${card.id}/cheatsheet`, { method: 'POST' }),
    staleTime: 1000 * 60 * 30,
  })
  const cs = data?.cheatsheet
  const [saved, setSaved] = useState(card.bookmarked ?? false)
  const toggleSave = () => {
    const next = !saved
    setSaved(next)
    api(`/study/cards/${card.id}/bookmark`, { method: 'POST', body: JSON.stringify({ bookmarked: next }) })
      .then(() => qc.invalidateQueries({ queryKey: ['study-cards'] }))
      .catch(() => setSaved(!next))
  }

  if (isLoading || !cs) {
    return (
      <>
        <Header title="Cheat sheet" onBack={onBack} />
        <Centered>
          <div className="flex flex-col items-center gap-4 text-center">
            <Spinner />
            <div>
              <p className="pv-title">Building your cheat sheet…</p>
              <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>Pulling the must-knows for “{card.front}”.</p>
            </div>
          </div>
        </Centered>
      </>
    )
  }

  const sections: { key: string; emoji: string; title: string; bg: string; body: React.ReactNode }[] = []
  if (cs.keyPoints.length) sections.push({
    key: 'kp', emoji: '📌', title: 'Key points', bg: 'rgba(139,124,255,0.14)',
    body: (
      <div className="flex flex-col gap-2">
        {cs.keyPoints.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full" style={{ background: 'var(--pv-accent)', color: 'var(--pv-on-accent)' }}><Check size={11} strokeWidth={3} /></span>
            <span className="text-sm leading-relaxed" style={{ color: 'var(--pv-ink)' }}>{p}</span>
          </div>
        ))}
      </div>
    ),
  })
  if (cs.formula) sections.push({
    key: 'f', emoji: '🧮', title: 'Formula / rule', bg: 'rgba(52,211,153,0.14)',
    body: <p className="rounded-xl px-3 py-2.5 text-center text-base font-bold" style={{ background: 'var(--pv-surface-2)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{cs.formula}</p>,
  })
  if (cs.example) sections.push({
    key: 'e', emoji: '🧩', title: 'Example', bg: 'rgba(56,189,248,0.14)',
    body: <p className="text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>{cs.example}</p>,
  })
  if (cs.analogy) sections.push({
    key: 'a', emoji: '💭', title: 'Think of it like…', bg: 'rgba(255,178,74,0.16)',
    body: <p className="text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>{cs.analogy}</p>,
  })
  if (cs.mistake) sections.push({
    key: 'm', emoji: '⚠️', title: 'Watch out', bg: 'rgba(229,72,77,0.12)',
    body: <p className="text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>{cs.mistake}</p>,
  })

  return (
    <>
      <Header
        title="Cheat sheet"
        onBack={onBack}
        right={<button onClick={toggleSave} aria-label={saved ? 'Remove bookmark' : 'Save'} className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ color: 'var(--pv-accent)' }}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>}
      />
      <div className="pv-no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-1">
        <div className="pv-pop mb-5 flex flex-col items-center text-center">
          <div className="animate-float mb-3 flex h-20 w-20 items-center justify-center rounded-[26px] text-4xl" style={{ backgroundImage: 'var(--pv-grad-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>{cs.emoji}</div>
          <h1 className="pv-h1">{cs.title}</h1>
          <p className="pv-body mt-2 max-w-sm" style={{ color: 'var(--pv-ink-2)' }}>{cs.definition}</p>
        </div>
        <div className="flex flex-col gap-3">
          {sections.map((s, i) => (
            <Card key={s.key} className="pv-rise p-4" style={{ ['--i' as string]: i }}>
              <div className="mb-2 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl text-lg" style={{ background: s.bg }}>{s.emoji}</span>
                <p className="pv-title text-sm">{s.title}</p>
              </div>
              {s.body}
            </Card>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-2.5 px-5 pb-5 pt-3" style={{ background: 'var(--pv-surface)', boxShadow: '0 -10px 28px -16px rgba(11,12,15,0.25)' }}>
        <Button variant="soft" full leadingIcon={MessageCircle} onClick={onChat}>Ask tutor</Button>
        <Button variant="accent" full leadingIcon={Sparkles} onClick={onQuiz}>Quiz me</Button>
      </div>
    </>
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
            {result.brainsEarned > 0 && <BrainsPill amount={result.brainsEarned} pop className="pv-rise" />}
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

// The legacy Gemini-Live voice interview was removed — the live interview now
// lives in StudyInterview.tsx (Runway avatar) with RunwayStage.tsx.

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
// LESSONS
// ═══════════════════════════════════════════════════════════════════════

function LessonCreator({ topicId, onDone }: { topicId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length) setFiles((p) => [...p, ...picked])
    e.target.value = ''
  }

  const create = async () => {
    const lesson = name.trim()
    if (!lesson || busy) return
    setBusy(true)
    try {
      if (notes.trim()) {
        await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: `${lesson} — notes`, fileUrl: 'text://inline', fileType: 'text', content: notes.trim(), chapter: lesson }) })
      }
      for (const f of files) {
        const body = await fileToDocBody(f)
        await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ ...body, chapter: lesson }) })
      }
      // No material provided → seed the lesson from its name so it still builds.
      if (!notes.trim() && files.length === 0) {
        await api(`/study/topics/${topicId}/documents`, { method: 'POST', body: JSON.stringify({ title: lesson, fileUrl: 'text://inline', fileType: 'text', content: `Generate the key concepts, definitions, formulas and facts for the lesson "${lesson}". Cover the most important ideas a student should master.`, chapter: lesson }) })
      }
      onDone()
    } catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <Card className="pv-rise mb-4 p-4">
      <input
        value={name} onChange={(e) => setName(e.target.value)} autoFocus
        placeholder="Lesson name — e.g. Photosynthesis"
        className="pv-body mb-2.5 h-11 w-full rounded-2xl px-3.5 outline-none"
        style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}
      />
      <label className="pv-sheen mb-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
        <Upload size={15} /> Upload notes, PDF or photos
        <input type="file" multiple accept=".pdf,image/*,.txt,.md,.doc,.docx,.ppt,.pptx" className="hidden" onChange={onFile} />
      </label>
      {files.length > 0 && <p className="mb-2 text-center text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{files.length} file{files.length > 1 ? 's' : ''} attached</p>}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Or paste notes / textbook text… (optional)" className="pv-body mb-2.5 w-full resize-none rounded-2xl px-3.5 py-2.5 outline-none" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }} />
      <Button variant="accent" full onClick={create} disabled={!name.trim() || busy}>{busy ? 'Creating lesson…' : 'Create lesson'}</Button>
    </Card>
  )
}

function LessonHub({ topicId, chapter, onBack, onStudy, onInterview, onHistory }: {
  topicId: string; chapter: string; onBack: () => void; onStudy: () => void; onInterview: () => void; onHistory: () => void
}) {
  const { data } = useQuery({ queryKey: ['study-chapters', topicId], queryFn: () => api<{ chapters: ChapterRowT[] }>(`/study/topics/${topicId}/chapters`) })
  const ch = (data?.chapters ?? []).find((x) => x.chapter === chapter)
  const total = ch?.total ?? 0
  const mastered = ch?.mastered ?? 0
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
  const { data: ivData } = useQuery({
    queryKey: ['study-interviews', topicId, chapter],
    queryFn: () => api<{ interviews: InterviewRow[] }>(`/study/interviews?topicId=${topicId}&chapter=${encodeURIComponent(chapter)}`),
  })
  const interviews = ivData?.interviews ?? []

  return (
    <>
      <Header title={chapter} onBack={onBack} />
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Card className="pv-pop mb-6 flex items-center gap-5 p-5">
          <ProgressRing pct={pct} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--pv-ink-2)' }}>This lesson</p>
            <p className="pv-amount text-2xl">{mastered}<span className="text-base font-semibold" style={{ color: 'var(--pv-ink-3)' }}>/{total} concepts</span></p>
          </div>
        </Card>
        <p className="pv-label mb-3">What would you like to do?</p>
        <div className="flex flex-col gap-3">
          <HubOption tile={TILE.lilac} icon={<BookOpen size={22} />} title="Study concepts" subtitle={`${total} flashcards · tap for cheat sheets`} onClick={onStudy} delay={0} />
          <HubOption tile={TILE.amber} icon={<Mic size={22} />} title="AI Interview" subtitle="A spoken viva on this lesson" onClick={onInterview} delay={60} />
          <HubOption
            tile={TILE.pink}
            icon={<History size={22} />}
            title="Past interviews"
            subtitle={interviews.length > 0
              ? `${interviews.length} done${typeof interviews[0].score === 'number' ? ` · last ${interviews[0].score}/10` : ''}`
              : 'Your scores will appear here'}
            onClick={onHistory}
            delay={120}
          />
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// INTERVIEW HISTORY
// ═══════════════════════════════════════════════════════════════════════

function scoreTone(score: number | null | undefined): { bg: string; fg: string } {
  if (typeof score !== 'number') return { bg: 'var(--pv-surface-2)', fg: 'var(--pv-ink-3)' }
  if (score >= 8) return { bg: 'var(--pv-pos-soft)', fg: 'var(--pv-pos)' }
  if (score >= 5) return { bg: 'var(--pv-accent-soft)', fg: 'var(--pv-accent)' }
  return { bg: 'var(--pv-neg-soft)', fg: 'var(--pv-neg)' }
}

function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const day = 86400000
  if (diff < day) return 'Today'
  if (diff < 2 * day) return 'Yesterday'
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function fmtDuration(secs: number | null | undefined): string {
  const s = secs ?? 0
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

function HistoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="pv-amount text-lg pv-text-accent">{value}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pv-ink-3)' }}>{label}</span>
    </div>
  )
}

function HistoryView({ topicId, chapter, onBack, onOpen }: { topicId: string; chapter?: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['study-interviews', topicId, chapter ?? 'all'],
    queryFn: () => api<{ interviews: InterviewRow[] }>(`/study/interviews?topicId=${topicId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}`),
  })
  const interviews = data?.interviews ?? []
  const scored = interviews.filter((i) => typeof i.score === 'number')
  const avg = scored.length ? Math.round((scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length) * 10) / 10 : null
  const best = scored.length ? Math.max(...scored.map((i) => i.score ?? 0)) : null

  return (
    <>
      <Header title="Past interviews" onBack={onBack} />
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <Centered><Spinner /></Centered>
        ) : interviews.length === 0 ? (
          <div className="flex flex-col items-center px-4 pt-16 text-center">
            <div className="animate-float mb-3 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}><History size={26} /></div>
            <p className="pv-title">No interviews yet</p>
            <p className="pv-body mt-1 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>Take an AI interview and your scores, feedback and transcripts will be saved here.</p>
          </div>
        ) : (
          <>
            <Card className="pv-pop mb-5 flex items-center justify-around p-4">
              <HistoryStat label="Done" value={String(interviews.length)} />
              <div className="h-8 w-px" style={{ background: 'var(--pv-line)' }} />
              <HistoryStat label="Avg" value={avg != null ? `${avg}` : '—'} />
              <div className="h-8 w-px" style={{ background: 'var(--pv-line)' }} />
              <HistoryStat label="Best" value={best != null ? `${best}` : '—'} />
            </Card>
            <div className="flex flex-col gap-3">
              {interviews.map((iv, i) => {
                const tone = scoreTone(iv.score)
                return (
                  <Card key={iv.id} onClick={() => onOpen(iv.id)} className="pv-rise flex items-center gap-4 p-4" style={{ ['--i' as string]: Math.min(i, 10) }}>
                    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-lg font-extrabold" style={{ background: tone.bg, color: tone.fg }}>
                      {typeof iv.score === 'number' ? iv.score : '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="pv-title truncate">{iv.chapter || (iv.mode === 'viva' ? 'Weak spots' : 'Full subject')}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>
                        <span>{fmtAgo(iv.completedAt ?? iv.createdAt)}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(iv.durationSecs)}</span>
                        {(iv.brainsEarned ?? 0) > 0 && <><span>·</span><span className="inline-flex items-center gap-1">+{iv.brainsEarned} <BrainCoin size={12} /></span></>}
                      </p>
                    </div>
                    <ChevronRight size={18} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function InterviewDetailView({ interviewId, onBack }: { interviewId: string; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['study-interview', interviewId],
    queryFn: () => api<{ interview: InterviewRow & { transcript?: { role: string; text: string }[]; focusAreas?: string[] } }>(`/study/interviews/${interviewId}`),
  })
  const iv = data?.interview
  const transcript = iv?.transcript ?? []
  const flags = iv?.focus?.flags ?? []
  const analysis = iv?.analysis ?? null

  if (isLoading || !iv) {
    return (<><Header title="Interview" onBack={onBack} /><Centered><Spinner /></Centered></>)
  }
  const tone = scoreTone(iv.score)

  return (
    <>
      <Header title={iv.chapter || iv.topicTitle || 'Interview'} onBack={onBack} />
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="pv-pop mb-5 flex flex-col items-center text-center">
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full text-3xl font-extrabold" style={{ background: tone.bg, color: tone.fg }}>
            {typeof iv.score === 'number' ? `${iv.score}` : '—'}
            <span className="text-[11px] font-bold" style={{ opacity: 0.7 }}>out of 10</span>
          </div>
          {analysis?.level && <span className="mt-3 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide" style={{ background: tone.bg, color: tone.fg }}>{analysis.level}</span>}
          {analysis?.headline && <p className="pv-h2 mt-2">{analysis.headline}</p>}
          {(analysis?.summary || iv.summary) && <p className="pv-body mt-2 max-w-sm" style={{ color: 'var(--pv-ink-2)' }}>{analysis?.summary ?? iv.summary}</p>}
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>
            <span>{fmtAgo(iv.completedAt ?? iv.createdAt)}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(iv.durationSecs)}</span>
            {(iv.brainsEarned ?? 0) > 0 && <><span>·</span><span className="inline-flex items-center gap-1">+{iv.brainsEarned} <BrainCoin size={12} /> earned</span></>}
          </p>
        </div>

        {/* Rich analytics & insights */}
        {analysis ? (
          <div className="mb-4">
            <InterviewInsights analysis={analysis} audience="kid" />
            {analysis.encouragement && (
              <div className="pv-rise mt-3 rounded-2xl px-4 py-3.5 text-center text-sm font-semibold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                {analysis.encouragement}
              </div>
            )}
          </div>
        ) : iv.keepPractising && iv.keepPractising.length > 0 ? (
          <Card className="pv-rise mb-4 p-4" style={{ ['--i' as string]: 0 }}>
            <p className="pv-label mb-2">Keep practising</p>
            {iv.keepPractising.map((k, i) => (
              <p key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}><span className="pv-text-accent">•</span> {k}</p>
            ))}
          </Card>
        ) : null}

        {flags.length > 0 && (
          <Card className="pv-rise mb-4 flex items-start gap-2.5 p-4" style={{ ['--i' as string]: 1 }}>
            <Eye size={16} className="mt-0.5 flex-none" style={{ color: 'var(--pv-warn)' }} />
            <div>
              <p className="pv-label mb-1">Focus notes</p>
              {flags.map((f, i) => <p key={i} className="text-sm" style={{ color: 'var(--pv-ink-2)' }}>{f}</p>)}
            </div>
          </Card>
        )}

        {transcript.length > 0 && (
          <>
            <p className="pv-label mb-2 mt-2">Transcript</p>
            <div className="flex flex-col gap-2 pb-4">
              {transcript.map((t, i) => {
                const isKid = t.role === 'kid' || t.role === 'user' || t.role === 'you'
                return (
                  <div key={i} className={`pv-rise flex ${isKid ? 'justify-end' : ''}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
                    <span className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                      style={isKid ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
                      {t.text}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
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
