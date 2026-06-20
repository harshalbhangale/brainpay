import type { LucideIcon } from 'lucide-react'
import { MapPin } from 'lucide-react'

/**
 * BrainPal design system — clean, Greenlight-style primitives.
 * Compose screens from these so the whole app stays consistent:
 *  - Card        surface container with soft shadow
 *  - StatCard    icon + label + big value + sub (2-col grids)
 *  - ActionCircle round action button + label
 *  - Avatar      circular initial/photo
 *  - SectionTitle small caps heading + optional action
 *  - KidMapCard   per-kid location card for the parent overview
 */

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`shadow-soft block rounded-3xl bg-surface text-left ring-1 ring-border ${onClick ? 'press' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

export function StatCard({
  Icon,
  label,
  value,
  sub,
  subColor,
  onClick,
}: {
  Icon: LucideIcon
  label: string
  value: string
  sub?: string
  subColor?: string
  onClick?: () => void
}) {
  return (
    <Card onClick={onClick} className="p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft">
        <Icon size={18} className="text-accent" />
      </span>
      <div className="mt-3 text-sm font-semibold text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink">{value}</div>
      {sub && (
        <div className="mt-0.5 text-xs font-semibold" style={{ color: subColor ?? 'var(--color-muted)' }}>
          {sub}
        </div>
      )}
    </Card>
  )
}

export function ActionCircle({
  Icon,
  label,
  variant = 'plain',
  onClick,
  disabled,
}: {
  Icon: LucideIcon
  label: string
  variant?: 'filled' | 'plain'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} className="press flex w-[5.5rem] shrink-0 flex-col items-center gap-2 disabled:opacity-40">
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          variant === 'filled' ? 'text-white' : 'shadow-soft bg-surface text-accent ring-1 ring-border'
        }`}
        style={variant === 'filled' ? { background: 'var(--color-brand-deep)' } : undefined}
      >
        <Icon size={24} strokeWidth={2.4} />
      </span>
      <span className="text-center text-xs font-semibold leading-tight text-ink">{label}</span>
    </button>
  )
}

const AVATAR_COLORS = ['#12b76a', '#6aa3ff', '#f59e0b', '#ef6aa3', '#8b5cf6', '#0ea5e9']
function colorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function Avatar({ name, size = 44, src }: { name: string; size?: number; src?: string }) {
  const initial = (name.trim()[0] || '?').toUpperCase()
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span
      className="flex items-center justify-center rounded-full font-extrabold text-white"
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted">{children}</h3>
      {action}
    </div>
  )
}

/** Deterministic mock location per kid (until real GPS lands). */
function mockLatLng(seed: string): { lat: number; lng: number; place: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  // Spread around Sydney for the demo.
  const lat = -33.87 + ((h % 200) - 100) / 2000
  const lng = 151.21 + (((h >> 8) % 200) - 100) / 2000
  const places = ['Near school', 'At home', 'Westfield Mall', 'Bondi Beach', 'Local park', 'Library']
  return { lat, lng, place: places[h % places.length] }
}

export function KidMapCard({ name, accountId, onClick }: { name: string; accountId: string; onClick?: () => void }) {
  const { lat, lng, place } = mockLatLng(accountId)
  const z = 14
  const src = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${z}&size=600x320&markers=${lat},${lng},lightgreen`
  return (
    <Card onClick={onClick} className="overflow-hidden">
      <div className="relative h-32 w-full bg-surface2">
        <img
          src={src}
          alt={`${name} location`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
        {/* Fallback / overlay pin */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <MapPin size={26} className="text-accent drop-shadow" fill="currentColor" />
        </span>
        <span className="absolute left-3 top-3 rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-bold text-ink shadow-soft">
          {name}
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <MapPin size={15} className="text-accent" />
        <span className="text-sm font-semibold text-ink">{place}</span>
        <span className="ml-auto text-xs text-muted">just now</span>
      </div>
    </Card>
  )
}
