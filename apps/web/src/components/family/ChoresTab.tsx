import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { AddChoreModal } from './modals'
import { isKid, kidName, type Chore, type ChoresResponse, type Member, type Subject } from './types'

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

export function ChoresTab({ subject, members }: { subject: Subject; members: Member[] }) {
  const qc = useQueryClient()
  const [addChore, setAddChore] = useState(false)
  const kids = members.filter(isKid)

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
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Chores</h2>
        <button
          onClick={() => setAddChore(true)}
          disabled={kids.length === 0}
          className="text-sm font-bold text-accent disabled:opacity-40"
        >
          + New chore
        </button>
      </div>

      {q.isLoading && <p className="text-center text-sm text-muted">Loading…</p>}
      {!q.isLoading && chores.length === 0 && (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
          {kids.length === 0 ? 'Add a kid first, then assign chores.' : 'No chores yet.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {chores.map((ch) => (
          <ChoreRow
            key={ch.id}
            chore={ch}
            who={nameById.get(ch.assignedTo) ?? 'Kid'}
            busy={review.isPending}
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
  onApprove,
  onReject,
}: {
  chore: Chore
  who: string
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const st = STATUS[chore.status] ?? { label: chore.status, color: '#9aa0aa' }
  const canReview = AWAITING.includes(chore.status)
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{chore.title}</div>
          <div className="text-xs text-muted">{who}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-accent">{aud(chore.rewardBrains)}</span>
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
          <button
            onClick={onReject}
            disabled={busy}
            className="flex-1 rounded-full bg-surface2 py-2 text-sm font-bold text-ink active:scale-[0.98] disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex-1 rounded-full bg-accent py-2 text-sm font-bold text-on-accent active:scale-[0.98] disabled:opacity-50"
          >
            Approve &amp; pay
          </button>
        </div>
      )}
    </div>
  )
}
