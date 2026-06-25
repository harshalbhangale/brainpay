export type Country = { name: string; dial: string; flag: string; code: 'AU' | 'IN' | 'US' }

/**
 * Supported countries for sign-in. Product requirement: Australia, US & India.
 * (The mobile app offers more; the web client is intentionally limited.)
 */
export const COUNTRIES: Country[] = [
  { name: 'Australia', dial: '+61', flag: '🇦🇺', code: 'AU' },
  { name: 'United States', dial: '+1', flag: '🇺🇸', code: 'US' },
  { name: 'India', dial: '+91', flag: '🇮🇳', code: 'IN' },
]

/** Build an E.164 number from a dial code + local digits. */
export function toE164(dial: string, local: string): string {
  const digits = local.replace(/\D/g, '')
  return `${dial}${digits}`
}

/** Lightweight local-number validation (6–15 digits), matching the API's E.164 check. */
export function isValidLocal(local: string): boolean {
  const digits = local.replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 15
}
