/**
 * KidChores — the kid's own chores, with the camera Verify flow.
 * ───────────────────────────────────────────────────────────────────────────
 * Each "to do" chore gets a big Verify button → VerifyChoreSheet. PAL checks
 * the photo and (Policy A) auto-credits on approval. Every status has a
 * first-class, friendly state — no dead-ends.
 */
import { useMemo, useState } from 'react'
import { Camera, Check, Clock, ListChecks, RefreshCw, Sparkles, PartyPopper } from 'lucide-react'
import { TopBar } from '../components/shell'
import { Button, Card, IconBadge } from '../components/primitives'
import { aud } from '../../lib/format'
import { useAuthStore } from '../../stores/auth'
import type { Chore } from '../../components/family/types'
import { useKidChores, VERIFIABLE, VerifyChoreSheet } from '../chores/verify'

type KidStatus = {
  label: string
  color: string
  hint?: (c: Chore) => string | null
}

const KID_STATUS: Record<string, KidStatus> = {
  pending: { label: 'To do', color: 'var(--pv-ink-3)' },
  ai_rejected: { label: 'Try again', color: 'var(--pv-neg)', hint: (c) => c.aiReason ?? null },
  ai_uncertain: { label: 'A parent is checking', color: '#d98e04', hint: (c) => c.aiReason ?? null },
  submitted: { label: 'Checking…', color: '#d98e04' },
  paid: { label: 'Earned', color: 'var(--pv-pos)', hint: (c) => c.aiReason ?? null },
  parent_approved: { label: 'Earned', color: 'var(--pv-pos)' },
  parent_rejected: { label: 'Not approved', color: 'var(--pv-neg)', hint: (c) => c.parentNote ?? null },
}

export function KidChores() {
  const token = useAuthStore((s) => s.token)
  const q = useKidChores(!!token)
  const [active, setActive] = useState<Chore | null>(null)

  const chores = q.data?.chores ?? []
  const { todo, done } = useMemo(() => {
    const todo = chores.filter((c) => VERIFIABLE.includes(c.status) || c.status === 'submitted' || c.status === 'ai_uncertain')
    const done = chores.filter((c) => c.status === 'paid' || c.status === 'parent_approved' || c.status === 'parent_rejected')
    return { todo, done }
  }, [chores])

  const earnable = todo.reduce((s, c) => s + c.rewardBrains, 0)
  const earned = chores
    .filter((c) => c.status === 'paid' || c.status === 'parent_approved')
    .reduce((s, c) => s + c.rewardBrains, 0)

  return (
    <div className="flex flex-1 flex-col">
      <TopBar leading={<h1 className="pv-h1">My chores</h1>} />

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
        {/* Hero */}
        <Card className="pv-rise mt-2 p-5" style={{ background: 'var(--pv-grad-ink)' }}>
          <div className="pv-label" style={{ color: 'rgba(255,255,255,0.55)' }}>Up for grabs</div>
          <div className="pv-amount mt-1.5 text-[2.4rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>{aud(earnable)}</div>
          <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Sparkles size={15} /> {aud(earned)} earned so far
          </div>
        </Card>

        {q.isLoading ? (
          <p className="mt-10 text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>Loading your chores…</p>
        ) : chores.length === 0 ? (
          <Card className="mt-6 p-8 text-center">
            <IconBadge Icon={PartyPopper} tile="mint" size={48} />
            <div className="pv-h2 mt-4">All clear!</div>
            <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>No chores right now. Enjoy the break. </p>
          </Card>
        ) : (
          <>
            {todo.length > 0 && (
              <div className="mt-7">
                <h3 className="pv-h2 mb-3">To do</h3>
                <div className="flex flex-col gap-2.5">
                  {todo.map((c, i) => (
                    <KidChoreCard key={c.id} chore={c} index={i} onVerify={() => setActive(c)} />
                  ))}
                </div>
              </div>
            )}

            {done.length > 0 && (
              <div className="mt-8">
                <h3 className="pv-h2 mb-3">Recent</h3>
                <div className="flex flex-col gap-2.5">
                  {done.map((c, i) => (
                    <KidChoreCard key={c.id} chore={c} index={i} onVerify={() => setActive(c)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {active && <VerifyChoreSheet chore={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function KidChoreCard({ chore, index, onVerify }: { chore: Chore; index: number; onVerify: () => void }) {
  const st = KID_STATUS[chore.status] ?? { label: chore.status, color: 'var(--pv-ink-3)' }
  const canVerify = VERIFIABLE.includes(chore.status)
  const hint = st.hint?.(chore)
  const isDone = chore.status === 'paid' || chore.status === 'parent_approved'

  return (
    <Card className="pv-pop p-4" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      <div className="flex items-center gap-3">
        <IconBadge
          Icon={isDone ? Check : chore.status === 'ai_uncertain' || chore.status === 'submitted' ? Clock : chore.status === 'ai_rejected' ? RefreshCw : ListChecks}
          tile={isDone ? 'mint' : chore.status === 'ai_rejected' || chore.status === 'parent_rejected' ? 'blush' : 'sky'}
          size={42}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{chore.title}</div>
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: st.color }}>{st.label}</div>
        </div>
        <span className="pv-amount text-sm" style={{ color: isDone ? 'var(--pv-pos)' : 'var(--pv-ink-2)' }}>
          {isDone ? '+' : ''}{aud(chore.rewardBrains)}
        </span>
      </div>

      {hint && <p className="mt-2 text-xs italic" style={{ color: 'var(--pv-ink-3)' }}>PAL: {hint}</p>}

      {canVerify && (
        <div className="mt-3">
          <Button variant="accent" full leadingIcon={Camera} onClick={onVerify}>
            {chore.status === 'ai_rejected' ? 'Try again' : 'Verify with camera'}
          </Button>
        </div>
      )}
    </Card>
  )
}
