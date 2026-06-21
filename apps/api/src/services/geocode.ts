import { loadEnv } from '../env'
import { logger } from '../logger'

const env = loadEnv()

/**
 * Reverse-geocode a lat/lng to a short, human place name (suburb/locality).
 * Returns null on any failure — callers should treat the place as optional.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!env.GEOCODING_API_KEY) return null
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
      `&result_type=neighborhood|sublocality|locality&key=${env.GEOCODING_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as {
      status: string
      results: { address_components: { long_name: string; types: string[] }[] }[]
    }
    if (data.status !== 'OK' || !data.results?.length) return null
    const comps = data.results[0].address_components
    const pick = (t: string) => comps.find((c) => c.types.includes(t))?.long_name
    return pick('neighborhood') || pick('sublocality') || pick('locality') || null
  } catch (err) {
    logger.warn({ err: String(err) }, 'geocode.failed')
    return null
  }
}
