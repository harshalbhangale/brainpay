import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { accounts, chatMessages, chores, goals, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { llm } from '../services/llm'
import { loadPalContext, contextToSystemPrompt } from '../services/pal-context'
import { parseIntent } from '../services/pal-intent'
import { sql } from 'drizzle-orm'
import { toFile } from 'openai'

/**
 * PAL Chat API — Sprint 1 Part 5.
 *
 *   POST /chat          send a message, get PAL reply + optional intent
 *   POST /chat/execute  execute a confirmed intent (add_chore, topup, set_goal)
 *   GET  /chat/history  last 50 messages for this account
 */

export const chat = new Hono<{ Variables: AuthVars }>()
chat.use('*', requireAuth)

// ─── POST /chat ───────────────────────────────────────────────────────
// Send a message to PAL. Returns a text reply and optionally a
// structured intent that requires user confirmation before executing.
//
// Body: { message: string }
// Response: { reply: string, intent?: ParsedIntent, requiresConfirmation: boolean }
chat.post('/chat', async (c) => {
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({ message: z.string().min(1).max(1000).trim() })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body' }, 400)
  }

  const { message } = parsed.data

  // Load family context for PAL.
  const ctx = await loadPalContext(accountId)
  const style = ctx.isParent ? 'parent' : 'kid'
  const systemPrompt = contextToSystemPrompt(ctx, style)

  // Load last 10 messages for conversation continuity.
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.accountId, accountId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(10)

  const historyMessages = history.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Parse intent in parallel with generating the reply.
  const [intentResult, completionResult] = await Promise.allSettled([
    parseIntent(message, ctx),
    llm.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: message },
      ],
    }),
  ])

  const intent = intentResult.status === 'fulfilled' ? intentResult.value : { kind: 'query' as const }
  const reply = completionResult.status === 'fulfilled'
    ? (completionResult.value.choices[0]?.message?.content ?? "I'm having trouble thinking right now. Try again?")
    : "I'm having trouble thinking right now. Try again?"

  // Persist both messages to chat history.
  await db.insert(chatMessages).values([
    { accountId, role: 'user', content: message },
    { accountId, role: 'assistant', content: reply },
  ])

  const requiresConfirmation = intent.kind !== 'query'

  logger.info(
    { accountId, intentKind: intent.kind, requiresConfirmation },
    'chat.message',
  )

  return c.json({
    reply,
    intent: requiresConfirmation ? intent : undefined,
    requiresConfirmation,
  })
})

