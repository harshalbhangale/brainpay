/**
 * InsightsSheet — "where your money goes", derived entirely from the real
 * ledger (useWallet). No fake numbers: money in / out / net, a spend-by-category
 * donut, and top merchants are all computed from the loaded transactions.
 * Every state is designed (loading skeleton, empty, populated).
 */
import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, PieChart, TrendingUp, Sparkles } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { Card } from '../components/primitives'
import { fmt, type Txn } from '../data'
import { PASTELS, type Pastel } from '../tokens'
import { useWallet } from '../useMoneyPal'

/** Ledger kinds → friendly category labels; mock data already uses nice labels. */
function catLabel(category: string): string {
  const map: Record<string, string> = {
    cart_checkout: 'Spending',
    chore_payout: 'Chore rewards',
    topup: 'Money added',
    topup_stripe: 'Money added',
    adjustment: 'Adjustments',
  }
  if (map[category]) return map[category]
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type Slice = { key: string; label: string; total: number; tile: Pastel; pct: number }

export function InsightsSheet({ onClose }: { onClose: () => void }) {
  const wallet = useWallet()
  const txns = wallet.txns

  const { inflow, outflow, net, slices, merchants } = useMemo(() => {
    const inflow = txns.filter((t) => t.dir === 'in').reduce((s, t) => s + t.amount, 0)
    const outflow = txns.filter((t) => t.dir === 'out').reduce((s, t) => s + t.amount, 0)

    // Spend grouped by category (out only), biggest first, top 6 + "Other".
    const byCat = new Map<string, { total: number; tile: Pastel }>()
    for (const t of txns) {
      if (t.dir !== 'out') continue
      const cur = byCat.get(t.category) ?? { total: 0, tile: t.tile }
      cur.total += t.amount
      byCat.set(t.category, cur)
    }
    const ranked = [...byCat.entries()].sort((a, b) => b[1].total - a[1].total)
    const top = ranked.slice(0, 6)
    const restTotal = ranked.slice(6).reduce((s, [, v]) => s + v.total, 0)
    const slices: Slice[] = top.map(([key, v]) => ({
      key,
      label: catLabel(key),
      total: v.total,
      tile: v.tile,
      pct: outflow ? (v.total / outflow) * 100 : 0,
    }))
    if (restTotal > 0) slices.push({ key: '__other', label: 'Other', total: restTotal, tile: 'lilac', pct: (restTotal / outflow) * 100 })

    // Top merchants / items by spend.
    const byName = new Map<string, { total: number; tile: Pastel; count: number }>()
    for (const t of txns) {
      if (t.dir !== 'out') continue
      const cur = byName.get(t.name) ?? { total: 0, tile: t.tile, count: 0 }
      cur.total += t.amount
      cur.count += 1
      byName.set(t.name, cur)
    }
    const merchants = [...byName.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 4)

    return { inflow, outflow, net: inflow - outflow, slices, merchants }
  }, [txns])

  // Build the conic-gradient donut from the slices.
  const donut = useMemo(() => {
    let acc = 0
    const stops = slices.map((s) => {
      const start = acc
      acc += s.pct
      return `${PASTELS[s.tile].ink} ${start.toFixed(2)}% ${acc.toFixed(2)}%`
    })
    return stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(var(--pv-surface-3) 0% 100%)'
  }, [slices])

  const hasSpend = outflow > 0

  return (
    <BottomSheet onClose={onClose} title="Insights" subtitle="Based on your recent activity">
      {wallet.loading ? (
        <div className="space-y-3 pb-4">
          <div className="h-24 animate-pulse rounded-[var(--pv-r-lg)]" style={{ background: 'var(--pv-surface-2)' }} />
          <div className="h-48 animate-pulse rounded-[var(--pv-r-lg)]" style={{ background: 'var(--pv-surface-2)' }} />
        </div>
      ) : (
        <>
          {/* In / Out / Net */}
          <div className="grid grid-cols-2 gap-3">
            <Card flat className="p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-pos-soft)', color: 'var(--pv-pos)' }}>
                <ArrowDownLeft size={18} strokeWidth={2.6} />
              </span>
              <div className="pv-label mt-3">Money in</div>
              <div className="pv-amount mt-0.5 text-xl" style={{ color: 'var(--pv-pos)' }}>{fmt(inflow)}</div>
            </Card>
            <Card flat className="p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
                <ArrowUpRight size={18} strokeWidth={2.6} />
              </span>
              <div className="pv-label mt-3">Money out</div>
              <div className="pv-amount mt-0.5 text-xl">{fmt(outflow)}</div>
            </Card>
          </div>

          {/* Net flow banner */}
          <Card flat className="mt-3 flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: net >= 0 ? 'var(--pv-pos-soft)' : 'var(--pv-neg-soft)', color: net >= 0 ? 'var(--pv-pos)' : 'var(--pv-neg)' }}>
              <TrendingUp size={20} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="pv-title">{net >= 0 ? 'You saved more than you spent' : 'You spent more than came in'}</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Net {fmt(net, { sign: true })} across {txns.length} transaction{txns.length === 1 ? '' : 's'}</div>
            </div>
          </Card>

          {/* Spend by category */}
          <p className="pv-label mt-6">Where your money goes</p>
          {hasSpend ? (
            <Card flat className="mt-2 p-4">
              <div className="flex items-center gap-5">
                {/* Donut */}
                <div className="relative h-28 w-28 flex-none rounded-full" style={{ background: donut }}>
                  <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full text-center" style={{ background: 'var(--pv-surface)' }}>
                    <span className="pv-label leading-none">Spent</span>
                    <span className="pv-amount mt-0.5 text-base leading-none">{fmt(outflow, { cents: false })}</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="min-w-0 flex-1 space-y-2">
                  {slices.map((s) => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: PASTELS[s.tile].ink }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>{s.label}</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--pv-ink-2)' }}>{fmt(s.total)}</span>
                      <span className="w-9 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--pv-ink-3)' }}>{Math.round(s.pct)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card flat className="mt-2 flex flex-col items-center gap-2 p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>
                <PieChart size={22} />
              </span>
              <div className="pv-title">No spending yet</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Once money moves out, you'll see a live breakdown here.</p>
            </Card>
          )}

          {/* Top merchants */}
          {merchants.length > 0 && (
            <>
              <p className="pv-label mt-6">Top spends</p>
              <Card flat className="mt-2 overflow-hidden">
                {merchants.map(([name, v], i) => (
                  <div key={name} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--pv-line)' }}>
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-black" style={{ background: PASTELS[v.tile].bg, color: PASTELS[v.tile].ink }}>
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span>
                    {v.count > 1 && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>{v.count}×</span>}
                    <span className="text-sm font-bold tabular-nums">{fmt(v.total)}</span>
                  </div>
                ))}
              </Card>
            </>
          )}

          <div className="mt-5 flex items-center gap-2 rounded-2xl p-3.5" style={{ background: 'var(--pv-accent-soft, var(--pv-surface-2))' }}>
            <Sparkles size={16} style={{ color: 'var(--pv-accent)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--pv-ink-2)' }}>Ask MoneyPal anything about these numbers in chat — it sees the same ledger.</p>
          </div>
          <div className="h-2" />
        </>
      )}
    </BottomSheet>
  )
}

/** Re-export a slim type in case other views want to reuse it later. */
export type { Txn }
