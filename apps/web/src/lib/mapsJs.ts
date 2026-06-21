import { MAPS_KEY } from './maps'

/* eslint-disable @typescript-eslint/no-explicit-any */
let promise: Promise<any> | null = null

/** Load the Google Maps JS SDK once and resolve with the `google` namespace. */
export function loadGoogleMaps(): Promise<any> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    const w = window as any
    if (w.google?.maps) return resolve(w.google)
    const cbName = '__brainpalGmaps'
    w[cbName] = () => resolve(w.google)
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=${cbName}&loading=async`
    s.async = true
    s.onerror = reject
    document.head.appendChild(s)
  })
  return promise
}
