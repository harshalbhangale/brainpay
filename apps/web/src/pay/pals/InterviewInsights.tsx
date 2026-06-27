/**
 * InterviewInsights — the shared, rich analysis block for a viva.
 * ───────────────────────────────────────────────────────────────────────────
 * One component renders the AI's read on an interview everywhere it's shown:
 * the kid's post-interview results, the kid's Past-interview detail, and the
 * parent's oversight detail. `audience` only swaps the copy (encouraging for
 * kids, oversight-framed for parents); the data + layout stay identical.
 */
import { Sparkles, TrendingUp, Target, Lightbulb } from 'lucide-react'

export type ConceptRating = { name: string; rating: 1 | 2 | 3 }
export type InterviewAnalysis = {
  score: number
  level: string
  headline: string
  summary: string
  strengths: string[]
  weakPoints: string[]
  recommendations: string[]
  concepts: ConceptRating[]
  encouragement: string
}

const RATING_META: Record<1 | 2 | 3, { label: string; bg: string; fg: string; pct: number }> = {
  1: { label: 'Needs work', bg: 'var(--pv-neg-soft)', fg: 'var(--pv-neg)', pct: 34 },
  2: { label: 'Getting there', bg: 'var(--pv-accent-soft)', fg: 'var(--pv-accent)', pct: 67 },
  3: { label: 'Strong', bg: 'var(--pv-pos-soft)', fg: 'var(--pv-pos)', pct: 100 },
}

export function scoreTone(score: number | null | undefined): { bg: string; fg: string } {
  if (typeof score !== 'number') return { bg: 'var(--pv-surface-2)', fg: 'var(--pv-ink-3)' }
  if (score >= 8) return { bg: 'var(--pv-pos-soft)', fg: 'var(--pv-pos)' }
  if (score >= 5) return { bg: 'var(--pv-accent-soft)', fg: 'var(--pv-accent)' }
  return { bg: 'var(--pv-neg-soft)', fg: 'var(--pv-neg)' }
}

export function InterviewInsights({ analysis, audience = 'kid' }: { analysis: InterviewAnalysis; audience?: 'kid' | 'parent' }) {
  const isParent = audience === 'parent'
  const labels = {
    concepts: isParent ? 'Concept breakdown' : 'How you did, topic by topic',
    strengths: isParent ? 'Strengths' : 'What you nailed',
    weak: isParent ? 'Where to help' : 'Work on these',
    recs: isParent ? 'Recommended next steps' : 'Try this next',
  }
  const a = analysis
  let i = 0
  const delay = () => i++

  return (
    <div className="flex flex-col gap-3">
      {a.concepts.length > 0 && (
        <Section icon={<TrendingUp size={15} />} title={labels.concepts} tint="rgba(56,189,248,0.14)" d={delay()}>
          <div className="flex flex-col gap-2.5">
            {a.concepts.map((c, idx) => {
              const m = RATING_META[c.rating]
              return (
                <div key={idx}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{c.name}</span>
                    <span className="flex-none rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--pv-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.fg, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {a.strengths.length > 0 && (
        <Section icon={<Sparkles size={15} />} title={labels.strengths} tint="rgba(18,161,80,0.14)" d={delay()}>
          <BulletList items={a.strengths} dotColor="var(--pv-pos)" />
        </Section>
      )}

      {a.weakPoints.length > 0 && (
        <Section icon={<Target size={15} />} title={labels.weak} tint="rgba(229,72,77,0.12)" d={delay()}>
          <BulletList items={a.weakPoints} dotColor="var(--pv-neg)" />
        </Section>
      )}

      {a.recommendations.length > 0 && (
        <Section icon={<Lightbulb size={15} />} title={labels.recs} tint="var(--pv-accent-soft)" d={delay()}>
          <div className="flex flex-col gap-2">
            {a.recommendations.map((r, idx) => (
              <div key={idx} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'var(--pv-surface-2)' }}>
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: 'var(--pv-accent)', color: 'var(--pv-on-accent)' }}>{idx + 1}</span>
                <span className="text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>{r}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ icon, title, tint, d, children }: { icon: React.ReactNode; title: string; tint: string; d: number; children: React.ReactNode }) {
  return (
    <div className="pv-rise rounded-2xl p-4" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', ['--i' as string]: d }}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: tint, color: 'var(--pv-ink)' }}>{icon}</span>
        <p className="pv-title text-sm">{title}</p>
      </div>
      {children}
    </div>
  )
}

function BulletList({ items, dotColor }: { items: string[]; dotColor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: 'var(--pv-ink-2)' }}>
          <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: dotColor }} />
          <span>{t}</span>
        </div>
      ))}
    </div>
  )
}
