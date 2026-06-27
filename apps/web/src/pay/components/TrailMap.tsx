/**
 * MapCanvas + TrailMap + OverviewMap — full-bleed animated maps.
 * ───────────────────────────────────────────────────────────────────────────
 * MapCanvas measures its container, fits the given points, requests a static
 * backdrop at the container's aspect ratio (so object-cover never misaligns),
 * and exposes a `project(latlng)→{x,y}` to draw an SVG overlay in the SAME
 * coordinate space. TrailMap draws an animated, candy-crush-style journey;
 * OverviewMap drops a labelled pin per person. Real points only.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fitView, toPixel } from '../../lib/mapProjection'
import { staticBackdropUrl, type LatLng } from '../../lib/maps'

type Projector = { project: (p: LatLng) => { x: number; y: number }; W: number; H: number }

export type TrailStop = { lat: number; lng: number; at?: string; place?: string | null }

/* ───────────────────────────────────────────────────────────── MapCanvas */
function MapCanvas({ points, padding = 72, children }: { points: LatLng[]; padding?: number; children: (p: Projector) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden" style={{ background: 'var(--pv-surface-2)' }}>
      {size && size.w > 1 && size.h > 1 && (
        <MapInner W={size.w} H={size.h} points={points} padding={padding}>
          {children}
        </MapInner>
      )}
    </div>
  )
}

function MapInner({ W, H, points, padding, children }: { W: number; H: number; points: LatLng[]; padding: number; children: (p: Projector) => ReactNode }) {
  const { center, zoom } = fitView(points, W, H, padding)
  const cap = 640
  const ar = W / H
  const bw = W >= H ? cap : Math.round(cap * ar)
  const bh = W >= H ? Math.round(cap / ar) : cap
  const backdrop = staticBackdropUrl(center, zoom, { width: bw, height: bh, scale: 2 })
  const project = (p: LatLng) => toPixel(p, center, zoom, W, H)

  return (
    <>
      <img src={backdrop} alt="Map" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,12,15,0.12) 0%, transparent 22% 60%, rgba(11,12,15,0.18) 100%)' }} />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} fill="none">
        {children({ project, W, H })}
      </svg>
    </>
  )
}

/* ───────────────────────────────────────────────────────────── TrailMap */
export function TrailMap({ points, accent = '#0ea5e9' }: { points: TrailStop[]; accent?: string }) {
  const latlngs: LatLng[] = points.map((p) => ({ lat: p.lat, lng: p.lng }))
  return (
    <MapCanvas points={latlngs} padding={84}>
      {({ project }) => {
        const px = points.map((p) => project(p))
        const d = smoothPath(px)
        const last = px[px.length - 1]
        return (
          <>
            {px.length >= 2 && (
              <>
                <path d={d} className="pv-trail-line" stroke={accent} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" opacity={0.22} pathLength={1} />
                <path id="pv-trail-path" d={d} className="pv-trail-line" stroke={accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.3))' }} />
              </>
            )}

            {px.slice(0, -1).map((p, i) => (
              <g key={i} className="pv-trail-stop" style={{ animationDelay: `${0.4 + i * 0.13}s` }}>
                <circle cx={p.x} cy={p.y} r={i === 0 ? 9 : 6.5} fill="#fff" stroke={accent} strokeWidth={3} />
                {i === 0 && <circle cx={p.x} cy={p.y} r={3.5} fill={accent} />}
              </g>
            ))}

            {last && (
              <g>
                <circle cx={last.x} cy={last.y} r={12} fill={accent} className="pv-trail-pulse" opacity={0.5} />
                <circle cx={last.x} cy={last.y} r={10} fill={accent} stroke="#fff" strokeWidth={3.5} style={{ filter: 'drop-shadow(0 3px 7px rgba(0,0,0,0.35))' }} />
              </g>
            )}

            {px.length >= 2 && (
              <circle r={5.5} fill="#fff" stroke={accent} strokeWidth={2.5}>
                <animateMotion dur="3.6s" begin="1.7s" repeatCount="indefinite" rotate="auto" calcMode="linear">
                  <mpath href="#pv-trail-path" />
                </animateMotion>
              </circle>
            )}
          </>
        )
      }}
    </MapCanvas>
  )
}

/* ───────────────────────────────────────────────────────────── OverviewMap */
export type OverviewPin = { id: string; lat: number; lng: number; accent: string; label: string; onClick?: () => void }

export function OverviewMap({ pins }: { pins: OverviewPin[] }) {
  const latlngs: LatLng[] = pins.map((p) => ({ lat: p.lat, lng: p.lng }))
  return (
    <MapCanvas points={latlngs} padding={80}>
      {({ project }) =>
        pins.map((pin) => {
          const p = project(pin)
          return (
            <g key={pin.id} style={{ cursor: pin.onClick ? 'pointer' : 'default' }} onClick={pin.onClick}>
              <circle cx={p.x} cy={p.y} r={16} fill={pin.accent} className="pv-trail-pulse" opacity={0.4} />
              <circle cx={p.x} cy={p.y} r={15} fill={pin.accent} stroke="#fff" strokeWidth={3.5} style={{ filter: 'drop-shadow(0 3px 7px rgba(0,0,0,0.35))' }} />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={14} fontWeight={800}>
                {pin.label.slice(0, 1).toUpperCase()}
              </text>
            </g>
          )
        })
      }
    </MapCanvas>
  )
}

/** Catmull-Rom → cubic bezier for a smooth, playful route line. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}
