import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { loadEnv } from '../env'
import { logger } from '../logger'
import { seedPersonaMemory } from '../services/persona-memory'

/**
 * Realtime onboarding (OpenAI Realtime GA, WebRTC).
 *
 *   POST /realtime/onboarding-token  → ephemeral client secret bound to a
 *       role-specific persona-collection session with a `save_persona` tool.
 *   POST /realtime/persona           → persist collected persona + seed memory.
 *
 * The phone connects DIRECTLY to OpenAI over WebRTC using the ephemeral
 * secret; the API key never leaves the server. Audio transport is handled by
 * WebRTC (fixes the expo-audio raw-PCM limitation of the old /voice-rt path).
 */

const env = loadEnv()
const REALTIME_MODEL = 'gpt-realtime'
const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets'

export const realtime = new Hono<{ Variables: AuthVars }>()
realtime.use('*', requireAuth)

const SAVE_PERSONA_TOOL = {
  type: 'function',
  name: 'save_persona',
  description:
    'Save the collected persona. Call this exactly once, after every required field is gathered, then say a short warm goodbye.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'what they want to be called' },
      avatar: { type: 'string', description: 'a single emoji' },
      style: { type: 'string', enum: ['chill', 'balanced', 'strict'], description: 'parent money parenting style' },
      primary_goal: { type: 'string', description: 'parent: the one money habit to improve' },
      money_value: { type: 'string', description: 'parent: the money value they most want to teach (e.g. saving, generosity, budgeting, earning)' },
      concern: { type: 'string', description: 'parent: their biggest worry about their kid and money' },
      age: { type: 'number', description: 'kid age, 8-17' },
      voiceId: { type: 'string', description: 'kid: preferred PAL voice vibe' },
      saving_for: { type: 'string', description: 'kid: what they are saving up for' },
      loves: { type: 'string', description: 'kid: a hobby or thing they love doing' },
    },
    required: ['name'],
  },
} as const

const PARENT_INSTRUCTIONS = `You are PAL — a warm, witty AI money coach onboarding a parent by voice.
Collect, through natural one-question-at-a-time conversation:
1. name — what their kids call them
2. avatar — one emoji that fits them
3. style — "chill", "balanced", or "strict" money-parenting style
4. primary_goal — the one money habit they most want to improve for their kid
5. money_value — the money value they most want to teach (saving, generosity, budgeting, earning…)
6. concern — their biggest worry about their kid and money
Open with a warm one-liner. Ask ONE question at a time, react genuinely, keep replies to 1-2 short sentences (this is voice). When you have all six, call the save_persona tool, then say a short goodbye like "Perfect — let's build your family's money world!"`

const KID_INSTRUCTIONS = `You are PAL — a sarcastic, hype AI money buddy onboarding a kid by voice.
Collect, through a fun one-question-at-a-time conversation:
1. name — what they want to be called
2. age — between 8 and 17
3. avatar — one emoji
4. voiceId — their vibe: sarcastic, cool, wise, hyped, chill, or auntie
5. saving_for — what they're saving up for
6. loves — a hobby or thing they love doing
Open punchy. Ask ONE question at a time, tease lightly, hype them up, 1-2 sentences max per reply. When you have all six, call the save_persona tool, then say "Alright, you're all set!"`

// ─── POST /realtime/onboarding-token ──────────────────────────────────
realtime.post('/realtime/onboarding-token', async (c) => {
  const accountId = authedAccountId(c)
  const body = await c.req.json().catch(() => ({})) as { role?: 'parent' | 'kid' }
  const role: 'parent' | 'kid' = body.role === 'kid' ? 'kid' : 'parent'

  const resp = await fetch(CLIENT_SECRETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      // Bind a stable, privacy-preserving safety id to the session.
      'OpenAI-Safety-Identifier': createHash('sha256').update(accountId).digest('hex'),
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime',
        model: REALTIME_MODEL,
        instructions: role === 'parent' ? PARENT_INSTRUCTIONS : KID_INSTRUCTIONS,
        audio: {
          input: {
            transcription: { model: 'gpt-4o-mini-transcribe' },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 },
          },
          output: { voice: role === 'parent' ? 'alloy' : 'verse' },
        },
        tools: [SAVE_PERSONA_TOOL],
        tool_choice: 'auto',
      },
    }),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    logger.error({ status: resp.status, detail: detail.slice(0, 300) }, 'realtime.token_failed')
    return c.json({ error: 'token_failed' }, 502)
  }

  const data = (await resp.json()) as { value: string; expires_at: number }
  return c.json({ clientSecret: data.value, expiresAt: data.expires_at, model: REALTIME_MODEL })
})

// ─── POST /realtime/persona ───────────────────────────────────────────
// Persist the persona collected by the save_persona tool + seed memory.
realtime.post('/realtime/persona', async (c) => {
  const accountId = authedAccountId(c)
  const body = await c.req.json().catch(() => ({})) as {
    role?: 'parent' | 'kid'
    persona?: Record<string, unknown>
  }
  const role: 'parent' | 'kid' = body.role === 'kid' ? 'kid' : 'parent'
  const persona = body.persona ?? {}
  if (!persona.name) return c.json({ error: 'persona_incomplete' }, 400)

  await db.update(accounts).set({ accountType: role, persona }).where(eq(accounts.id, accountId))

  const [member] = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)

  await seedPersonaMemory({ accountId, familyId: member?.familyId ?? null, role, persona })

  return c.json({ ok: true })
})