// ─── POST /chat/execute ───────────────────────────────────────────────
// Execute a confirmed intent. Called after the user taps "Confirm" on
// the preview card shown by the mobile client.
//
// Body: { intent: ParsedIntent }
chat.post('/chat/execute', async (c) => {
  const actorId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      intent: z.object({
        kind: z.enum(['add_chore', 'topup', 'set_goal']),
        kidName: z.string().optional(),
        kidAccountId: z.string().uuid().optional(),
        title: z.string().optional(),
        rewardBrains: z.number().int().positive().optional(),
        brainsDelta: z.number().int().positive().optional(),
        note: z.string().optional(),
        goalName: z.string().optional(),
        targetBrains: z.number().int().positive().optional(),
      }),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { intent } = parsed.data

  // Resolve family membership.
  const [memberRow] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, actorId))
    .limit(1)

  if (!memberRow) return c.json({ error: 'no_family' }, 403)
  const { familyId, role } = memberRow
  const isParent = ['primary_parent', 'co_parent'].includes(role)

  // ── add_chore ────────────────────────────────────────────────────────
  if (intent.kind === 'add_chore') {
    if (!isParent) return c.json({ error: 'only_parents_can_create_chores' }, 403)
    if (!intent.kidAccountId) return c.json({ error: 'kid_not_found' }, 400)
    if (!intent.title) return c.json({ error: 'title_required' }, 400)

    const [chore] = await db
      .insert(chores)
      .values({
        familyId,
        assignedTo: intent.kidAccountId,
        createdBy: actorId,
        title: intent.title,
        rewardBrains: intent.rewardBrains ?? 50,
        status: 'pending',
      })
      .returning()

    logger.info({ choreId: chore.id, via: 'chat' }, 'chat.execute.add_chore')
    return c.json({
      ok: true,
      kind: 'add_chore',
      result: { chore },
      confirmationMessage: `Chore "${chore.title}" added for ${intent.kidName ?? 'kid'} — ${chore.rewardBrains} 🧠 reward.`,
    })
  }

  // ── topup ────────────────────────────────────────────────────────────
  if (intent.kind === 'topup') {
    if (!isParent) return c.json({ error: 'only_parents_can_topup' }, 403)
    if (!intent.kidAccountId) return c.json({ error: 'kid_not_found' }, 400)
    if (!intent.brainsDelta) return c.json({ error: 'amount_required' }, 400)

    // Verify kid is in same family.
    const [kidMember] = await db
      .select({ familyId: memberships.familyId })
      .from(memberships)
      .where(eq(memberships.accountId, intent.kidAccountId))
      .limit(1)

    if (!kidMember || kidMember.familyId !== familyId) {
      return c.json({ error: 'kid_not_in_family' }, 403)
    }

    // Atomic credit.
    const [kidAcct] = await db
      .select({ cachedBalance: accounts.cachedBalance })
      .from(accounts)
      .where(eq(accounts.id, intent.kidAccountId))
      .for('update')

    if (!kidAcct) return c.json({ error: 'kid_not_found' }, 404)

    const balanceAfter = kidAcct.cachedBalance + intent.brainsDelta

    await db
      .update(accounts)
      .set({ cachedBalance: sql`${accounts.cachedBalance} + ${intent.brainsDelta}` })
      .where(eq(accounts.id, intent.kidAccountId))

    const { ledger } = await import('../db/schema')
    await db.insert(ledger).values({
      familyId,
      accountId: intent.kidAccountId,
      actorId,
      kind: 'topup',
      brainsDelta: intent.brainsDelta,
      balanceAfter,
      metadata: { note: intent.note ?? 'Via PAL chat', source: 'chat_topup' },
    })

    logger.info({ kidAccountId: intent.kidAccountId, brainsDelta: intent.brainsDelta, via: 'chat' }, 'chat.execute.topup')
    return c.json({
      ok: true,
      kind: 'topup',
      result: { balanceAfter, brainsDelta: intent.brainsDelta },
      confirmationMessage: `Sent ${intent.brainsDelta} 🧠 to ${intent.kidName ?? 'kid'}. New balance: ${balanceAfter} 🧠.`,
    })
  }

  // ── set_goal ─────────────────────────────────────────────────────────
  if (intent.kind === 'set_goal') {
    if (!intent.kidAccountId) return c.json({ error: 'kid_not_found' }, 400)
    if (!intent.goalName) return c.json({ error: 'goal_name_required' }, 400)

    // Abandon any existing active goal first.
    await db
      .update(goals)
      .set({ status: 'abandoned' })
      .where(and(eq(goals.accountId, intent.kidAccountId), eq(goals.status, 'active')))

    const [goal] = await db
      .insert(goals)
      .values({
        familyId,
        accountId: intent.kidAccountId,
        name: intent.goalName,
        targetBrains: intent.targetBrains ?? 500,
        currentBrains: 0,
        status: 'active',
      })
      .returning()

    logger.info({ goalId: goal.id, via: 'chat' }, 'chat.execute.set_goal')
    return c.json({
      ok: true,
      kind: 'set_goal',
      result: { goal },
      confirmationMessage: `Goal "${goal.name}" set for ${intent.kidName ?? 'kid'} — ${goal.targetBrains} 🧠 target.`,
    })
  }

  return c.json({ error: 'unknown_intent' }, 400)
})

// ─── GET /chat/history ────────────────────────────────────────────────
// Returns last 50 messages for the current account.
chat.get('/chat/history', async (c) => {
  const accountId = authedAccountId(c)
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100)

  const messages = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.accountId, accountId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)

  return c.json({ messages: messages.reverse() })
})

// ─── POST /chat/transcribe ────────────────────────────────────────────
// Transcribes an audio recording using OpenAI Whisper.
// The mobile client records audio, sends it here, gets back text,
// then pipes that text into POST /chat.
//
// Accepts: multipart/form-data with field "audio" (m4a/mp4/webm/wav, ≤ 25MB)
//       OR JSON { audioBase64: string, mimeType?: string }
//
// Returns: { text: string }
chat.post('/chat/transcribe', async (c) => {
  const accountId = authedAccountId(c)

  let audioBuffer: Buffer
  let filename = 'recording.m4a'

  const contentType = c.req.header('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData().catch(() => null)
    const file = formData?.get('audio') as File | null
    if (!file) return c.json({ error: 'audio_required' }, 400)
    if (file.size > 25 * 1024 * 1024) return c.json({ error: 'audio_too_large' }, 413)
    const buf = await file.arrayBuffer()
    audioBuffer = Buffer.from(buf)
    filename = file.name || filename
  } else {
    const body = await c.req.json().catch(() => ({})) as {
      audioBase64?: string
      mimeType?: string
    }
    if (!body.audioBase64) return c.json({ error: 'audio_required' }, 400)
    audioBuffer = Buffer.from(body.audioBase64, 'base64')
    if (body.mimeType?.includes('wav')) filename = 'recording.wav'
    else if (body.mimeType?.includes('webm')) filename = 'recording.webm'
    else if (body.mimeType?.includes('mp4')) filename = 'recording.mp4'
  }

  try {
    const file = await toFile(audioBuffer, filename)
    const transcription = await llm.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    })

    const text = typeof transcription === 'string'
      ? transcription.trim()
      : (transcription as { text: string }).text?.trim() ?? ''

    if (!text) return c.json({ error: 'no_speech_detected' }, 422)

    logger.info({ accountId, textLength: text.length }, 'chat.transcribe')
    return c.json({ text })
  } catch (err) {
    logger.error({ err: String(err), accountId }, 'chat.transcribe_failed')
    return c.json({ error: 'transcription_failed' }, 500)
  }
})
