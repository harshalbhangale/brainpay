/**
 * FamilyMap — immersive, full-bleed "where's everyone" + journey history.
 * ───────────────────────────────────────────────────────────────────────────
 * The map fills the whole screen (down to the tab bar). Filter chips float at
 * the top (All, or one person). A glass panel at the bottom shows either where
 * everyone is right now (All) or the selected person's animated journey plus a
 * timeline of WHEN they were WHERE ("9:04 AM · Near school"). Role-aware &
 * mutual: parent → kids, kid → parent(s). Real recorded points only.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Users, RefreshCw, MapPin, Navigation, Clock, Route } from 'lucide-react'
import { Avatar, Card } from '../components/primitives'
import { TrailMap, OverviewMap, type TrailStop, type OverviewPin } from '../components/TrailMap'
import { timeAgo } from '../data'
import { payApi } from '../api'
import { useAuthStore } from '../../stores/auth'
import { isKid as isKidMember } from '../../components/family/types'

const PARENT_ROLES = ['primary_parent', 'co_parent', 'guardian']
const ACCENTS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#ef4444']

type Loc = { lat: number; lng: number; at?: string; place?: string | null; trail?: TrailStop[] }
type Person = { id: string; name: string; avatar?: string; roleLabel: string; accent: string; location?: Loc | null }

export function FamilyMap() {
  const account = useAuthStore((s) => s.account)
  const token = useAuthStore((s) => s.token)
  const meIsKid = account?.accountType === 'kid'
  const meId = account?.id

  const famQ = useQuery({
    queryKey: ['pay', 'family'],
    queryFn: () => payApi.family(),
    enabled: !!token,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const [filter, setFilter] = useState<string>('all')

  const members = famQ.data?.members ?? []
  const people: Person[] = members
    .filter((m) => m.accountId !== meId)
    .filter((m) => (meIsKid ? PARENT_ROLES.includes(m.role) : isKidMember(m)))
    .map((m, i) => ({
      id: m.accountId,
      name: m.persona?.name?.trim() || (isKidMember(m) ? 'Kid' : 'Parent'),
      avatar: typeof (m.persona as { avatar?: unknown })?.avatar === 'string' ? ((m.persona as { avatar?: string }).avatar as string) : undefined,
      roleLabel: PARENT_ROLES.includes(m.role) ? 'Parent' : 'Kid',
      accent: ACCENTS[i % ACCENTS.length],
      location: (m.lastLocation ?? null) as Loc | null,
    }))

  // Loading / empty take the whole area (no map).
  if (famQ.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
        <Loader2 size={16} className="animate-spin" /> Finding your {meIsKid ? 'family' : 'kids'}…
      </div>
    )
  }
  if (people.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <Card className="w-full p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--pv-sky)', color: 'var(--pv-sky-ink)' }}>
            <Users size={24} />
          </span>
          <div className="pv-h2 mt-4">{meIsKid ? 'No parent linked yet' : 'No kids yet'}</div>
          <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>
            {meIsKid ? 'Once a parent adds you to their family, you can see them here.' : 'Add a child from the Family tab to see their journeys.'}
          </p>
        </Card>
      </div>
    )
  }

  const selected = filter === 'all' ? null : people.find((p) => p.id === filter) ?? null
  const located = people.filter((p) => p.location && typeof p.location.lat === 'number')
  const pins: OverviewPin[] = located.map((p) => ({ id: p.id, lat: p.location!.lat, lng: p.location!.lng, accent: p.accent, label: p.name, onClick: () => setFilter(p.id) }))

  const selTrail: TrailStop[] = selected
    ? (selected.location?.trail && selected.location.trail.length > 0
        ? selected.location.trail
        : selected.location && typeof selected.location.lat === 'number'
          ? [{ lat: selected.location.lat, lng: selected.location.lng, at: selected.location.at, place: selected.location.place }]
          : [])
    : []

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* MAP LAYER (full-bleed) */}
      <div className="absolute inset-0">
        {selected ? (
          selTrail.length > 0 ? <TrailMap points={selTrail} accent={selected.accent} /> : <MapPlaceholder text={`${selected.name} hasn't shared a location yet.`} />
        ) : pins.length > 0 ? (
          <OverviewMap pins={pins} />
        ) : (
          <MapPlaceholder text="No locations shared yet. They appear once family members open the app with location on." />
        )}
      </div>

      {/* TOP: floating filter chips + refresh */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))', background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0))' }}>
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="pv-no-scrollbar flex flex-1 gap-2 overflow-x-auto py-1">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} accent="var(--pv-primary)">
              <Users size={15} strokeWidth={2.6} /> All
            </FilterChip>
            {people.map((p) => (
              <FilterChip key={p.id} active={filter === p.id} onClick={() => setFilter(p.id)} accent={p.accent}>
                <Avatar name={p.name} src={p.avatar} size={22} /> {p.name.split(' ')[0]}
              </FilterChip>
            ))}
          </div>
          <button onClick={() => famQ.refetch()} aria-label="Refresh" className="pv-press flex h-10 w-10 flex-none items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.92)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink-2)' }}>
            {famQ.isFetching ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </div>

      {/* BOTTOM: glass info panel */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
        <div
          className="pv-rise pv-no-scrollbar overflow-y-auto rounded-[var(--pv-r-2xl)] p-4"
          style={{ maxHeight: '46%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)', boxShadow: 'var(--pv-shadow-lg)', border: '1px solid rgba(255,255,255,0.6)' }}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
          {selected ? <JourneyPanel person={selected} trail={selTrail} /> : <LivePanel people={people} located={located.length} onPick={setFilter} />}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── chips */
function FilterChip({ active, onClick, accent, children }: { active: boolean; onClick: () => void; accent: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="pv-press flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3.5 text-sm font-bold"
      style={active ? { background: accent, color: '#fff', boxShadow: 'var(--pv-shadow-sm)' } : { background: 'rgba(255,255,255,0.92)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-xs)' }}
    >
      {children}
    </button>
  )
}

/* ───────────────────────────────────────── All: who's where right now */
function LivePanel({ people, located, onPick }: { people: Person[]; located: number; onPick: (id: string) => void }) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <LiveDot />
        <h3 className="pv-title">Live now</h3>
        <span className="ml-auto text-xs font-bold" style={{ color: 'var(--pv-ink-3)' }}>{located} of {people.length} sharing</span>
      </div>
      <div className="space-y-1.5">
        {people.map((p) => {
          const has = !!p.location && typeof p.location.lat === 'number'
          return (
            <button key={p.id} onClick={() => onPick(p.id)} className="pv-press flex w-full items-center gap-3 rounded-2xl p-2 text-left">
              <span className="rounded-full" style={{ boxShadow: `0 0 0 2.5px ${p.accent}` }}><Avatar name={p.name} src={p.avatar} size={42} /></span>
              <div className="min-w-0 flex-1">
                <div className="pv-title truncate text-sm">{p.name} <span className="text-[10px] font-bold" style={{ color: 'var(--pv-ink-3)' }}>· {p.roleLabel}</span></div>
                <div className="flex items-center gap-1 truncate text-xs font-semibold" style={{ color: has ? 'var(--pv-ink-2)' : 'var(--pv-ink-3)' }}>
                  <MapPin size={11} style={{ color: has ? p.accent : 'var(--pv-ink-3)' }} />
                  {has ? <>{p.location!.place || 'Location shared'}{p.location!.at && ` · ${timeAgo(p.location!.at)}`}</> : 'Not sharing yet'}
                </div>
              </div>
              <Route size={16} style={{ color: has ? p.accent : 'var(--pv-ink-3)' }} />
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ───────────────────────────────────────── Person: journey + timeline */
function JourneyPanel({ person, trail }: { person: Person; trail: TrailStop[] }) {
  const stats = computeStats(trail)
  // Timeline newest-first.
  const stops = [...trail].reverse()

  return (
    <>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="rounded-full" style={{ boxShadow: `0 0 0 2.5px ${person.accent}` }}><Avatar name={person.name} src={person.avatar} size={38} /></span>
        <div className="min-w-0 flex-1">
          <div className="pv-title truncate">{person.name}'s journey</div>
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--pv-ink-2)' }}>
            <MapPin size={11} style={{ color: person.accent }} />
            {person.location?.place || (trail.length ? 'Location shared' : 'No location yet')}
            {person.location?.at && <span style={{ color: 'var(--pv-ink-3)' }}> · {timeAgo(person.location.at)}</span>}
          </div>
        </div>
        <LiveDot />
      </div>

      {trail.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>
          <Navigation size={16} /> {person.name} hasn't shared a location yet.
        </div>
      ) : trail.length < 2 ? (
        <div className="flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>
          <Clock size={16} /> No journey recorded yet — stops appear here as {person.name.split(' ')[0]} moves.
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Stops" value={String(stats.stops)} accent={person.accent} />
            <Stat label="Travelled" value={stats.distance} accent={person.accent} />
            <Stat label="Over" value={stats.span} accent={person.accent} />
          </div>
          <Timeline stops={stops} accent={person.accent} />
        </>
      )}
    </>
  )
}

function Timeline({ stops, accent }: { stops: TrailStop[]; accent: string }) {
  let lastDay = ''
  return (
    <div className="relative">
      {stops.map((s, i) => {
        const day = dayLabel(s.at)
        const showDay = day !== lastDay
        lastDay = day
        const isNow = i === 0
        return (
          <div key={i}>
            {showDay && <div className="pv-label mb-1 mt-1">{day}</div>}
            <div className="relative flex gap-3 pb-3">
              {/* connector */}
              {i < stops.length - 1 && <span className="absolute left-[6px] top-4 h-full w-0.5" style={{ background: 'var(--pv-line)' }} />}
              <span className="relative z-[1] mt-1 h-3.5 w-3.5 flex-none rounded-full" style={{ background: isNow ? accent : 'var(--pv-surface)', border: `2.5px solid ${accent}` }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="pv-title text-sm">{timeLabel(s.at)}</span>
                  {isNow && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase" style={{ background: accent, color: '#fff' }}>Now</span>}
                </div>
                <div className="truncate text-xs font-semibold" style={{ color: 'var(--pv-ink-2)' }}>{s.place || 'On the move'}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl p-2.5 text-center" style={{ background: 'var(--pv-surface-2)' }}>
      <div className="pv-amount text-base" style={{ color: accent }}>{value}</div>
      <div className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--pv-ink-3)' }}>{label}</div>
    </div>
  )
}

function MapPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-10 text-center" style={{ background: 'var(--pv-surface-2)' }}>
      <MapPin size={28} style={{ color: 'var(--pv-ink-3)' }} />
      <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{text}</span>
    </div>
  )
}

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 flex-none">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--pv-pos)' }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: 'var(--pv-pos)' }} />
    </span>
  )
}

/* ───────────────────────────────────────────────────────────── helpers */
function timeLabel(at?: string): string {
  if (!at) return '—'
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(at?: string): string {
  if (!at) return ''
  const d = new Date(at)
  const today = new Date().toDateString()
  const yest = new Date(Date.now() - 864e5).toDateString()
  if (d.toDateString() === today) return 'Today'
  if (d.toDateString() === yest) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function computeStats(trail: TrailStop[]): { stops: number; distance: string; span: string } {
  if (trail.length < 2) return { stops: trail.length, distance: '—', span: '—' }
  let meters = 0
  for (let i = 1; i < trail.length; i++) meters += haversine(trail[i - 1], trail[i])
  const distance = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
  const first = trail[0].at ? Date.parse(trail[0].at) : NaN
  const lastAt = trail[trail.length - 1].at ? Date.parse(trail[trail.length - 1].at!) : NaN
  let span = '—'
  if (!Number.isNaN(first) && !Number.isNaN(lastAt) && lastAt > first) {
    const mins = Math.round((lastAt - first) / 60000)
    span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  }
  return { stops: trail.length, distance, span }
}

function haversine(a: TrailStop, b: TrailStop): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
