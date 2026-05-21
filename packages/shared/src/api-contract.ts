import { z } from 'zod'
import { ItemSchema, LedgerEntrySchema } from './domain'

/**
 * HTTP API contract.
 * See: Detailed Feature Build Spec § 1.5.
 * WebSocket contract lives in ws-contract.ts.
 */

// ─── Auth ─────────────────────────────────────────────────────────────
export const OtpStartRequest = z.object({ phone: z.string().min(8).max(16) })
export const OtpStartResponse = z.object({ ok: z.literal(true), expiresInSec: z.number() })

export const OtpCheckRequest = z.object({ phone: z.string(), code: z.string().length(6) })
export const OtpCheckResponse = z.object({
  jwt: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    phone: z.string(),
    displayName: z.string().nullable(),
    avatarEmoji: z.string(),
  }),
  isNewUser: z.boolean(),
})

// ─── Me ───────────────────────────────────────────────────────────────
export const MeResponse = z.object({
  user: z.object({
    id: z.string().uuid(),
    phone: z.string(),
    displayName: z.string().nullable(),
    avatarEmoji: z.string(),
  }),
  kid: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    age: z.number().nullable(),
    balanceCoins: z.number().int(),
  }),
})

export const MePatchRequest = z.object({
  displayName: z.string().min(1).max(20).optional(),
  avatarEmoji: z.string().optional(),
})

// ─── Wallet ───────────────────────────────────────────────────────────
export const WalletResponse = z.object({
  balanceCoins: z.number().int(),
  weekDeltaCoins: z.number().int(),
  entries: z.array(
    LedgerEntrySchema.extend({
      item: ItemSchema.pick({ id: true, brand: true, product: true, emoji: true }).nullable(),
    }),
  ),
})

export const TopupRequest = z.object({
  amount: z.union([z.literal(50), z.literal(100), z.literal(500)]),
})

export const PurchaseRequest = z.object({
  itemId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
})

// ─── Items ────────────────────────────────────────────────────────────
export const ItemDetailResponse = ItemSchema
