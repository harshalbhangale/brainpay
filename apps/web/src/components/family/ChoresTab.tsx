import { useState } from 'react'
import { Plus, ListChecks } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { Card, SectionTitle, PressButton } from '../ui'
import { AddChoreModal } from './modals'
import { isKid as isKidMember, kidName, type Chore, type ChoresResponse, type Member, type Subject } from './types'

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'To do', color: '#9aa0aa' },
  submitted: { label: 'Submitted', color: '#ffb627' },
  ai_approved: { label: 'AI approved', color: '#3ddc84' },
  ai_rejected: { label: 'AI rejected', color: '#ff5c5c' },
  ai_uncertain: { label: 'Needs review', color: '#ffb627' },
  parent_approved: { label: 'Approved', color: '#3ddc84' },
  parent_rejected: { label: 'Rejected', color: '#ff5c5c' },
  paid: { label: 'Paid', color: '#3ddc84' },
}

const AWAITING = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']

export function ChoresTab({ subject, members, isKid }: { subject: Subject; members: Member[]; isKid?: boolean }) {
  const qc = useQueryClient()
  const [addChore, setAddChore] = useState(false)
  const kids = members.filter(isKidMember)

  const q = useQuery({ queryKey: ['chores'], queryFn: () => api<ChoresResponse>('/chores') })
  const all = q.data?.chores ?? []
  const chores = subject.kind === 'kid' ? all.filter((ch) => ch.assignedTo === subject.accountId) : all
  const nameById = new Map(members.map((m) => [m.accountId, kidName(m)]))

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'parent_approved' | 'parent_rejected' }) =>
      api(`/chores/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] })
      qc.invalidateQueries({ queryKey: ['family'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const presetKidId = subject.kind === 'kid' ? subject.accountId : undefined

  return (
    <div className="space-y-3 p-5">
      <SectionTitle
        action={
          !isKid && (
            <button onClick={() => setAddChore(true)} disabled={kids.length === 0} className="press flex items-center gap-1 text-sm font-bold text-grad-accent disabled:opacity-40">
              <Plus size={15} /> New chore
            </button>
          )
        }
      >
        Chores
      </SectionTitle>

      {q.isLoading && <p className="text-center text-sm text-muted">Loading…</p>}
      {!q.isLoading && chores.length === 0 && (
        <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ backgroundImage: 'var(--grad-accent-bright)' }}><ListChecks size={20} /></span>
          <span className="text-sm text-muted">{kids.length === 0 ? 'Add a kid first, then assign chores.' : 'No chores yet.'}</span>
        </Card>
      )}

      <div className="flex flex-col gap-2.5">
        {chores.map((ch, i) => (
          <ChoreRow
            key={ch.id}
            chore={ch}
            who={nameById.get(ch.assignedTo) ?? 'Kid'}
            busy={review.isPending}
            index={i}
            isKid={isKid}
            onApprove={() => review.mutate({ id: ch.id, status: 'parent_approved' })}
            onReject={() => review.mutate({ id: ch.id, status: 'parent_rejected' })}
          />
        ))}
      </div>

      {addChore && <AddChoreModal kids={kids} presetKidId={presetKidId} onClose={() => setAddChore(false)} />}
    </div>
  )
}

function ChoreRow({
  chore,
  who,
  busy,
  index,
  isKid,
  onApprove,
  onReject,
}: {
  chore: Chore
  who: string
  busy: boolean
  index: number
  isKid?: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const st = STATUS[chore.status] ?? { label: chore.status, color: '#9aa0aa' }
  // Only parents review/approve chores — kids just see their status.
  const canReview = !isKid && AWAITING.includes(chore.status)
  return (
    <Card className="animate-pop-in p-4" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{chore.title}</div>
          <div className="text-xs text-muted">{who}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-grad-accent">{aud(chore.rewardBrains)}</span>
          <span
            className="rounded-full px-2 py-1 text-[10px] font-bold uppercase"
            style={{ color: st.color, backgroundColor: `${st.color}22` }}
          >
            {st.label}
          </span>
        </div>
      </div>

      {chore.aiReason && <p className="mt-2 text-xs italic text-muted">PAL: {chore.aiReason}</p>}

      {canReview && (
        <div className="mt-3 flex gap-2">
          <PressButton
            onClick={onReject}
            disabled={busy}
            className="glass flex-1 rounded-full py-2 text-sm font-bold text-ink disabled:opacity-50"
          >
            Reject
          </PressButton>
          <PressButton
            onClick={onApprove}
            disabled={busy}
            className="flex-1 rounded-full py-2 text-sm font-bold text-on-accent glow-accent disabled:opacity-50"
            style={{ backgroundImage: 'var(--grad-accent-bright)' }}
          >
            Approve &amp; pay
          </PressButton>
        </div>
      )}
    </Card>
  )
}
