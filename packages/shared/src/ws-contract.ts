import { z } from 'zod'

/**
 * WebSocket contract for the live camera session.
 * See: Detailed Feature Build Spec § 4.3, § 4.4.
 */

// ─── Binary framing tags (1 byte prefix) ──────────────────────────────
export const WS_TAG_FRAME = 0x01 // C→S: JPEG bytes
export const WS_TAG_AUDIO = 0x02 // S→C: [0x02][uint32 seq][MP3 chunk]

// ─── Server → Client JSON messages ────────────────────────────────────
export const WsSessionStarted = z.object({
  type: z.literal('session.started'),
  sessionId: z.string(),
})

export const WsDetectionAppeared = z.object({
  type: z.literal('detection.appeared'),
  detectionId: z.string(),
  itemId: z.string(), // slug in prototype; UUID once catalog DB is wired
  brand: z.string(),
  product: z.string(),
  coinDelta: z.number().int(),
  emoji: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  anchor: z.tuple([z.number(), z.number()]),
})

export const WsDetectionUpdated = z.object({
  type: z.literal('detection.updated'),
  detectionId: z.string(),
  anchor: z.tuple([z.number(), z.number()]),
})

export const WsDetectionCleared = z.object({
  type: z.literal('detection.cleared'),
  detectionId: z.string(),
})

export const WsSpeechStarted = z.object({
  type: z.literal('speech.started'),
  detectionId: z.string(),
  text: z.string().optional(), // expose the full line for debug overlay
})

export const WsSpeechEnded = z.object({
  type: z.literal('speech.ended'),
  detectionId: z.string(),
  text: z.string().optional(),
})

export const WsError = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
})

export const WsServerMessage = z.discriminatedUnion('type', [
  WsSessionStarted,
  WsDetectionAppeared,
  WsDetectionUpdated,
  WsDetectionCleared,
  WsSpeechStarted,
  WsSpeechEnded,
  WsError,
])
export type WsServerMessage = z.infer<typeof WsServerMessage>

// ─── Client → Server JSON messages ────────────────────────────────────
export const WsInterrupt = z.object({
  type: z.literal('interrupt'),
  reason: z.enum(['tap', 'item_changed']),
})

export const WsSessionEnd = z.object({
  type: z.literal('session.end'),
})

export const WsClientMessage = z.discriminatedUnion('type', [WsInterrupt, WsSessionEnd])
export type WsClientMessage = z.infer<typeof WsClientMessage>

// ─── Gemini perception JSON schema (server-side) ──────────────────────
export const PerceptionItem = z.object({
  name: z.string(), // 'Coca-Cola Classic 375ml can', 'Apple iPhone 15', 'banana'
  category: z.string(), // free-form: 'drink', 'electronics', 'fruit', 'toy', etc.
  healthScore: z.number().int().min(-20).max(20), // -20 = junk/bad buy, +20 = great buy
  confidence: z.number().min(0).max(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
})

export const PerceptionResult = z.object({
  items: z.array(PerceptionItem),
})
export type PerceptionItem = z.infer<typeof PerceptionItem>
export type PerceptionResult = z.infer<typeof PerceptionResult>
