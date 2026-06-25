/**
 * Chores (light) — real /chores list with parent approve/reject + add-chore.
 * Reuses the backend and family types; restyled to `.pv`.
 */
import { useState } from 'react'
import { Plus, ListChecks, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { aud } from '../../../lib/format'
import type { Chore, ChoresResponse } from '../../../components/family/types'
import { Button, Card } from '../../components/primitives'

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'To do', color: '#9aa0ac' },
  submitted: { label: 'Submitted', color: '#d98e04' },
  ai_approved: { label: 'AI approved', color: '#12a150' },
  ai_rejected: { label: 'AI rejected', color: '#e5484d' },
  ai_uncertain: { label: 'Needs review', color: '#d98e04' },
  parent_approved: { label: 'Approved', color: '#12a150' },
  parent_rejected: { label: 'Rejected', color: '#e5484d' },
  paid: { label: 'Paid', color: '#12a150' },
}
const AWAITING = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']
// Not yet settled — still needs the kid to act or a parent to review.
const ACTIVE = ['pending', 'submitted', 'ai_uncertain', 'ai_rejected']

export type ChoreKid = { id: string; name: string }

export function ChoresSection({ kids, enabled }: { kids: ChoreKid[]; enabled: boolean }) {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)

  const q = useQuery({ queryKey: ['chores'], queryFn: () => api<ChoresResponse>('/chores'), enabled })
  const chores = q.data?.chores ?? []

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'parent_approved' | 'parent_rejected' }) => api(`/chores/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] })
      qc.invalidateQueries({ queryKey: ['pay', 'family'] })
      qc.invalidateQueries({ queryKey: ['pay', 'wallet'] })
    },
  })

  const report = useMutation({
    mutationFn: (id: string) => api(`/chores/${id}/report`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] })
      qc.invalidateQueries({ queryKey: ['pay', 'family'] })
      qc.invalidateQueries({ queryKey: ['pay', 'wallet'] })
    },
  })

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="pv-h2">Chores</h3>
        <button onClick={() => setAddOpen(true)} disabled={kids.length === 0} className="pv-press flex items-center gap-1 text-sm font-bold pv-text-accent disabled:opacity-40">
          <Plus size={15} /> New chore
        </button>
      </div>

      {!enabled ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><ListChecks size={20} /></span>
          <span className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>Sign in to assign chores and approve payouts.</span>
        </Card>
      ) : q.isLoading ? (
        <p className="text-center text-sm" style={{ color: 'var(--pv-ink-3)' }}>Loading…</p>
      ) : chores.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><ListChecks size={20} /></span>
          <span className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>{kids.length === 0 ? 'Add a kid first, then assign chores.' : 'No chores yet.'}</span>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {kids.map((kid) => {
            const list = chores.filter((ch) => ch.assignedTo === kid.id)
            if (list.length === 0) return null
            const active = list.filter((ch) => ACTIVE.includes(ch.status)).length
            return (
              <div key={kid.id}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="pv-label">{kid.name}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={active > 0 ? { background: 'var(--pv-accent-soft)', color: 'var(--pv-accent-2)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>
                    {active > 0 ? `${active} active` : 'All done'}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {list.map((ch, i) => (
                    <ChoreRow key={ch.id} chore={ch} who={kid.name} busy={review.isPending} reporting={report.isPending} index={i}
                      onApprove={() => review.mutate({ id: ch.id, status: 'parent_approved' })}
                      onReject={() => review.mutate({ id: ch.id, status: 'parent_rejected' })}
                      onReport={() => report.mutate(ch.id)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && <AddChoreSheet kids={kids} onClose={() => setAddOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['chores'] })} />}
    </div>
  )
}

function ChoreRow({ chore, who, busy, reporting, index, onApprove, onReject, onReport }: { chore: Chore; who: string; busy: boolean; reporting: boolean; index: number; onApprove: () => void; onReject: () => void; onReport: () => void }) {
  const [confirmReport, setConfirmReport] = useState(false)
  const st = STATUS[chore.status] ?? { label: chore.status, color: '#9aa0ac' }
  const canReview = AWAITING.includes(chore.status)
  // A chore the AI auto-verified and paid (Policy A) — the parent can still undo it.
  const autoPaid = chore.status === 'paid' && chore.aiVerdict === 'approved'
  return (
    <Card className="pv-pop p-4" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-bold">{chore.title}</div>
          <div className="text-xs" style={{ color: 'var(--pv-ink-3)' }}>{who}{autoPaid ? ' · paid by PAL' : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pv-amount text-sm pv-text-accent">{aud(chore.rewardBrains)}</span>
          <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase" style={{ color: st.color, backgroundColor: `${st.color}22` }}>{st.label}</span>
        </div>
      </div>
      {chore.aiReason && <p className="mt-2 text-xs italic" style={{ color: 'var(--pv-ink-3)' }}>PAL: {chore.aiReason}</p>}
      {canReview && (
        <div className="mt-3 flex gap-2">
          <Button variant="soft" full onClick={onReject} disabled={busy}>Reject</Button>
          <Button variant="accent" full onClick={onApprove} disabled={busy}>Approve &amp; pay</Button>
        </div>
      )}
      {autoPaid && (
        confirmReport ? (
          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--pv-ink-2)' }}>Undo this payout? {aud(chore.rewardBrains)} will be taken back from {who}.</p>
            <div className="flex gap-2">
              <Button variant="soft" full onClick={() => setConfirmReport(false)} disabled={reporting}>Keep it</Button>
              <button onClick={onReport} disabled={reporting} className="pv-press-lg inline-flex h-12 w-full items-center justify-center rounded-full font-bold tracking-tight disabled:opacity-40" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>{reporting ? 'Undoing…' : 'Undo payout'}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmReport(true)} className="pv-press mt-2 text-xs font-bold" style={{ color: 'var(--pv-ink-3)' }}>
            Wasn't done right? Report
          </button>
        )
      )}
    </Card>
  )
}

function AddChoreSheet({ kids, onClose, onCreated }: { kids: ChoreKid[]; onClose: () => void; onCreated: () => void }) {
  const [assignedTo, setAssignedTo] = useState(kids[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [reward, setReward] = useState('50')
  const mutation = useMutation({
    mutationFn: () => api('/chores', { method: 'POST', body: JSON.stringify({ assignedTo, title: title.trim(), rewardBrains: Math.max(1, parseInt(reward || '50', 10) || 50) }) }),
    onSuccess: () => { onCreated(); onClose() },
  })
  const valid = assignedTo && title.trim().length > 0
  const field = 'mt-2 h-12 w-full rounded-2xl px-4 text-base font-semibold outline-none'
  const fieldStyle = { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' } as React.CSSProperties

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)' }} onClick={onClose} />
      <div className="pv-rise relative w-full max-w-[460px] rounded-t-[var(--pv-r-2xl)] p-6 pb-[max(24px,env(safe-area-inset-bottom))]" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
        <div className="flex items-center justify-between">
          <h2 className="pv-h2">New chore</h2>
          <button onClick={onClose} aria-label="Close" className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}><X size={18} /></button>
        </div>
        <label className="mt-5 block"><span className="pv-label">For</span>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={field} style={fieldStyle}>
            {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
        <label className="mt-4 block"><span className="pv-label">Chore</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Take out the bins" className={field} style={fieldStyle} />
        </label>
        <label className="mt-4 block"><span className="pv-label">Reward (AUD)</span>
          <input value={reward} onChange={(e) => setReward(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={field} style={fieldStyle} />
        </label>
        {mutation.isError && <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--pv-neg)' }}>{mutation.error instanceof Error ? mutation.error.message : 'Could not create chore'}</p>}
        <div className="mt-6"><Button variant="primary" size="lg" full disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Creating…' : 'Create chore'}</Button></div>
      </div>
    </div>
  )
}
