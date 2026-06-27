/**
 * Web-Mercator projection helpers that match Google Static Maps tiling, so an
 * SVG overlay drawn in a W×H viewBox lines up pixel-for-pixel with a static
 * backdrop requested at the same size/center/zoom. Used by the animated trail.
 */
import type { LatLng } from './maps'

const TILE = 256
const MAX_ZOOM = 18
const MIN_ZOOM = 2

/** Project a lat/lng to "world" pixel coords at zoom 0 (0..256). */
function world(lat: number, lng: number): { x: number; y: number } {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  return {
    x: TILE * (0.5 + lng / 360),
    y: TILE * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  }
}

/** Choose a center + integer zoom that fits all points within W×H (with padding). */
export function fitView(
  points: LatLng[],
  width: number,
  height: number,
  padding = 56,
): { center: LatLng; zoom: number } {
  if (points.length === 0) return { center: { lat: 0, lng: 0 }, zoom: 12 }

  let north = -90, south = 90, east = -180, west = 180
  for (const p of points) {
    north = Math.max(north, p.lat); south = Math.min(south, p.lat)
    east = Math.max(east, p.lng); west = Math.min(west, p.lng)
  }
  const center = { lat: (north + south) / 2, lng: (east + west) / 2 }

  if (points.length === 1) return { center, zoom: 16 }

  const ny = world(north, 0).y, sy = world(south, 0).y
  const latFraction = Math.abs(sy - ny) / TILE
  let lngDiff = east - west
  if (lngDiff < 0) lngDiff += 360
  const lngFraction = lngDiff / 360

  const usableW = Math.max(1, width - padding * 2)
  const usableH = Math.max(1, height - padding * 2)
  const latZoom = latFraction > 0 ? Math.log2(usableH / TILE / latFraction) : MAX_ZOOM
  const lngZoom = lngFraction > 0 ? Math.log2(usableW / TILE / lngFraction) : MAX_ZOOM
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(Math.min(latZoom, lngZoom))))
  return { center, zoom }
}

/** Project a point to pixel coords within a W×H box centered on `center` at `zoom`. */
export function toPixel(
  point: LatLng,
  center: LatLng,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const scale = 2 ** zoom
  const c = world(center.lat, center.lng)
  const p = world(point.lat, point.lng)
  return {
    x: width / 2 + (p.x - c.x) * scale,
    y: height / 2 + (p.y - c.y) * scale,
  }
}
