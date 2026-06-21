import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { MapPin, Maximize2, X, Users } from 'lucide-react'
import { staticMapUrl, embedMapUrl } from '../lib/maps'
import { loadGoogleMaps } from '../lib/mapsJs'
import { relativeTime } from '../lib/format'

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

export function KidMapCard({
  name,
  accountId,
  location,
}: {
  name: string
  accountId: string
  location?: { lat: number; lng: number; at?: string; place?: string | null } | null
  onClick?: () => void
}) {
  const hasReal = !!location && typeof location.lat === 'number' && typeof location.lng === 'number'
  const mock = mockLatLng(accountId)
  const lat = hasReal ? location!.lat : mock.lat
  const lng = hasReal ? location!.lng : mock.lng
  const place = hasReal ? location!.place || 'Live location' : mock.place
  const when = hasReal && location!.at ? relativeTime(location!.at) : 'sample'
  const [expanded, setExpanded] = useState(false)
  const thumb = staticMapUrl([{ lat, lng }], { width: 640, height: 280, zoom: 15 })

  return (
    <>
      <Card className="overflow-hidden">
        <button onClick={() => setExpanded(true)} className="press relative block h-32 w-full">
          <img src={thumb} alt={`${name} location`} className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute left-3 top-3 rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-bold text-ink shadow-soft">{name}</span>
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-canvas/90 text-ink shadow-soft">
            <Maximize2 size={15} />
          </span>
        </button>
        <div className="flex items-center gap-2 px-4 py-3">
          <MapPin size={15} className="text-accent" />
          <span className="text-sm font-semibold text-ink">{place}</span>
          <span className="ml-auto text-xs text-muted">{when}</span>
        </div>
      </Card>

      {expanded && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-canvas">
          <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-accent" />
              <span className="font-extrabold text-ink">{name}</span>
              <span className="text-sm text-muted">· {place}</span>
            </div>
            <button onClick={() => setExpanded(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-muted active:scale-95" aria-label="Close map">
              <X size={18} />
            </button>
          </div>
          <iframe title={`${name} map`} className="flex-1 border-0" src={embedMapUrl({ lat, lng }, 16)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      )}
    </>
  )
}

type KidPoint = { name: string; accountId: string; location?: { lat: number; lng: number; place?: string | null; at?: string } | null }

/** Parent overview card: all kids on one map (tap to explore interactively). */
export function FamilyMapCard({ kids }: { kids: KidPoint[] }) {
  const [open, setOpen] = useState(false)
  if (kids.length === 0) return null
  const pts = kids.map((k) => {
    const real = !!k.location && typeof k.location.lat === 'number'
    const m = mockLatLng(k.accountId)
    return { name: k.name, lat: real ? k.location!.lat : m.lat, lng: real ? k.location!.lng : m.lng, live: real }
  })
  const liveCount = pts.filter((p) => p.live).length
  const thumb = staticMapUrl(pts.map((p) => ({ lat: p.lat, lng: p.lng })), { width: 640, height: 280 })

  return (
    <>
      <Card className="overflow-hidden">
        <button onClick={() => setOpen(true)} className="press relative block h-36 w-full">
          <img src={thumb} alt="Family map" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-bold text-ink shadow-soft">
            <Users size={13} className="text-accent" /> Everyone
          </span>
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-canvas/90 text-ink shadow-soft">
            <Maximize2 size={15} />
          </span>
        </button>
        <div className="flex items-center gap-2 px-4 py-3">
          <Users size={15} className="text-accent" />
          <span className="text-sm font-semibold text-ink">
            {liveCount > 0 ? `${liveCount} live now` : `${pts.length} ${pts.length === 1 ? 'kid' : 'kids'}`}
          </span>
          <span className="ml-auto text-xs text-muted">tap to explore</span>
        </div>
      </Card>

      {open && <FamilyMap points={pts} onClose={() => setOpen(false)} />}
    </>
  )
}

function FamilyMap({ points, onClose }: { points: { name: string; lat: number; lng: number }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !ref.current) return
        const map = new google.maps.Map(ref.current, {
          center: { lat: points[0].lat, lng: points[0].lng },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        const bounds = new google.maps.LatLngBounds()
        points.forEach((p) => {
          new google.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            title: p.name,
            label: { text: p.name.charAt(0).toUpperCase(), color: '#ffffff', fontWeight: '700' },
          })
          bounds.extend({ lat: p.lat, lng: p.lng })
        })
        if (points.length > 1) map.fitBounds(bounds, 64)
        else map.setZoom(15)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [points])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <span className="flex items-center gap-2 font-extrabold text-ink"><Users size={18} className="text-accent" /> Where everyone is</span>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-muted active:scale-95" aria-label="Close map"><X size={18} /></button>
      </div>
      <div ref={ref} className="flex-1" />
    </div>
  )
}
