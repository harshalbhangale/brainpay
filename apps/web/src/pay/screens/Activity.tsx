import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, SlidersHorizontal } from 'lucide-react'
import { Avatar, Card, ListRow, Pill, SearchBar } from '../components/primitives'
import { TopBar } from '../components/shell'
import { fmt, signed, timeAgo, type Txn } from '../data'
import { useWallet } from '../useMoneyPal'

type Filter = 'all' | 'in' | 'out' | 'pending'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Money in' },
  { key: 'out', label: 'Money out' },
  { key: 'pending', label: 'Pending' },
]

export function Activity() {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const wallet = useWallet()
  const all = wallet.txns

  const list = useMemo(() => {
    return all.filter((t) => {
      if (filter === 'in' && t.dir !== 'in') return false
      if (filter === 'out' && t.dir !== 'out') return false
      if (filter === 'pending' && t.status !== 'pending') return false
      if (q && !`${t.name} ${t.detail} ${t.category}`.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [all, filter, q])

  const groups = useMemo(() => groupByDay(list), [list])
  const inflow = all.filter((t) => t.dir === 'in').reduce((s, t) => s + t.amount, 0)
  const outflow = all.filter((t) => t.dir === 'out').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="flex flex-1 flex-col">
      <TopBar leading={<h1 className="pv-h1">Activity</h1>} trailing={null} />

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
        {/* In/out summary */}
        <div className="pv-rise mt-2 grid grid-cols-2 gap-3.5">
          <Card className="p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-pos-soft)', color: 'var(--pv-pos)' }}>
              <ArrowDownLeft size={18} strokeWidth={2.6} />
            </span>
            <div className="pv-label mt-3">In · June</div>
            <div className="pv-amount mt-0.5 text-xl" style={{ color: 'var(--pv-pos)' }}>
              {fmt(inflow)}
            </div>
          </Card>
          <Card className="p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
              <ArrowUpRight size={18} strokeWidth={2.6} />
            </span>
            <div className="pv-label mt-3">Out · June</div>
            <div className="pv-amount mt-0.5 text-xl">{fmt(outflow)}</div>
          </Card>
        </div>

        {/* Search */}
        <div className="pv-rise mt-4">
          <SearchBar value={q} onChange={setQ} placeholder="Search transactions" />
        </div>

        {/* Filter pills */}
        <div className="pv-no-scrollbar -mx-5 mt-4 flex items-center gap-2 overflow-x-auto px-5">
          <Pill leadingIcon={SlidersHorizontal}>Filters</Pill>
          {FILTERS.map((f) => (
            <Pill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Pill>
          ))}
        </div>

        {/* Grouped list */}
        {groups.length === 0 && (
          <div className="mt-16 text-center text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            No transactions match.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mt-6">
            <div className="pv-label mb-2 px-1">{g.label}</div>
            <Card className="px-4 py-1.5">
              {g.items.map((t, i) => (
                <div key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--pv-line)' }}>
                  <TxnRow t={t} />
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}

function TxnRow({ t }: { t: Txn }) {
  return (
    <ListRow
      leading={<Avatar initials={t.initials} tile={t.tile} size={44} />}
      title={t.name}
      subtitle={`${t.detail} · ${timeAgo(t.when)}`}
      value={signed(t.amount, t.dir)}
      valueColor={t.dir === 'in' ? 'var(--pv-pos)' : 'var(--pv-ink)'}
      sub={t.status === 'pending' ? 'pending' : undefined}
    />
  )
}

function groupByDay(items: Txn[]): { label: string; items: Txn[] }[] {
  const map = new Map<string, Txn[]>()
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 864e5).toDateString()
  for (const t of items) {
    const d = new Date(t.when).toDateString()
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(t.when).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(t)
  }
  return Array.from(map, ([label, items]) => ({ label, items }))
}
