import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { toFile } from 'openai'
import { db } from '../db'
import { accounts } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { llm } from '../services/llm'
import { loadEnv } from '../env'

/**
 * Real-time voice agent for onboarding.
 *
 * Turn-by-turn conversation:
 *   1. Mobile records user speech
 *   2. POSTs audio to /voice-agent/turn with current persona state
 *   3. Server: Whisper STT → GPT-4o (extracts persona fields + reply) → ElevenLabs TTS
 *   4. Returns: { transcript, reply, audioBase64, personaUpdate, done }
 *
 * The mobile client maintains the persona state and stops the loop when
 * `done: true` is returned. Server is stateless per turn — fast, simple.
 */

const env = loadEnv()

export const voiceAgent = new Hono<{ Variables: AuthVars }>()
voiceAgent.use('*', requireAuth)

// ─── System prompts ──────────────────────────────────────────────────
const PARENT_ONBOARDING_SYSTEM = `You are PAL — a friendly, slightly sarcastic AI money buddy talking to a parent during onboarding.

Your job: extract these persona fields one at a time through natural conversation:
1. name — what their kids call them
2. avatar — pick one of: 👩‍🦰 👨 👩 👴 👵 🧑
3. style — one of: chill, balanced, strict

CRITICAL RULES:
- Speak in 1-2 short sentences max. This is voice — keep it conversational.
- Ask ONE question at a time.
- React warmly to their answers ("nice", "love it", "cool").
- When all 3 fields are filled, say goodbye with "all set" and set done=true.
- If you can't understand them or the audio is unclear, ask them to say it again.

Return ONLY valid JSON matching this schema:
{
  "reply": "what to say back, 1-2 sentences max",
  "personaUpdate": {
    "name": "string or null if not extracted yet",
    "avatar": "one of the emojis or null",
    "style": "chill|balanced|strict or null"
  },
  "done": "true only when all 3 fields are filled and you've said goodbye"
}`

const KID_ONBOARDING_SYSTEM = `You are PAL — a sarcastic, witty AI money buddy talking to a kid (10-14) during onboarding.

Extract these persona fields:
1. name — confirm what they want to be called
2. age — between 8 and 17
3. avatar — pick one: 🧒 👦 👧 🧑 🦄 🐱 🐶
4. voiceId — which PAL personality: sarcastic, cool, wise, hyped, chill, auntie

CRITICAL RULES:
- Speak in 1-2 short sentences. This is voice — keep it punchy.
- Be playful, slightly sarcastic. Roast products, never the kid.
- Ask ONE question at a time.
- When all 4 fields are filled, say goodbye and set done=true.
- If audio is unclear, ask them to repeat.

Return ONLY valid JSON:
{
  "reply": "1-2 sentences",
  "personaUpdate": {
    "name": "string or null",
    "age": "number or null",
    "avatar": "emoji or null",
    "voiceId": "sarcastic|cool|wise|hyped|chill|auntie or null"
  },
  "done": "true when all filled"
}`

