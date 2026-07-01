/**
 * TrailMap + OverviewMap — fully interactive maps (drag, pinch/scroll zoom).
 * ───────────────────────────────────────────────────────────────────────────
 * Built on Leaflet with free, keyless CARTO/OSM raster tiles, so there's no
 * Google key / referrer dependency and the user can actually pan & zoom
 * ("dive through") the map. TrailMap draws a journey polyline + stop markers;
 * OverviewMap drops a labelled pin per person. Real points only.
 *
 * We use SVG circle/div markers (not Leaflet's default image icons) so there's
 * no bundler icon-path breakage.
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type TrailStop = { lat: number; lng: number; at?: string; place?: string | null }
export type OverviewPin = { id: string; lat: number; lng: number; accent: string; label: string; approx?: boolean; onClick?: () => void }

// Clean, light basemap — free for reasonable use, attribution included.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, {
    zoomControl: false, // avoid overlapping the floating filter chips
    attributionControl: true,
    // Gestures for "diving through": drag, scroll/pinch zoom, double-tap zoom.
    scrollWheelZoom: true,
    touchZoom: true,
    dragging: true,
  })
  L.tileLayer(TILE_URL, { maxZoom: 20, subdomains: 'abcd', attribution: TILE_ATTR }).addTo(map)
  return map
}

/** Fit the map to the given points (or center on one). */
function fit(map: L.Map, latlngs: L.LatLngExpression[]) {
  if (latlngs.length === 0) {
    map.setView([0, 0], 2)
  } else if (latlngs.length === 1) {
    map.setView(latlngs[0], 15)
  } else {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [56, 56], maxZoom: 16 })
  }
  // The container often finishes sizing after mount; recompute so tiles fill it.
  setTimeout(() => map.invalidateSize(), 0)
  setTimeout(() => map.invalidateSize(), 250)
}

function timeLabel(at?: string): string {
  if (!at) return ''
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/* ───────────────────────────────────────────────────────────── TrailMap */
export function TrailMap({ points, accent = '#0ea5e9' }: { points: TrailStop[]; accent?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const sig = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const map = createMap(el)
    const latlngs = points.map((p) => [p.lat, p.lng] as [number, number])

    if (latlngs.length >= 2) {
      // soft halo + crisp line
      L.polyline(latlngs, { color: accent, weight: 12, opacity: 0.2, lineJoin: 'round', lineCap: 'round' }).addTo(map)
      L.polyline(latlngs, { color: accent, weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map)
    }

    points.forEach((p, i) => {
      const isLast = i === points.length - 1
      const m = L.circleMarker([p.lat, p.lng], {
        radius: isLast ? 9 : 6.5,
        color: '#fff',
        weight: 3,
        fillColor: accent,
        fillOpacity: 1,
      }).addTo(map)
      const when = timeLabel(p.at)
      m.bindPopup(`<b>${p.place || 'On the move'}</b>${when ? `<br/>${when}` : ''}`)
    })

    fit(map, latlngs)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => { ro.disconnect(); map.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, accent])

  return <div ref={ref} className="h-full w-full" style={{ minHeight: 240, background: 'var(--pv-surface-2)' }} />
}

/* ───────────────────────────────────────────────────────────── OverviewMap */
export function OverviewMap({ pins }: { pins: OverviewPin[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const sig = pins.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  const pinsRef = useRef(pins)
  pinsRef.current = pins

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const map = createMap(el)
    const latlngs: L.LatLngExpression[] = pinsRef.current.map((p) => [p.lat, p.lng])

    pinsRef.current.forEach((pin) => {
      const border = pin.approx ? '3px dashed rgba(255,255,255,0.9)' : '3px solid #fff'
      const opacity = pin.approx ? 0.72 : 1
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:9999px;background:${pin.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:${border};box-shadow:0 3px 8px rgba(0,0,0,0.35);opacity:${opacity}">${pin.label.slice(0, 1).toUpperCase()}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map)
      marker.bindTooltip(pin.approx ? `${pin.label} · location off` : pin.label, { direction: 'top', offset: [0, -16] })
      if (pin.onClick) marker.on('click', pin.onClick)
    })

    fit(map, latlngs)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => { ro.disconnect(); map.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return <div ref={ref} className="h-full w-full" style={{ minHeight: 240, background: 'var(--pv-surface-2)' }} />
}
