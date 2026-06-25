/**
 * Dashboard — MoneyPal home.
 * ───────────────────────────────────────────────────────────────────────────
 * Real data only: greeting from the signed-in persona, live wallet balance +
 * trend, the family's kids (tap → Family), and the real recent ledger. Quick
 * actions all do something real — add money (top-up sheet), jump to Family /
 * Activity, or hand off to the AI council. No mock contacts / insights / banners.
 */
import {
  Plus,
  Sparkles,
  Bell,
  Users,
  Receipt,
  TrendingUp,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react'
import {
  ActionTile,
  Avatar,
  Card,
  IconButton,
  ListRow,
  SectionHeader,
  Sparkline,
} from '../components/primitives'
import { TopBar, type TabKey } from '../components/shell'
import { fmt, signed, timeAgo } from '../data'
import { useAuthStore } from '../../stores/auth'
import { useWallet, useFamilyKids } from '../useMoneyPal'
import type { PalKey } from '../pals/config'

export function Dashboard({
  go,
  goPal,
  onTopUp,
}: {
  go: (t: TabKey) => void
  goPal?: (k: PalKey) => void
  onTopUp: () => void
}) {
  const account = useAuthStore((s) => s.account)
  const firstName = ((account?.persona?.name as string) || 'there').split(' ')[0]
  const wallet = useWallet()
  const { kids } = useFamilyKids()
  const recent = wallet.txns.slice(0, 4)

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        leading={
          <>
            <Avatar name={firstName} tile="mint" size={42} />
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                Welcome back
              </div>
              <div className="pv-title leading-tight">{firstName}</div>
            </div>
          </>
        }
        trailing={<IconButton Icon={Bell} ariaLabel="Notifications" />}
      />

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
        {/* Hero headline */}
        <h1 className="pv-display pv-rise mt-3" style={{ ['--i' as string]: 0 }}>
          Hi {firstName},
          <br />
          <span style={{ color: 'var(--pv-ink-3)' }}>here's your money.</span>
        </h1>

        {/* Balance card */}
        <Card className="pv-rise mt-6 overflow-hidden p-5" style={{ ['--i' as string]: 1, background: 'var(--pv-grad-ink)' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="pv-label" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Total balance
              </div>
              <div className="pv-amount mt-1.5 text-[2.6rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>
                {fmt(wallet.balance)}
              </div>
            </div>
            {wallet.changePct !== 0 && (
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.14)', color: '#7ef0b0' }}
              >
                <TrendingUp size={13} strokeWidth={2.6} />
                {wallet.changePct}%
              </span>
            )}
          </div>

          <div className="mt-4" style={{ color: '#7ef0b0' }}>
            <Sparkline data={wallet.trend} height={56} />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {fmt(wallet.available)} available
            </div>
            <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {wallet.live ? 'Live balance' : 'Last 14 days'}
            </span>
          </div>
        </Card>

        {/* Quick actions — all real */}
        <div className="pv-rise mt-5 grid grid-cols-2 gap-3.5" style={{ ['--i' as string]: 2 }}>
          <ActionTile Icon={Plus} label="Add money" tile="mint" onClick={onTopUp} />
          <ActionTile Icon={Users} label="Family" tile="sky" onClick={() => go('family')} />
          <ActionTile Icon={Receipt} label="Activity" tile="butter" onClick={() => go('activity')} />
          <ActionTile Icon={Sparkles} label="Ask AI" tile="lilac" onClick={() => goPal?.('ai')} />
        </div>

        {/* The kids (tap → Family) */}
        {kids.length > 0 && (
          <div className="pv-rise mt-7" style={{ ['--i' as string]: 3 }}>
            <SectionHeader
              title="Your kids"
              action={
                <button className="pv-press text-sm font-bold" style={{ color: 'var(--pv-accent)' }} onClick={() => go('family')}>
                  Manage
                </button>
              }
            />
            <div className="pv-no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-1">
              {kids.map((k) => (
                <button key={k.id} onClick={() => go('family')} className="pv-press flex w-16 shrink-0 flex-col items-center gap-2">
                  <Avatar initials={k.initials} tile={k.tile} size={56} src={k.avatar} />
                  <span className="truncate text-xs font-semibold" style={{ color: 'var(--pv-ink)' }}>
                    {k.name}
                  </span>
                  <span className="pv-amount text-[0.6875rem]" style={{ color: 'var(--pv-ink-3)' }}>
                    {fmt(k.balance, { cents: false })}
                  </span>
                </button>
              ))}
              <button onClick={onTopUp} className="pv-press flex w-16 shrink-0 flex-col items-center gap-2" aria-label="Add money">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed"
                  style={{ borderColor: 'var(--pv-line-strong)', color: 'var(--pv-ink-3)' }}
                >
                  <Plus size={22} strokeWidth={2.4} />
                </span>
                <span className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                  Top up
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="pv-rise mt-7" style={{ ['--i' as string]: 4 }}>
          <SectionHeader
            title="Activity"
            action={
              <button
                className="pv-press flex items-center gap-0.5 text-sm font-bold"
                style={{ color: 'var(--pv-accent)' }}
                onClick={() => go('activity')}
              >
                See all <ChevronRight size={16} />
              </button>
            }
          />
          <Card className="px-4 py-1.5">
            {recent.length === 0 && (
              <div className="py-8 text-center text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                No activity yet — add money or assign a chore to get started.
              </div>
            )}
            {recent.map((t, i) => (
              <div key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--pv-line)' }}>
                <ListRow
                  leading={<Avatar initials={t.initials} tile={t.tile} size={44} />}
                  title={t.name}
                  subtitle={`${t.detail} · ${timeAgo(t.when)}`}
                  value={signed(t.amount, t.dir)}
                  valueColor={t.dir === 'in' ? 'var(--pv-pos)' : 'var(--pv-ink)'}
                  sub={t.status === 'pending' ? 'pending' : undefined}
                  onClick={() => go('activity')}
                />
              </div>
            ))}
          </Card>
        </div>

        {/* Give-allowance shortcut */}
        <Card
          className="pv-rise mt-7 flex items-center gap-4 p-5"
          style={{ ['--i' as string]: 5, background: 'var(--pv-grad-accent)' }}
          onClick={onTopUp}
        >
          <div className="flex-1">
            <div className="pv-h2" style={{ color: 'var(--pv-on-accent)' }}>
              Top up a wallet
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--pv-on-accent)', opacity: 0.8 }}>
              Move money to your kids in a tap.
            </div>
          </div>
          <ArrowUpRight size={40} strokeWidth={2} style={{ color: 'var(--pv-on-accent)', opacity: 0.85 }} />
        </Card>
      </div>
    </div>
  )
}
