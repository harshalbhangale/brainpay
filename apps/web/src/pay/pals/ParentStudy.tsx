/**
 * ParentStudy — the parent's StudyPal: oversight of how each kid is studying.
 * ───────────────────────────────────────────────────────────────────────────
 * Read-only. A parent picks a child and sees their subjects + progress, and —
 * the key moment — their AI interviews: score, the tutor's summary, what to keep
 * practising, the focus/integrity signal, and the full transcript of how the
 * child actually reasoned. Supportive oversight, wins first.
 *
 * Rendered by StudyPal when the logged-in account is a parent. Backed by the
 * parent-scoped read endpoints (/study/children…).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Flame, BookOpen, History, Clock, Eye, Trophy, GraduationCap, ShieldCheck,
} from 'lucide-react'
import { api } from '../../lib/api'
import { Card } from '../components/primitives'
import { BrainCoin } from '../components/Brains'

type Child = {
  accountId: string; name: string; grade: string | null; avatar: string | null
  subjectCount: number; interviewCount: number; lastScore: number | null; lastInterviewAt: string | null; streak: number
}
type Subject = { id: string; title: string; emoji: string | null; totalCards: number; cardsDue: number }
type Focus = { lookingPct?: number; flags?: string[]; notes?: string }
type IvRow = {
  id: string; topicTitle: string | null; topicEmoji: string | null; chapter: string | null; mode: string
  score: number | null; summary: string | null; durationSecs: number | null; brainsEarned: number | null
  focus: Focus | null; completedAt: string | null; createdAt: string
}
type IvDetail = IvRow & { transcript?: { role: string; text: string }[]; keepPractising?: string[] }

function scoreTone(score: number | null | undefined): { bg: string; fg: string } {
  if (typeof score !== 'number') return { bg: 'var(--pv-surface-2)', fg: 'var(--pv-ink-3)' }
  if (score >= 8) return { bg: 'var(--pv-pos-soft)', fg: 'var(--pv-pos)' }
  if (score >= 5) return { bg: 'var(--pv-accent-soft)', fg: 'var(--pv-accent)' }
  return { bg: 'var(--pv-neg-soft)', fg: 'var(--pv-neg)' }
}
function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso); const diff = Date.now() - d.getTime(); const day = 86400000
  if (diff < day) return 'Today'
  if (diff < 2 * day) return 'Yesterday'
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
function fmtDuration(s: number | null | undefined): string {
  const n = s ?? 0
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s`
}

function Spinner() {
  return (
    <div className="relative h-12 w-12">
      <div className="absolute inset-0 rounded-full" style={{ border: '3px solid var(--pv-surface-3)' }} />
      <div className="absolute inset-0 animate-spin rounded-full" style={{ border: '3px solid transparent', borderTopColor: 'var(--pv-accent)' }} />
    </div>
  )
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">{children}</div>
}
function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex flex-none items-center gap-3 px-4 pb-2 pt-2">
      {onBack ? (
        <button onClick={onBack} aria-label="Back" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><ChevronLeft size={20} /></button>
      ) : <div className="w-10" />}
      <h2 className="pv-title flex-1 truncate text-center">{title}</h2>
      <div className="w-10" />
    </div>
  )
}

function Avatar({ child, size = 44, active }: { child: Child; size?: number; active?: boolean }) {
  const isImg = child.avatar && /^https?:|^data:/.test(child.avatar)
  return (
    <span
      className="flex flex-none items-center justify-center overflow-hidden rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundImage: active ? 'var(--pv-grad-accent)' : undefined, background: active ? undefined : 'var(--pv-surface-2)', color: active ? 'var(--pv-on-accent)' : 'var(--pv-ink-2)', boxShadow: active ? 'var(--pv-shadow-pop)' : undefined }}
    >
      {isImg ? <img src={child.avatar as string} alt={child.name} className="h-full w-full object-cover" /> : (child.name?.[0]?.toUpperCase() ?? '🧒')}
    </span>
  )
}

export function ParentStudyView() {
  const { data, isLoading } = useQuery({ queryKey: ['study-children'], queryFn: () => api<{ children: Child[] }>('/study/children') })
  const children = data?.children ?? []
  const [kidId, setKidId] = useState<string | null>(null)
  const [openInterview, setOpenInterview] = useState<string | null>(null)

  const activeKidId = kidId ?? children[0]?.accountId ?? null
  const activeKid = children.find((c) => c.accountId === activeKidId) ?? null

  if (isLoading) return <Centered><Spinner /></Centered>

  if (children.length === 0) {
    return (
      <>
        <div className="flex flex-none items-center gap-2 px-5 pb-1 pt-3">
          <div><div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Family learning</div><div className="pv-title leading-tight">Study oversight</div></div>
        </div>
        <Centered>
          <div className="animate-float mb-3 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}><GraduationCap size={26} /></div>
          <p className="pv-title">No kids yet</p>
          <p className="pv-body mt-1 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>Once your child joins the family and starts studying, you'll see their progress and AI interviews here.</p>
        </Centered>
      </>
    )
  }

  if (openInterview && activeKidId) {
    return <ParentInterviewDetail kidId={activeKidId} interviewId={openInterview} onBack={() => setOpenInterview(null)} />
  }

  return (
    <div className="pv-pal-enter flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center justify-between px-5 pb-1 pt-3">
        <div><div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Family learning</div><div className="pv-title leading-tight">Study oversight</div></div>
        <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)' }}><ShieldCheck size={12} style={{ color: 'var(--pv-pos)' }} /> Parent</span>
      </div>

      {/* Child switcher */}
      {children.length > 1 && (
        <div className="pv-no-scrollbar flex flex-none gap-2 overflow-x-auto px-5 py-3">
          {children.map((ch) => {
            const on = ch.accountId === activeKidId
            return (
              <button key={ch.accountId} onClick={() => { setKidId(ch.accountId); setOpenInterview(null) }} className="pv-press flex flex-none items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5" style={on ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
                <Avatar child={ch} size={28} active={false} />
                <span className="text-sm font-bold">{ch.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {activeKid && <KidOverview key={activeKid.accountId} kid={activeKid} onOpenInterview={(id) => setOpenInterview(id)} />}
    </div>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl py-3" style={{ background: 'var(--pv-surface-2)' }}>
      <span className="flex items-center gap-1 pv-amount text-lg">{icon}{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pv-ink-3)' }}>{label}</span>
    </div>
  )
}

function KidOverview({ kid, onOpenInterview }: { kid: Child; onOpenInterview: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['study-child-overview', kid.accountId],
    queryFn: () => api<{ subjects: Subject[]; interviews: IvRow[]; streak: { currentStreak: number; longestStreak: number } }>(`/study/children/${kid.accountId}/overview`),
  })
  const subjects = data?.subjects ?? []
  const interviews = data?.interviews ?? []
  const scored = interviews.filter((i) => typeof i.score === 'number')
  const avg = scored.length ? Math.round((scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length) * 10) / 10 : null

  return (
    <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-1">
      {/* Hero stats */}
      <Card className="pv-pop mb-5 p-5" style={{ background: 'var(--pv-grad-ink)' }}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar child={kid} size={44} active />
          <div>
            <p className="pv-title leading-tight" style={{ color: 'var(--pv-on-dark)' }}>{kid.name}</p>
            {kid.grade && <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{kid.grade}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Flame size={14} style={{ color: '#ffb24a' }} />} value={String(kid.streak)} label="day streak" />
          <Stat icon={<Trophy size={14} style={{ color: 'var(--pv-accent)' }} />} value={avg != null ? `${avg}` : '—'} label="avg score" />
          <Stat icon={<History size={14} style={{ color: 'var(--pv-accent)' }} />} value={String(kid.interviewCount)} label="interviews" />
        </div>
      </Card>

      {isLoading ? (
        <Centered><Spinner /></Centered>
      ) : (
        <>
          {/* Subjects */}
          <p className="pv-label mb-3">Subjects</p>
          {subjects.length === 0 ? (
            <Card flat className="mb-6 p-5 text-center"><p className="text-sm" style={{ color: 'var(--pv-ink-2)' }}>No subjects yet.</p></Card>
          ) : (
            <div className="mb-6 flex flex-col gap-2.5">
              {subjects.map((s, i) => {
                const pct = s.totalCards > 0 ? Math.round(((s.totalCards - s.cardsDue) / s.totalCards) * 100) : 0
                return (
                  <Card key={s.id} className="pv-rise flex items-center gap-3 p-3.5" style={{ ['--i' as string]: Math.min(i, 8) }}>
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl text-xl" style={{ background: 'var(--pv-surface-2)' }}>{s.emoji ?? '📚'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="pv-title truncate text-sm">{s.title}</p>
                      <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{s.totalCards} concepts · {s.cardsDue} to review</p>
                    </div>
                    <span className="pv-amount text-sm pv-text-accent">{pct}%</span>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Interviews — the headline of parent oversight */}
          <p className="pv-label mb-3">AI interviews</p>
          {interviews.length === 0 ? (
            <Card flat className="p-5 text-center"><p className="text-sm" style={{ color: 'var(--pv-ink-2)' }}>No interviews yet — once {kid.name} takes one, you'll see their score and how they reasoned here.</p></Card>
          ) : (
            <div className="flex flex-col gap-3">
              {interviews.map((iv, i) => {
                const tone = scoreTone(iv.score)
                const flags = iv.focus?.flags ?? []
                return (
                  <Card key={iv.id} onClick={() => onOpenInterview(iv.id)} className="pv-rise flex items-center gap-4 p-4" style={{ ['--i' as string]: Math.min(i, 10) }}>
                    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-lg font-extrabold" style={{ background: tone.bg, color: tone.fg }}>{typeof iv.score === 'number' ? iv.score : '—'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="pv-title truncate text-sm">{iv.chapter || iv.topicTitle || 'Interview'}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>
                        <span>{fmtAgo(iv.completedAt ?? iv.createdAt)}</span><span>·</span>
                        <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(iv.durationSecs)}</span>
                        {flags.length > 0 && <><span>·</span><span className="inline-flex items-center gap-0.5" style={{ color: 'var(--pv-warn)' }}><Eye size={11} /> focus</span></>}
                      </p>
                    </div>
                    <ChevronRight size={18} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ParentInterviewDetail({ kidId, interviewId, onBack }: { kidId: string; interviewId: string; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['study-child-interview', kidId, interviewId],
    queryFn: () => api<{ interview: IvDetail }>(`/study/children/${kidId}/interviews/${interviewId}`),
  })
  const iv = data?.interview
  const transcript = iv?.transcript ?? []
  const flags = iv?.focus?.flags ?? []

  if (isLoading || !iv) return (<><Header title="Interview" onBack={onBack} /><Centered><Spinner /></Centered></>)
  const tone = scoreTone(iv.score)

  return (
    <>
      <Header title={iv.chapter || iv.topicTitle || 'Interview'} onBack={onBack} />
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="pv-pop mb-5 flex flex-col items-center text-center">
          <div className="animate-trophy flex h-24 w-24 items-center justify-center rounded-full text-3xl font-extrabold" style={{ background: tone.bg, color: tone.fg }}>{typeof iv.score === 'number' ? `${iv.score}` : '—'}</div>
          <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>out of 10</p>
          {iv.summary && <p className="pv-body mt-3 max-w-sm" style={{ color: 'var(--pv-ink-2)' }}>{iv.summary}</p>}
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>
            <span>{fmtAgo(iv.completedAt ?? iv.createdAt)}</span><span>·</span>
            <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(iv.durationSecs)}</span>
            {(iv.brainsEarned ?? 0) > 0 && <><span>·</span><span className="inline-flex items-center gap-1">+{iv.brainsEarned} <BrainCoin size={12} /></span></>}
          </p>
        </div>

        {iv.keepPractising && iv.keepPractising.length > 0 && (
          <Card className="pv-rise mb-4 p-4" style={{ ['--i' as string]: 0 }}>
            <p className="pv-label mb-2">Where to help</p>
            {iv.keepPractising.map((k, i) => <p key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}><span className="pv-text-accent">•</span> {k}</p>)}
          </Card>
        )}

        {(flags.length > 0 || typeof iv.focus?.lookingPct === 'number') && (
          <Card className="pv-rise mb-4 flex items-start gap-2.5 p-4" style={{ ['--i' as string]: 1 }}>
            <Eye size={16} className="mt-0.5 flex-none" style={{ color: 'var(--pv-warn)' }} />
            <div>
              <p className="pv-label mb-1">Focus &amp; integrity</p>
              {typeof iv.focus?.lookingPct === 'number' && <p className="text-sm" style={{ color: 'var(--pv-ink-2)' }}>On-screen focus: {iv.focus.lookingPct}%</p>}
              {flags.map((f, i) => <p key={i} className="text-sm" style={{ color: 'var(--pv-ink-2)' }}>{f}</p>)}
            </div>
          </Card>
        )}

        {transcript.length > 0 && (
          <>
            <p className="pv-label mb-2 mt-2">How they answered</p>
            <div className="flex flex-col gap-2 pb-4">
              {transcript.map((t, i) => {
                const isKid = t.role === 'kid' || t.role === 'user' || t.role === 'you'
                return (
                  <div key={i} className={`pv-rise flex ${isKid ? 'justify-end' : ''}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
                    <span className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed" style={isKid ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>{t.text}</span>
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
