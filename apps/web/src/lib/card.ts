import { useEffect, useState } from 'react'

/**
 * Card presentation + controls.
 *
 * NOTE: BrainPal has no real card processor. The card number/expiry/CVV are
 * generated deterministically from the account id so they're stable per kid,
 * and the controls persist client-side (localStorage). This is the realistic
 * card-management UX; wiring it to an issuer is future backend work.
 */

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic Visa-style 16-digit PAN (grouped), e.g. "4278 3200 0041 1340". */
export function cardNumber(accountId: string): string {
  const seed = String(hash(accountId)) + String(hash('a' + accountId)) + String(hash('b' + accountId))
  const digits = ('4' + seed.replace(/\D/g, '')).slice(0, 16).padEnd(16, '0')
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

export function cardLast4(accountId: string): string {
  return cardNumber(accountId).replace(/\s/g, '').slice(-4)
}

export function cardExpiry(accountId: string): string {
  const h = hash('exp' + accountId)
  const mm = String((h % 12) + 1).padStart(2, '0')
  const yy = String((new Date().getFullYear() + 4) % 100).padStart(2, '0')
  return `${mm}/${yy}`
}

export function cardCvv(accountId: string): string {
  return String((hash('cvv' + accountId) % 900) + 100)
}

export const maskedNumber = (last4: string) => `•••• •••• •••• ${last4}`

export type CardSettings = {
  frozen: boolean
  online: boolean
  atm: boolean
  contactless: boolean
  dailyLimit: number
}

const DEFAULTS: CardSettings = {
  frozen: false,
  online: true,
  atm: true,
  contactless: true,
  dailyLimit: 100,
}

/** Card controls persisted per account in localStorage (demo persistence). */
export function useCardSettings(accountId: string) {
  const key = `bp.card.${accountId}`

  const load = (): CardSettings => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CardSettings>) } : DEFAULTS
    } catch {
      return DEFAULTS
    }
  }

  const [settings, setSettings] = useState<CardSettings>(load)

  useEffect(() => {
    setSettings(load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function update(patch: Partial<CardSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return [settings, update] as const
}
