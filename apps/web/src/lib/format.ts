/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.floor((Date.now() - then) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Format an amount as Australian dollars, e.g. 564 -> "$564.00".
 * Backend balances are whole-number integers; we present them as AUD.
 */
export function aud(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Signed AUD, e.g. +$50.00 / -$12.00 — for ledger deltas. */
export function audSigned(n: number): string {
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${aud(Math.abs(n))}`
}
