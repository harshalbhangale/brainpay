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
  sessionId: z.string().uuid(),
})

export const WsDetectionAppeared = z.object({
  type: z.literal('detection.appeared'),
  detectionId: z.string(),
  itemId: z.string().uuid(),
  brand: z.string(),
  product: z.string(),
  coinDelta: z.number().int(),
  emoji: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [x, y, w, h] normalized 0..1
  anchor: z.tuple([z.number(), z.number()]), // [cx, cy] normalized 0..1
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
})

export const WsSpeechEnded = z.object({
  type: z.literal('speech.ended'),
  detectionId: z.string(),
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
  brand: z.string(),
  product: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
})

export const PerceptionResult = z.object({
  items: z.array(PerceptionItem),
})
export type PerceptionResult = z.infer<typeof PerceptionResult>
