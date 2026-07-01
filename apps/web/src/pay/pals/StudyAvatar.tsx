/**
 * StudyAvatar — the avatar-first face of StudyPal.
 * ───────────────────────────────────────────────────────────────────────────
 * Everything the learner does begins with Matilda (the StudyPal companion,
 * reused from lib/avatar via palCharacters). She hosts a live-avatar surface —
 * the same "Linear glass" language as the AI chat — and drives the flow:
 *
 *   • StudyOnboarding  — first-run: Matilda asks year → state → subjects, then
 *                        builds the decks through the EXISTING study pipeline
 *                        (/study/topics + /documents) and persists grade/state.
 *   • StudyAvatarHome  — returning: Matilda greets, calls out the weakest
 *                        subject, and offers a one-tap "start" into the real
 *                        flashcards. Cards / quiz / interview screens are reused
 *                        unchanged; they just launch from here.
 *
 * Demo-safe by design: the answers are tap chips/dropdowns (no live-mic
 * dependency), and this layer is additive — the legacy setup/home remain as a
 * fallback in StudyPal.tsx.
 */
import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, ChevronDown, ChevronRight, Sparkles, Check, Plus, BookOpen } from 'lucide-react'
import { Companion, type CompanionMood } from '../../components/Companion'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { Button, Card } from '../components/primitives'
import { palCharacter } from './palCharacters'
import { GRADES, AU_STATES, subjectsForGrade, subjectEmoji, curriculumForState } from './subjects'

type Topic = { id: string; title: string; emoji: string; cardsDue: number; totalCards: number }
type Stats = { streak: number; cardsDue: number; cardsMastered: number; topicsActive: number }

// ═══════════════════════════════════════════════════════════════════════
// MATILDA HOST — the persistent avatar stage every study step lives inside.
// ═══════════════════════════════════════════════════════════════════════

function MatildaHost({ caption, mood = 'happy', onSwitchPal, right, children }: {
  caption?: string
  mood?: CompanionMood
  onSwitchPal?: () => void
  right?: ReactNode
  children: ReactNode
}) {
  const ch = palCharacter('studypal')
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pv-mesh" aria-hidden />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Identity / switcher */}
        <div className="flex flex-none items-center gap-2 px-4 pb-1 pt-2">
          <button
            type="button"
            onClick={onSwitchPal}
            disabled={!onSwitchPal}
            aria-label={onSwitchPal ? 'Switch Pal' : undefined}
            className="pv-press flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-0.5 pl-0.5 pr-2 text-left disabled:cursor-default"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent, boxShadow: 'var(--pv-shadow-sm)' }}>
              <GraduationCap size={17} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="pv-title pv-tight truncate leading-tight">{ch.palName}</span>
                {onSwitchPal && <ChevronDown size={15} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}
              </span>
              <span className="block truncate pt-0.5 text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Talking to {ch.characterName}</span>
            </span>
          </button>
          {right}
        </div>

        {/* Avatar stage */}
        <div className="relative flex flex-none items-end justify-center px-4" style={{ height: 'min(30vh, 240px)' }}>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px]" style={{ background: ch.gradient, opacity: 0.3 }} aria-hidden />
          <Companion avatar={ch.avatar} mood={mood} className="pv-rise relative h-full w-full" />
        </div>

        {/* Matilda's line — replays its entrance whenever the copy changes */}
        {caption && (
          <p key={caption} className="pv-rise pv-body mx-auto mt-2 max-w-sm px-6 text-center" style={{ color: 'var(--pv-ink-2)' }}>{caption}</p>
        )}

        {/* Contextual glass cards / controls */}
        <div className="pv-no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ONBOARDING — Matilda asks year → state → subjects, then builds the decks.
// ═══════════════════════════════════════════════════════════════════════