// ─── POST /voice-agent/turn ──────────────────────────────────────────
// Body (JSON): { audioBase64, role, personaSoFar, conversation }
//   audioBase64    — m4a/wav/webm encoded user speech, base64
//   role           — 'parent' | 'kid'
//   personaSoFar   — partial persona state from mobile
//   conversation   — last 6 turns of { role, content } for context
//
// Response:
//   { transcript, reply, audioBase64, personaUpdate, done }
voiceAgent.post('/voice-agent/turn', async (c) => {
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      audioBase64: z.string().min(1),
      role: z.enum(['parent', 'kid']),
      personaSoFar: z.record(z.unknown()).default({}),
      conversation: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .max(20)
        .default([]),
      textOverride: z.string().optional(),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { audioBase64, role, personaSoFar, conversation, textOverride } = parsed.data

  // ── 1. Whisper STT (skipped if textOverride is provided) ──────────
  let transcript = ''
  if (textOverride) {
    transcript = textOverride.trim()
  } else {
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      const file = await toFile(audioBuffer, 'turn.m4a')
      const stt = await llm.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en',
        response_format: 'text',
      })
      transcript = (typeof stt === 'string' ? stt : (stt as { text: string }).text ?? '').trim()
    } catch (err) {
      logger.warn({ err: String(err), accountId }, 'voice_agent.stt_failed')
      return c.json({ error: 'transcription_failed' }, 500)
    }
  }

  if (!transcript) {
    // Empty audio — gentle nudge.
    return c.json({
      transcript: '',
      reply: "Sorry, didn't catch that. Try again?",
      audioBase64: await synthesize("Sorry, didn't catch that. Try again?"),
      personaUpdate: personaSoFar,
      done: false,
    })
  }

  // ── 2. GPT-4o turn (structured output) ────────────────────────────
  const system = role === 'parent' ? PARENT_ONBOARDING_SYSTEM : KID_ONBOARDING_SYSTEM
  const personaCtx = `Persona collected so far: ${JSON.stringify(personaSoFar)}`

  let reply = ''
  let personaUpdate: Record<string, unknown> = personaSoFar
  let done = false

  try {
    const resp = await llm.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 120,
      messages: [
        { role: 'system', content: system },
        { role: 'system', content: personaCtx },
        ...conversation,
        { role: 'user', content: transcript },
      ],
    })

    const raw = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as {
      reply?: string
      personaUpdate?: Record<string, unknown>
      done?: boolean
    }

    reply = raw.reply?.slice(0, 300) ?? "Got it. What's next?"
    // Merge updates — keep existing values if new ones are null.
    personaUpdate = { ...personaSoFar }
    if (raw.personaUpdate) {
      for (const [k, v] of Object.entries(raw.personaUpdate)) {
        if (v !== null && v !== undefined && v !== '') {
          personaUpdate[k] = v
        }
      }
    }
    done = !!raw.done
  } catch (err) {
    logger.warn({ err: String(err), accountId }, 'voice_agent.llm_failed')
    reply = "Hmm, my brain glitched. Say that one more time?"
  }

  // ── 3. If done, persist persona to account ────────────────────────
  if (done) {
    try {
      const accountType = role === 'parent' ? 'parent' : 'kid'
      await db
        .update(accounts)
        .set({ accountType, persona: personaUpdate })
        .where(eq(accounts.id, accountId))
      logger.info({ accountId, accountType }, 'voice_agent.persona_saved')
    } catch (err) {
      logger.error({ err: String(err) }, 'voice_agent.persist_failed')
    }
  }

  // ── 4. ElevenLabs TTS ─────────────────────────────────────────────
  const audioOut = await synthesize(reply)

  return c.json({
    transcript,
    reply,
    audioBase64: audioOut,
    personaUpdate,
    done,
  })
})

// ─── POST /voice-agent/greet ─────────────────────────────────────────
// Returns the first PAL greeting audio without needing user input.
// Called when the onboarding screen mounts.
//
// Body: { role: 'parent' | 'kid' }
voiceAgent.post('/voice-agent/greet', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ role: z.enum(['parent', 'kid']) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const greeting = parsed.data.role === 'parent'
    ? "Hey! I'm PAL. I'll be your kid's money buddy. What should I call you?"
    : "Hey there! I'm PAL. What should I call you?"

  const audioBase64 = await synthesize(greeting)

  return c.json({
    reply: greeting,
    audioBase64,
  })
})

// ─── OpenAI TTS helper ───────────────────────────────────────────────
// Uses OpenAI tts-1 (fast, cheap) with the "nova" voice.
// Returns base64-encoded MP3, or empty string on failure.
async function synthesize(text: string): Promise<string> {
  if (!text.trim()) return ''
  try {
    const response = await llm.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      response_format: 'mp3',
      speed: 1.1,
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.toString('base64')
  } catch (err) {
    logger.warn({ err: String(err) }, 'voice_agent.tts_failed')
    return ''
  }
}
