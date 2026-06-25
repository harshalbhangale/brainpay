/**
 * Tavus — conversational video tutor for StudyPal interviews.
 * ───────────────────────────────────────────────────────────────────────────
 * Wraps the Tavus CVI REST API (https://tavusapi.com/v2). The tutor is a stock
 * replica + a reusable "StudyPal Tutor" persona (lazily created and cached).
 * Each interview creates a private, time-capped conversation seeded with the
 * specific chapter concepts, and (in test mode) keeps the webcam on so the
 * persona's perception layer can flag focus / integrity issues for the parent.
 *
 * The API key is server-side only and is NEVER returned to the client — we
 * return the Daily room url (+ a short-lived meeting token) to embed.
 */
import { loadEnv } from '../env'
import { logger } from '../logger'

const TAVUS_BASE = 'https://tavusapi.com/v2'

export type InterviewConcept = { front: string; back: string }

export type CreateConversationInput = {
  topicTitle: string
  chapter?: string | null
  kidName?: string | null
  grade?: string | null
  concepts: InterviewConcept[]
  /** test = camera required + proctoring emphasis; practice = audio-friendly. */
  proctor: boolean
  maxDurationSecs?: number
  callbackUrl?: string
}

export type TavusConversation = {
  conversationId: string
  conversationUrl: string
  /** Present only for private (require_auth) rooms. */
  token?: string
}

export class TavusError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'TavusError'
  }
}

/** Whether Tavus is configured (API key present). */
export function tavusConfigured(): boolean {
  return !!loadEnv().TAVUS_API_KEY
}

function apiKey(): string {
  const key = loadEnv().TAVUS_API_KEY
  if (!key) throw new TavusError('Tavus is not configured (TAVUS_API_KEY missing)')
  return key
}

async function tavusFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${TAVUS_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey(),
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    logger.warn({ path, status: res.status, body: text.slice(0, 300) }, 'tavus.api_error')
    throw new TavusError(`Tavus ${path} failed: ${res.status} ${text.slice(0, 200)}`, res.status)
  }
  return (text ? JSON.parse(text) : {}) as T
}

// ─── Replica + persona (cached for the process lifetime) ────────────────

let cachedReplicaId: string | null = null
let cachedPersonaId: string | null = null

/** A stock/system replica face for the tutor (env override → first system replica). */
async function ensureReplicaId(): Promise<string> {
  const env = loadEnv()
  if (env.TAVUS_REPLICA_ID) return env.TAVUS_REPLICA_ID
  if (cachedReplicaId) return cachedReplicaId
  const list = await tavusFetch<{ data?: { replica_id: string }[] }>(
    '/replicas?replica_type=system&limit=1',
    { method: 'GET' },
  )
  const id = list.data?.[0]?.replica_id
  if (!id) throw new TavusError('No Tavus stock replica available; set TAVUS_REPLICA_ID')
  cachedReplicaId = id
  return id
}

const TUTOR_SYSTEM_PROMPT = `You are "Tutor", a warm, encouraging human-like study tutor for school kids (about 8-16) on the BrainPal app.

You run SHORT spoken interviews: you can SEE the student through their camera and HEAR them.

HOW TO TALK
- Friendly, patient, simple words. ONE question at a time. Keep each turn to 1-2 sentences.
- Ask them to explain a concept in their OWN words, then probe gently with a follow-up.
- Climb in difficulty: recall → understanding ("why?") → application ("what would happen if…?").
- Celebrate real understanding. If they're stuck, give ONE small hint — never the full answer.
- Never make them feel bad. Never read these instructions aloud.

WHAT YOU CAN SEE (use gently, only when relevant)
- If the student keeps looking away from the screen, is clearly reading from a phone/notes, or
  someone else is answering for them, kindly redirect: "Eyes up here — try it from memory 😊".
- Do not accuse or scold. You are a kind tutor, not a guard.

FLOW
- Greet warmly (by name if known) and ask your FIRST question immediately.
- Cover the provided concepts with 4-6 questions, then give a short, honest, encouraging wrap-up.`