export function StudyOnboarding({ onDone, onManual, onSwitchPal }: { onDone: () => void; onManual: () => void; onSwitchPal?: () => void }) {
  const qc = useQueryClient()
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const name = ((account?.persona?.name as string) || '').trim().split(' ')[0] || ''

  const savedGrade = (account?.persona?.grade as string) || ''
  const [stage, setStage] = useState<'grade' | 'state' | 'subjects' | 'building'>(savedGrade ? 'subjects' : 'grade')
  const [grade, setGrade] = useState(savedGrade)
  const [auState, setAuState] = useState((account?.persona?.state as string) || '')
  const [subjects, setSubjects] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const toggle = (s: string) => setSubjects((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))

  const caption =
    stage === 'grade' ? `Hi${name ? ` ${name}` : ''}! I'm Matilda, your study buddy. First up — what year are you in?`
      : stage === 'state' ? `${grade} — nice. Which state are you in? (Tap Skip if you'd rather not say.)`
        : stage === 'subjects' ? `Great — I'll follow the ${curriculumForState(auState)} curriculum. Now pick the subjects you want to study with me.`
          : `Awesome. Building your ${subjects.length} deck${subjects.length > 1 ? 's' : ''} — this takes a few seconds…`

  async function build() {
    if (subjects.length === 0) return
    setStage('building')
    setError(null)
    try {
      const persona = { ...(account?.persona ?? {}), grade, ...(auState ? { state: auState, curriculum: curriculumForState(auState) } : {}) }
      try {
        const res = await api<{ account: Account }>('/me', { method: 'PATCH', body: JSON.stringify({ persona }) })
        updateAccount(res.account)
      } catch { /* continue even if the profile save fails — decks still build */ }
      for (const subject of subjects) {
        const { topic } = await api<{ topic: { id: string } }>('/study/topics', { method: 'POST', body: JSON.stringify({ title: subject, emoji: subjectEmoji(subject) }) })
        const content = `Generate key concepts, important definitions and study material for:\nSubject: ${subject}\nGrade: ${grade} (Australia)\nCurriculum: ${auState ? curriculumForState(auState) : 'ACARA'}${auState ? ` — ${auState}` : ''}\n\nUse Australian curriculum terminology, spelling and examples. Create comprehensive study material covering the most important topics for this grade level.`
        await api(`/study/topics/${topic.id}/documents`, { method: 'POST', body: JSON.stringify({ title: `${subject} concepts`, fileUrl: 'text://inline', fileType: 'text', content }) })
      }
      qc.invalidateQueries({ queryKey: ['study-topics'] })
      qc.invalidateQueries({ queryKey: ['study-stats'] })
      onDone()
    } catch {
      setError("I couldn't build your decks just now — check your connection and try again.")
      setStage('subjects')
    }
  }

  return (
    <MatildaHost caption={caption} onSwitchPal={onSwitchPal} mood={stage === 'building' ? 'happy' : 'neutral'}>
      {stage === 'grade' && (
        <div className="grid grid-cols-2 gap-3">
          {GRADES.map((g, i) => (
            <button
              key={g}
              onClick={() => { setGrade(g); setStage('state') }}
              className="pv-press pv-pop pv-title rounded-2xl py-4 text-center"
              style={grade === g
                ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 28}ms` }
                : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 28}ms` }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {stage === 'state' && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {AU_STATES.map((s) => (
              <button
                key={s}
                onClick={() => { setAuState(s); setStage('subjects') }}
                className="pv-press pv-pop rounded-full px-4 py-2.5 text-sm font-bold"
                style={auState === s
                  ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
                  : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={() => setStage('subjects')} className="pv-press mx-auto mt-5 block text-sm font-bold" style={{ color: 'var(--pv-ink-3)' }}>Skip</button>
        </>
      )}

      {stage === 'subjects' && (
        <>
          <div className="flex flex-col gap-2.5">
            {subjectsForGrade(grade).map((s, i) => {
              const on = subjects.includes(s)
              return (
                <button
                  key={s}
                  onClick={() => toggle(s)}
                  className="pv-press pv-pop flex items-center gap-3 rounded-2xl px-4 py-3.5 font-bold"
                  style={on
                    ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 28}ms` }
                    : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 28}ms` }}
                >
                  <span className="text-xl">{subjectEmoji(s)}</span>
                  <span className="flex-1 text-left">{s}</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ border: on ? '2px solid currentColor' : '2px solid var(--pv-line-strong)' }}>{on && <Check size={14} />}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-5">
            <Button variant="accent" size="lg" full leadingIcon={Sparkles} onClick={build} disabled={subjects.length === 0}>
              Build my decks{subjects.length > 0 ? ` · ${subjects.length}` : ''}
            </Button>
          </div>
          {grade && <button onClick={() => setStage('grade')} className="pv-press mx-auto mt-3 block text-sm font-bold" style={{ color: 'var(--pv-ink-3)' }}>Change year</button>}
          <button onClick={onManual} className="pv-press mx-auto mt-2 block text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Prefer a form instead?</button>
          {error && <p className="mt-3 text-center text-sm font-semibold" style={{ color: 'var(--pv-neg)' }}>{error}</p>}
        </>
      )}

      {stage === 'building' && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full" style={{ border: '3px solid transparent', borderTopColor: 'var(--pv-accent)' }} />
            <Sparkles size={22} style={{ color: 'var(--pv-accent)' }} />
          </div>
          <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>Generating concepts for {subjects.length} subject{subjects.length > 1 ? 's' : ''}.</p>
        </div>
      )}
    </MatildaHost>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// HOME — Matilda greets, points at the weakest subject, offers a one-tap start.
// ═══════════════════════════════════════════════════════════════════════

export function StudyAvatarHome({ onSelect, onSetup, onDemo, demoBusy, onSwitchPal }: {
  onSelect: (id: string) => void
  onSetup: () => void
  onDemo: () => void
  demoBusy: boolean
  onSwitchPal?: () => void
}) {
  const account = useAuthStore((s) => s.account)
  const name = ((account?.persona?.name as string) || '').trim().split(' ')[0] || ''
  const { data: topicsData } = useQuery({ queryKey: ['study-topics'], queryFn: () => api<{ topics: Topic[] }>('/study/topics') })
  const { data: stats } = useQuery({ queryKey: ['study-stats'], queryFn: () => api<Stats>('/study/stats') })

  const topics = topicsData?.topics ?? []
  const ready = topics.filter((t) => t.totalCards > 0)
  const masteryPct = (t: Topic) => (t.totalCards > 0 ? (t.totalCards - t.cardsDue) / t.totalCards : 1)
  const weak = ready.length ? [...ready].sort((a, b) => masteryPct(a) - masteryPct(b))[0] : null
  const generating = topics.filter((t) => t.totalCards === 0)

  const caption = weak
    ? `${name ? `Hey ${name}! ` : ''}You're a little rusty on ${weak.title} — ${weak.cardsDue} card${weak.cardsDue !== 1 ? 's' : ''} to review. Want to jump in?`
    : generating.length > 0
      ? `${name ? `Hi ${name}! ` : ''}I'm putting your cards together now — give me a few seconds.`
      : `${name ? `Hi ${name}! ` : ''}Let's set you up so we can start learning together.`

  return (
    <MatildaHost
      caption={caption}
      onSwitchPal={onSwitchPal}
      right={(
        <button onClick={onSetup} aria-label="Add subjects" className="pv-press flex h-10 w-10 flex-none items-center justify-center rounded-full" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}>
          <Plus size={18} strokeWidth={2.6} />
        </button>
      )}
    >
      {stats && (stats.streak > 0 || stats.cardsMastered > 0) && (
        <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
          <span>🔥 {stats.streak} day streak</span><span>·</span><span>{stats.cardsMastered} mastered</span>
        </div>
      )}

      {weak && (
        <button onClick={() => onSelect(weak.id)} className="pv-press-lg pv-pop pv-sheen mb-3 flex w-full items-center gap-4 rounded-2xl p-4 text-left" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-2xl" style={{ background: 'rgba(255,255,255,0.5)' }}>{weak.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="pv-title truncate">Start {weak.title}</p>
            <p className="mt-0.5 text-xs font-semibold" style={{ opacity: 0.8 }}>{weak.cardsDue} to review · let's go</p>
          </div>
          <ChevronRight size={20} className="flex-none" />
        </button>
      )}

      <button onClick={onDemo} disabled={demoBusy} className="pv-press pv-pop pv-glass pv-hairline mb-3 flex w-full items-center gap-4 rounded-2xl p-4 text-left disabled:opacity-60">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>🏛️</span>
        <div className="min-w-0 flex-1">
          <p className="pv-title truncate">{demoBusy ? 'Building your WWI deck…' : 'Try a demo — World War I'}</p>
          <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>History · flashcards in seconds</p>
        </div>
        {demoBusy
          ? <span className="h-4 w-4 flex-none animate-spin rounded-full" style={{ border: '2px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
          : <ChevronRight size={16} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}
      </button>

      {ready.length > 0 && <p className="pv-label mb-2 mt-4">Your subjects</p>}
      <div className="flex flex-col gap-2.5">
        {ready.map((t) => {
          const pct = Math.round(masteryPct(t) * 100)
          return (
            <Card key={t.id} onClick={() => onSelect(t.id)} className="flex items-center gap-4 p-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-xl" style={{ background: 'var(--pv-surface-2)' }}>{t.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="pv-title truncate">{t.title}</p>
                <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{t.totalCards} concepts · {t.cardsDue} to review</p>
              </div>
              <span className="pv-amount text-sm pv-text-accent">{pct}%</span>
              <ChevronRight size={16} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
            </Card>
          )
        })}
        {generating.map((t) => (
          <Card key={t.id} className="flex items-center gap-4 p-4" style={{ opacity: 0.7 }}>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-xl" style={{ background: 'var(--pv-surface-2)' }}>{t.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="pv-title truncate">{t.title}</p>
              <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>Generating…</p>
            </div>
            <span className="h-4 w-4 flex-none animate-spin rounded-full" style={{ border: '2px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
          </Card>
        ))}
        {topics.length === 0 && (
          <button onClick={onSetup} className="pv-press pv-glass pv-hairline flex items-center gap-3 rounded-2xl p-5 text-left">
            <BookOpen size={24} style={{ color: 'var(--pv-accent)' }} />
            <div className="flex-1">
              <p className="pv-title">Set up your subjects</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>Tell Matilda your year & subjects to begin.</p>
            </div>
            <ChevronRight size={18} style={{ color: 'var(--pv-ink-3)' }} />
          </button>
        )}
      </div>
    </MatildaHost>
  )
}
