/**
 * Dashboard — MoneyPal home. Compact, cute, and role-aware (parent vs kid).
 * ───────────────────────────────────────────────────────────────────────────
 * Parent: overall balance, their card (use anywhere), the kids, chores to
 * approve, rewards earned, recent activity.
 * Kid:    their money, their card, chores to earn, rewards, recent activity.
 * All real data (wallet / family / chores ledger). No notifications, no clutter.
 */
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, ChevronRight, Wifi, Users, ListChecks, Gift, Plus, Receipt } from 'lucide-react'
import { Avatar, Card, IconBadge, ListRow, PressButton, Sparkline } from '../components/primitives'
import { TopBar, type TabKey } from '../components/shell'
import { fmt, signed, timeAgo } from '../data'
import { api } from '../../lib/api'
import { cardLast4 } from '../../lib/card'
import { useAuthStore } from '../../stores/auth'
import { useWallet, useFamilyKids } from '../useMoneyPal'
import type { ChoresResponse } from '../../components/family/types'
import type { Pastel } from '../tokens'

const AWAITING = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']

export function Dashboard({ go, onTopUp }: { go: (t: TabKey) => void; goPal?: unknown; onTopUp: () => void }) {
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const persona = (account?.persona ?? {}) as Record<string, unknown>
  const firstName = (((persona.name as string) || 'there')).split(' ')[0]
  const photo = typeof persona.avatar === 'string' ? (persona.avatar as string) : undefined
  const accountId = account?.id ?? 'preview'

  const wallet = useWallet()
  const { kids } = useFamilyKids()
  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<ChoresResponse>('/chores'), enabled: wallet.live })
  const chores = choresQ.data?.chores ?? []
  const toApprove = chores.filter((c) => AWAITING.includes(c.status)).length
  const myTodo = chores.filter((c) => c.assignedTo === account?.id && c.status === 'pending').length
  const earned = wallet.txns.filter((t) => t.dir === 'in').reduce((s, t) => s + t.amount, 0)
  const recent = wallet.txns.slice(0, 3)


  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        leading={
          <>
            <Avatar name={firstName} src={photo} tile="mint" size={40} />
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{isKid ? 'Hey' : 'Welcome back'}</div>
              <div className="pv-title leading-tight">{firstName} {isKid ? '👋' : ''}</div>
            </div>
          </>
        }
      />

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
        {/* Balance hero */}
        <Card className="pv-rise mt-2 overflow-hidden p-5" style={{ ['--i' as string]: 0, background: 'var(--pv-grad-ink)' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="pv-label" style={{ color: 'rgba(255,255,255,0.55)' }}>{isKid ? 'Your money' : 'Total balance'}</div>
              <div className="pv-amount mt-1.5 text-[2.4rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>{fmt(wallet.balance)}</div>
            </div>
            {wallet.changePct !== 0 && (
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.14)', color: '#7ef0b0' }}>
                <TrendingUp size={13} strokeWidth={2.6} />{wallet.changePct}%
              </span>
            )}
          </div>
          <div className="mt-3" style={{ color: '#7ef0b0' }}><Sparkline data={wallet.trend} height={44} /></div>
          <div className="mt-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {fmt(wallet.available)} available{wallet.live ? '' : ' · preview'}
          </div>
        </Card>

        {/* Your card — use anywhere, tap to pay */}
        <CardStrip last4={cardLast4(accountId)} name={firstName} onClick={() => go('cards')} />


        {/* Kids (parent only) — cute chips */}
        {!isKid && kids.length > 0 && (
          <div className="pv-rise mt-6" style={{ ['--i' as string]: 1 }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="pv-label">Kids</h3>
              <button className="pv-press text-sm font-bold" style={{ color: 'var(--pv-accent)' }} onClick={() => go('family')}>Manage</button>
            </div>
            <div className="pv-no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {kids.map((k) => (
                <button key={k.id} onClick={() => go('family')} className="pv-press flex w-[104px] shrink-0 flex-col items-center gap-2 rounded-[var(--pv-r-lg)] p-3" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
                  <Avatar initials={k.initials} tile={k.tile} src={k.avatar} size={52} />
                  <span className="truncate text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>{k.name}</span>
                  <span className="pv-amount text-sm pv-text-accent">{fmt(k.balance, { cents: false })}</span>
                  {k.tasksDue > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-warn-soft, var(--pv-surface-2))', color: 'var(--pv-warn)' }}>{k.tasksDue} new</span>}
                </button>
              ))}
              <button onClick={onTopUp} className="pv-press flex w-[104px] shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--pv-r-lg)] p-3" style={{ border: '2px dashed var(--pv-line-strong)', color: 'var(--pv-ink-3)' }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)' }}><Plus size={22} strokeWidth={2.4} /></span>
                <span className="text-xs font-bold">Top up</span>
              </button>
            </div>
          </div>
        )}

        {/* Chores + Rewards — compact 2-up */}
        <div className="pv-rise mt-6 grid grid-cols-2 gap-3.5" style={{ ['--i' as string]: 2 }}>
          <StatTile
            Icon={ListChecks}
            tile="sky"
            label={isKid ? 'Chores to do' : 'To approve'}
            value={isKid ? String(myTodo) : String(toApprove)}
            sub={isKid ? (myTodo ? 'earn rewards' : 'all done 🎉') : (toApprove ? 'tap to review' : 'all caught up')}
            onClick={() => go('family')}
          />
          <StatTile
            Icon={Gift}
            tile="butter"
            label="Rewards"
            value={fmt(earned, { cents: false })}
            sub={isKid ? 'earned so far' : 'in this month'}
            onClick={() => go('activity')}
          />
        </div>


        {/* Recent activity */}
        <div className="pv-rise mt-6" style={{ ['--i' as string]: 3 }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="pv-label">Recent</h3>
            <button className="pv-press flex items-center gap-0.5 text-sm font-bold" style={{ color: 'var(--pv-accent)' }} onClick={() => go('activity')}>
              See all <ChevronRight size={16} />
            </button>
          </div>
          <Card className="px-4 py-1.5">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-7 text-center">
                <Receipt size={22} style={{ color: 'var(--pv-ink-3)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                  {isKid ? 'Do a chore to earn your first reward!' : 'Add money or assign a chore to get started.'}
                </span>
              </div>
            ) : (
              recent.map((t, i) => (
                <div key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--pv-line)' }}>
                  <ListRow
                    leading={<Avatar initials={t.initials} tile={t.tile} size={42} />}
                    title={t.name}
                    subtitle={`${t.detail} · ${timeAgo(t.when)}`}
                    value={signed(t.amount, t.dir)}
                    valueColor={t.dir === 'in' ? 'var(--pv-pos)' : 'var(--pv-ink)'}
                    sub={t.status === 'pending' ? 'pending' : undefined}
                    onClick={() => go('activity')}
                  />
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}


/* A slim debit-card strip — your real card, usable anywhere. Tap → Card tab. */
function CardStrip({ last4, name, onClick }: { last4: string; name: string; onClick: () => void }) {
  return (
    <PressButton
      spring="lg"
      onClick={onClick}
      className="pv-sheen pv-rise mt-4 flex w-full items-center gap-3 overflow-hidden rounded-[var(--pv-r-lg)] p-4 text-left"
      style={{ ['--i' as string]: 1, backgroundImage: 'var(--pv-grad-ink)', color: '#fff', boxShadow: 'var(--pv-shadow-md)' }}
    >
      <span className="flex h-9 w-12 items-center justify-center rounded-md" style={{ background: 'rgba(255,255,255,0.2)' }}>
        <Wifi size={18} style={{ transform: 'rotate(90deg)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-sm tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.92)' }}>•••• {last4}</div>
        <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>Use anywhere · tap to pay</div>
      </div>
      <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
    </PressButton>
  )
}

function StatTile({
  Icon, tile, label, value, sub, onClick,
}: { Icon: typeof Users; tile: Pastel; label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="p-4">
      <IconBadge Icon={Icon} tile={tile} size={36} />
      <div className="pv-label mt-3">{label}</div>
      <div className="pv-amount mt-0.5 text-2xl">{value}</div>
      <div className="mt-0.5 truncate text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{sub}</div>
    </Card>
  )
}