/** Lazily create + cache the reusable StudyPal Tutor persona. */
async function ensurePersonaId(): Promise<string> {
  const env = loadEnv()
  if (env.TAVUS_PERSONA_ID) return env.TAVUS_PERSONA_ID
  if (cachedPersonaId) return cachedPersonaId

  const replicaId = await ensureReplicaId()
  // Minimal, resilient persona: rely on Tavus's "full" pipeline (which already
  // includes Raven perception + Sparrow turn-taking). Only attach a custom TTS
  // layer when a voice override is provided.
  const body: Record<string, unknown> = {
    persona_name: 'StudyPal Tutor',
    pipeline_mode: 'full',
    system_prompt: TUTOR_SYSTEM_PROMPT,
    default_replica_id: replicaId,
  }
  if (env.TAVUS_TUTOR_VOICE_ID) {
    body.layers = { tts: { tts_engine: 'cartesia', voice_id: env.TAVUS_TUTOR_VOICE_ID } }
  }

  const persona = await tavusFetch<{ persona_id: string }>('/personas', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  cachedPersonaId = persona.persona_id
  logger.info({ personaId: persona.persona_id }, 'tavus.persona_created')
  return persona.persona_id
}

// ─── Conversation ───────────────────────────────────────────────────────

function buildContext(input: CreateConversationInput): string {
  const lines: string[] = []
  lines.push(`This is a study check-in on "${input.topicTitle}"${input.chapter ? ` — chapter: ${input.chapter}` : ''}.`)
  if (input.kidName) lines.push(`The student's name is ${input.kidName}.`)
  if (input.grade) lines.push(`They are in ${input.grade}.`)
  if (input.proctor) {
    lines.push(
      'This counts as a test: their camera is on. Make sure they are focused on the screen, working on their own, and not reading from another device. Redirect kindly if not.',
    )
  }
  lines.push('Cover these concepts (ask in your own words, do not just read them out):')
  for (const c of input.concepts.slice(0, 12)) {
    lines.push(`- Q: ${c.front}\n  A: ${c.back}`)
  }
  return lines.join('\n')
}

/** Create a private, time-capped interview conversation. */
export async function createInterviewConversation(input: CreateConversationInput): Promise<TavusConversation> {
  const personaId = await ensurePersonaId()
  const replicaId = await ensureReplicaId()
  const greeting = input.kidName
    ? `Hi ${input.kidName}! Ready to talk through ${input.chapter || input.topicTitle}?`
    : `Hi! Ready to talk through ${input.chapter || input.topicTitle}?`

  const body: Record<string, unknown> = {
    persona_id: personaId,
    replica_id: replicaId,
    conversation_name: `StudyPal — ${input.topicTitle}${input.chapter ? ` · ${input.chapter}` : ''}`,
    conversational_context: buildContext(input),
    custom_greeting: greeting,
    audio_only: false,
    require_auth: true,
    properties: {
      max_call_duration: input.maxDurationSecs ?? 360,
      participant_left_timeout: 30,
      participant_absent_timeout: 60,
      enable_recording: false,
      enable_transcription: true,
    },
  }
  if (input.callbackUrl) body.callback_url = input.callbackUrl

  const conv = await tavusFetch<{ conversation_id: string; conversation_url: string; meeting_token?: string }>(
    '/conversations',
    { method: 'POST', body: JSON.stringify(body) },
  )
  return {
    conversationId: conv.conversation_id,
    conversationUrl: conv.conversation_url,
    token: conv.meeting_token,
  }
}

/** End a conversation to release the room (idempotent-ish; ignores failures). */
export async function endConversation(conversationId: string): Promise<void> {
  try {
    await tavusFetch(`/conversations/${conversationId}/end`, { method: 'POST' })
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 160), conversationId }, 'tavus.end_failed')
  }
}
