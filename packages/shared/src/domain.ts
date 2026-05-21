import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
  displayName: z.string().nullable(),
  avatarEmoji: z.string().default('🧒'),
  createdAt: z.string().datetime(),
})

export const KidSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  age: z.number().nullable(),
  balanceCoins: z.number().int(),
})

export const ItemSchema = z.object({
  id: z.string().uuid(),
  brand: z.string(),
  product: z.string(),
  category: z.enum(['drink', 'snack', 'dairy', 'produce', 'other']),
  coinDelta: z.number().int(),
  reasonTemplate: z.string(),
  emoji: z.string().default('🛒'),
})

export const LedgerEntrySchema = z.object({
  id: z.string().uuid(),
  kidId: z.string().uuid(),
  itemId: z.string().uuid().nullable(),
  kind: z.enum(['purchase', 'topup', 'reward', 'adjustment']),
  coinDelta: z.number().int(),
  balanceAfter: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const SessionSchema = z.object({
  id: z.string().uuid(),
  kidId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  framesSent: z.number().int(),
  detections: z.number().int(),
  reactions: z.number().int(),
  estimatedCostUsd: z.number(),
})

export type User = z.infer<typeof UserSchema>
export type Kid = z.infer<typeof KidSchema>
export type Item = z.infer<typeof ItemSchema>
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>
export type Session = z.infer<typeof SessionSchema>
