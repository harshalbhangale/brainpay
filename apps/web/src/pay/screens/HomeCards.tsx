/**
 * HomeCards — the chat-first "home". A scoped strip of inline cards PAL surfaces
 * at the top of the timeline (proactively on open, always answerable in-thread):
 * Balance, Chores, Activity preview, Goals, and "Where is <child>". Heavy views
 * are summoned as canvases; money actions go through the existing intent flow.
 *
 * Scope follows the active child (parent) or the kid themselves.
 */
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ListChecks, Receipt, Plus, CreditCard, MapPin, Target, Wallet, GraduationCap } from 'lucide-react'
import { Avatar, Card, IconBadge, ListRow } from '../components/primitives'
import { fmt, signed, timeAgo } from '../data'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { useActiveChild } from '../lib/activeChild'
import { useCanvas } from '../lib/canvasStore'
import { useWallet, useFamilyKids } from '../useMoneyPal'
import type { ChoresResponse } from '../../components/family/types'

const AWAITING = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']

export function HomeCards({ onAsk }: { onAsk: (text: string) => void }) {
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const childId = useActiveChild((s) => s.childId)
  const open = useCanvas((s) => s.open)
  const wallet = useWallet()
  const { kids } = useFamilyKids()
  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<ChoresResponse>('/chores'), enabled: wallet.live })
  const chores = choresQ.data?.chores ?? []

  const activeKid = !isKid && childId ? kids.find((k) => k.id === childId) ?? null : null
  const subjectName = isKid ? 'You' : activeKid ? activeKid.name : 'the family'
  const balance = isKid ? wallet.balance : activeKid ? activeKid.balance : wallet.balance

  const toApprove = chores.filter((c) => AWAITING.includes(c.status) && (!activeKid || c.assignedTo === activeKid.id)).length
  const myTodo = chores.filter((c) => c.assignedTo === account?.id && c.status === 'pending').length
  const recent = wallet.txns.slice(0, 3)
  const goal = activeKid?.goal

  return (
    <div className="space-y-3">
      {/* Balance */}
      <Card className="overflow-hidden p-4" style={{ background: 'var(--pv-grad-ink)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="pv-label" style={{ color: 'rgba(255,255,255,0.55)' }}>{isKid ? 'Your money' : activeKid ? `${activeKid.name}'s balance` : 'Family wallet'}</div>
            <div className="pv-amount mt-1 text-[2rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>{fmt(balance)}</div>
          </div>
          <Wallet size={20} style={{ color: 'rgba(255,255,255,0.5)' }} />
        </div>
        <div className="mt-3 flex gap-2">
          {!isKid && (
            <CardBtn onClick={() => open('topup', activeKid?.id)} icon={Plus} label="Add money" primary />
          )}
          <CardBtn onClick={() => open('card')} icon={CreditCard} label="Card" />
        </div>
      </Card>

      {/* Chores */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <IconBadge Icon={ListChecks} tile="sky" size={40} />
          <div className="min-w-0 flex-1">
            <div className="pv-title">{isKid ? 'Chores to do' : 'Chores to review'}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
              {isKid
                ? (myTodo ? `${myTodo} waiting — earn rewards` : 'All done 🎉')
                : (toApprove ? `${toApprove} need${toApprove === 1 ? 's' : ''} your review` : 'All caught up')}
            </div>
          </div>
          {isKid ? (
            <CardBtn onClick={() => open('chore')} icon={ListChecks} label="Verify" primary />
          ) : (
            <button onClick={() => open('family')} aria-label="Review chores" className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)' }}>
              <ChevronRight size={18} style={{ color: 'var(--pv-ink-2)' }} />
            </button>
          )}
        </div>
      </Card>

      {/* Goal */}
      {goal ? (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-3">
            <IconBadge Icon={Target} tile="butter" size={40} />
            <div className="min-w-0 flex-1">
              <div className="pv-title truncate">{goal.title}</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{fmt(goal.saved, { cents: false })} of {fmt(goal.target, { cents: false })}</div>
            </div>
            <button onClick={() => onAsk(`Put $5 toward ${subjectName === 'You' ? 'my' : subjectName + "'s"} ${goal.title} goal`)} className="pv-press rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
              Add
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--pv-surface-3)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((goal.saved / goal.target) * 100))}%`, backgroundImage: 'var(--pv-grad-accent)' }} />
          </div>
        </Card>
      ) : (
        <button onClick={() => onAsk(isKid ? 'Help me set a savings goal' : `Set a savings goal for ${subjectName}`)} className="pv-press flex w-full items-center gap-3 rounded-[var(--pv-r-lg)] p-4 text-left" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
          <IconBadge Icon={Target} tile="butter" size={40} />
          <div className="min-w-0 flex-1">
            <div className="pv-title">Set a savings goal</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Pick something to save toward</div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--pv-ink-3)' }} />
        </button>
      )}

      {/* Activity preview */}
      <Card className="px-4 py-1.5">
        <div className="flex items-center justify-between py-2">
          <span className="pv-label">Recent activity</span>
          <button onClick={() => open('activity')} className="pv-press flex items-center gap-0.5 text-sm font-bold" style={{ color: 'var(--pv-accent)' }}>
            See all <ChevronRight size={15} />
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-5 text-center">
            <Receipt size={20} style={{ color: 'var(--pv-ink-3)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>No activity yet.</span>
          </div>
        ) : (
          recent.map((t, i) => (
            <div key={t.id} style={{ borderTop: '1px solid var(--pv-line)' }}>
              <ListRow
                leading={<Avatar initials={t.initials} tile={t.tile} size={40} />}
                title={t.name}
                subtitle={`${t.detail} · ${timeAgo(t.when)}`}
                value={signed(t.amount, t.dir)}
                valueColor={t.dir === 'in' ? 'var(--pv-pos)' : 'var(--pv-ink)'}
                onClick={() => open('activity')}
              />
            </div>
          ))
        )}
      </Card>

      {/* StudyPal */}
      <button onClick={() => open('study')} className="pv-press flex w-full items-center gap-3 rounded-[var(--pv-r-lg)] p-4 text-left" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
        <IconBadge Icon={GraduationCap} tile="lilac" size={40} />
        <div className="min-w-0 flex-1">
          <div className="pv-title">{isKid ? 'Learn & revise' : `${subjectName === 'the family' ? "Your kids'" : subjectName + "'s"} learning`}</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{isKid ? 'Flashcards, quizzes & an AI tutor' : 'Progress & AI interviews'}</div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--pv-ink-3)' }} />
      </button>

      {/* Where is */}
      <button onClick={() => open('map')} className="pv-press flex w-full items-center gap-3 rounded-[var(--pv-r-lg)] p-4 text-left" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
        <IconBadge Icon={MapPin} tile="mint" size={40} />
        <div className="min-w-0 flex-1">
          <div className="pv-title">{isKid ? "Where's my family?" : activeKid ? `Where's ${activeKid.name}?` : "Where's everyone?"}</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Open the family map</div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--pv-ink-3)' }} />
      </button>
    </div>
  )
}

function CardBtn({ onClick, icon: Icon, label, primary }: { onClick: () => void; icon: typeof Plus; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="pv-press flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-bold"
      style={primary
        ? { background: 'var(--pv-on-dark)', color: 'var(--pv-ink)' }
        : { background: 'rgba(255,255,255,0.14)', color: 'var(--pv-on-dark)' }}
    >
      <Icon size={16} strokeWidth={2.4} /> {label}
    </button>
  )
}
