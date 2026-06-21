import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Banknote, ShoppingBag, SlidersHorizontal, Circle, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { audSigned, relativeTime } from '../../lib/format'
import { Card, SectionTitle } from '../ui'
import { kidName, type FeedResponse, type LedgerEntry, type Member, type Subject } from './types'

function describe(entry: LedgerEntry): { Icon: LucideIcon; label: string } {
  const md = (entry.metadata ?? {}) as Record<string, unknown>
  switch (entry.kind) {
    case 'chore_payout':
      return { Icon: CheckCircle2, label: (md.choreTitle as string) ? `Chore: ${md.choreTitle}` : 'Chore reward' }
    case 'topup':
    case 'topup_stripe':
      return { Icon: Banknote, label: (md.note as string) || 'Money added' }
    case 'cart_checkout':
      return { Icon: ShoppingBag, label: (md.itemName as string) || 'Purchase' }
    case 'adjustment':
      return { Icon: SlidersHorizontal, label: (md.note as string) || 'Adjustment' }
    default:
      return { Icon: Circle, label: entry.kind.replace(/_/g, ' ') }
  }
}

export function ActivityTab({ subject, members }: { subject: Subject; members: Member[] }) {
  const key = subject.kind === 'kid' ? subject.accountId : 'family'
  const url =
    subject.kind === 'kid'
      ? `/family/feed?kidId=${subject.accountId}&limit=100`
      : '/family/feed?limit=100'

  const q = useQuery({ queryKey: ['feed', key], queryFn: () => api<FeedResponse>(url) })
  const entries = q.data?.entries ?? []
  const nameById = new Map(members.map((m) => [m.accountId, kidName(m)]))
  const showWho = subject.kind === 'family'

  return (
    <div className="space-y-3 p-5">
      <SectionTitle>Activity</SectionTitle>

      {q.isLoading && <p className="text-center text-sm text-muted">Loading…</p>}
      {!q.isLoading && entries.length === 0 && (
        <Card className="px-4 py-6 text-center text-sm text-muted">No transactions yet.</Card>
      )}

      <div className="flex flex-col gap-2.5">
        {entries.map((e) => {
          const { Icon, label } = describe(e)
          const positive = e.brainsDelta >= 0
          return (
            <Card key={e.id} className="animate-msg-in flex items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{label}</div>
                <div className="text-xs text-muted">
                  {showWho ? `${nameById.get(e.accountId) ?? 'Member'} · ` : ''}
                  {relativeTime(e.createdAt)}
                </div>
              </div>
              <div className={`text-sm font-bold ${positive ? 'text-accent' : 'text-danger'}`}>
                {audSigned(e.brainsDelta)}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
