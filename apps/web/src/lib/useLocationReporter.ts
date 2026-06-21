import { useEffect } from 'react'
import { api } from './api'

/**
 * When the signed-in account is a kid, report the device location to the
 * backend (with permission) so parents can see it on their maps. Reports once
 * on mount and then every few minutes while the app is open.
 */
export function useLocationReporter(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return

    let stopped = false
    const report = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (stopped) return
          api('/me/location', {
            method: 'POST',
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          }).catch(() => undefined)
        },
        () => undefined, // permission denied / unavailable — silently skip
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
      )
    }

    report()
    const t = setInterval(report, 3 * 60_000) // every 3 minutes
    return () => {
      stopped = true
      clearInterval(t)
    }
  }, [enabled])
}
