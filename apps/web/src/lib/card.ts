import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

/**
 * Card presentation + REAL controls.
 *
 * BrainPal has no card processor, so the PAN/expiry/CVV are generated
 * deterministically from the account id (stable per holder, presentation only).
 * The CONTROLS, however, are real: freeze, channel toggles, daily limit and
 * category blocks persist server-side in the account's persona via
 * GET/PUT /cards/:accountId (parents manage kids; kids manage their own).
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
  issued: boolean
  frozen: boolean
  online: boolean
  atm: boolean
  contactless: boolean
  dailyLimit: number
  blocks: string[]
  /** Visual skin id (see cardSkins) + custom name printed on the card. */
  design: string
  label: string
}

const DEFAULTS: CardSettings = {
  issued: true,
  frozen: false,
  online: true,
  atm: true,
  contactless: true,
  dailyLimit: 100,
  blocks: [],
  design: 'ink',
  label: '',
}

/** Human label for a block category. */
export function blockLabel(b: string): string {
  const map: Record<string, string> = { gambling: 'Gambling', in_app: 'In-app purchases', crypto: 'Crypto', alcohol: 'Alcohol' }
  return map[b] ?? b.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

/** Card controls — real, persisted per account on the server. */
export function useCardSettings(accountId: string) {
  const qc = useQueryClient()
  const key = ['card', accountId]
  const real = !!accountId && accountId !== 'preview'

  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ settings: CardSettings }>(`/cards/${accountId}`).then((r) => ({ ...DEFAULTS, ...r.settings })),
    enabled: real,
    staleTime: 15_000,
  })

  const settings: CardSettings = q.data ?? DEFAULTS

  const mut = useMutation({
    mutationFn: (patch: Partial<CardSettings>) =>
      api<{ settings: CardSettings }>(`/cards/${accountId}`, { method: 'PUT', body: JSON.stringify(patch) }).then((r) => r.settings),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<CardSettings>(key) ?? settings
      qc.setQueryData<CardSettings>(key, { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev) },
    onSuccess: (s) => qc.setQueryData<CardSettings>(key, { ...DEFAULTS, ...s }),
  })

  function update(patch: Partial<CardSettings>) {
    // Public preview (logged-out) has no real account — keep it local-only.
    if (!real) { qc.setQueryData<CardSettings>(key, { ...settings, ...patch }); return }
    mut.mutate(patch)
  }

  return [settings, update] as const
}
