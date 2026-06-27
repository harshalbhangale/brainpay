/**
 * Google Maps helpers. The key is HTTP-referrer restricted (app.brainpal.com.au,
 * *.vercel.app, localhost) and limited to the Static Maps + Embed APIs, so it's
 * safe to ship in the client bundle.
 */
const KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || 'AIzaSyBYve0-aESs4eSl2_zRd1v0yRff9XvWc-U'
export const MAPS_KEY = KEY

export type LatLng = { lat: number; lng: number }

/** A static map image URL (one or more markers). */
export function staticMapUrl(
  markers: LatLng[],
  opts: { width?: number; height?: number; zoom?: number; scale?: 1 | 2 } = {},
): string {
  const { width = 640, height = 360, zoom, scale = 2 } = opts
  const params = new URLSearchParams()
  params.set('size', `${width}x${height}`)
  params.set('scale', String(scale))
  if (markers.length === 1 && zoom == null) params.set('zoom', '15')
  if (zoom != null) params.set('zoom', String(zoom))
  if (markers.length === 1) params.set('center', `${markers[0].lat},${markers[0].lng}`)
  for (const m of markers) params.append('markers', `color:0x12b76a|${m.lat},${m.lng}`)
  params.set('key', KEY)
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
}

/**
 * A plain static-map backdrop at an explicit center + zoom (no markers), so an
 * SVG overlay drawn with the matching Mercator projection lines up exactly.
 * `style=feature:poi|...` mutes clutter for a cleaner canvas.
 */
export function staticBackdropUrl(
  center: LatLng,
  zoom: number,
  opts: { width?: number; height?: number; scale?: 1 | 2 } = {},
): string {
  const { width = 640, height = 600, scale = 2 } = opts
  const params = new URLSearchParams()
  params.set('center', `${center.lat},${center.lng}`)
  params.set('zoom', String(Math.round(zoom)))
  params.set('size', `${width}x${height}`)
  params.set('scale', String(scale))
  params.set('maptype', 'roadmap')
  params.append('style', 'feature:poi|visibility:off')
  params.append('style', 'feature:transit|visibility:off')
  params.set('key', KEY)
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
}

/** An interactive embedded map (pan/zoom) centered on a point. */
export function embedMapUrl(center: LatLng, zoom = 15): string {
  return `https://www.google.com/maps/embed/v1/view?key=${KEY}&center=${center.lat},${center.lng}&zoom=${zoom}&maptype=roadmap`
}
