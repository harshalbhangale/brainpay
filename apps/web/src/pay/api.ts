/**
 * MoneyPal → real backend bridge.
 * ───────────────────────────────────────────────────────────────────────────
 * Typed wrappers over the existing BrainPal API (auth, ledger, family, Stripe).
 * Reuses the shared `api()` helper (attaches the JWT) and the canonical shapes
 * from components/family/types so /pay speaks the exact same contract as the
 * rest of the product.
 *
 * Money convention: balances/deltas are whole-number integers presented as
 * dollars (matching the app's existing `aud()` formatter). "Give now" moves
 * REAL value through the server-side ledger via POST /wallet/topup.
 */
import { api } from '../lib/api'
import type { FamilyResponse, LedgerEntry } from '../components/family/types'

export type WalletResponse = { balance: number; entries: LedgerEntry[] }
export type TopupResult = { ok: true; balanceAfter: number; brainsDelta: number }
export type TopupIntentResult = { clientSecret: string; intentId: string }

export const payApi = {
  /** Caller's balance + last 50 ledger entries. */
  wallet: (limit = 50) => api<WalletResponse>(`/wallet?limit=${limit}`),

  /** Whole family + members (with balances + role). */
  family: () => api<FamilyResponse>('/family'),

  /** Reverse-chrono ledger across the family (optionally one kid). */
  feed: (opts: { kidId?: string; limit?: number } = {}) =>
    api<{ entries: LedgerEntry[] }>(
      `/family/feed?limit=${opts.limit ?? 50}${opts.kidId ? `&kidId=${opts.kidId}` : ''}`,
    ),

  /**
   * REAL money movement: parent credits a kid's wallet internally (no Stripe).
   * brainsDelta is an integer (1 = $1 in the app's display convention).
   */
  topupKid: (kidAccountId: string, brainsDelta: number, note?: string) =>
    api<TopupResult>('/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ kidAccountId, brainsDelta, note, kind: 'topup' }),
    }),

  /**
   * Stripe-funded top-up: creates a test-mode PaymentIntent and returns the
   * clientSecret. Confirming the card requires Stripe.js/Elements on the client
   * (not yet wired — see manual-testing notes).
   */
  topupIntent: (amountCents: number, kidAccountId?: string) =>
    api<TopupIntentResult>('/payments/topup-intent', {
      method: 'POST',
      body: JSON.stringify({ amountCents, kidAccountId }),
    }),
}
