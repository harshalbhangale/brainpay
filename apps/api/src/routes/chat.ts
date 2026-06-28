import { Hono } from 'hono'
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { accounts, chatMessages, chores, goals, ledger, inbox, familyRules, memoryFacts, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { llm } from '../services/llm'
import { loadPalContext, contextToSystemPrompt } from '../services/pal-context'
import { parseIntent } from '../services/pal-intent'
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

// Council router: picks which specialist Pals chime in and writes each a one-liner.
const COUNCIL_SYSTEM = `You are the BrainPal council router for a family money app.
Given the user's message, decide which specialist Pals should add a short note:
- moneypal: spending, saving, goals, affordability, allowance
- healthpal: food/snack/nutrition/health
- studypal: homework, study, learning, screen time
Return STRICT JSON: {"pals":[{"palId":"moneypal","line":"one short sentence in that Pal's voice"}]}.
Include only Pals genuinely relevant (0-3). Each line <= 14 words. No other text.`

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
  const [intentResult, completionResult, councilResult] = await Promise.allSettled([
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
    llm.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 160,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: COUNCIL_SYSTEM },
        { role: 'user', content: message },
      ],
    }),
  ])

  const intent = intentResult.status === 'fulfilled' ? intentResult.value : { kind: 'query' as const }
  const reply = completionResult.status === 'fulfilled'
    ? (completionResult.value.choices[0]?.message?.content ?? "I'm having trouble thinking right now. Try again?")
    : "I'm having trouble thinking right now. Try again?"

  // Persist both messages to chat history. Stagger the timestamps by 1ms so
  // the user message always sorts before the assistant reply — inserting both
  // with defaultNow() gives them an identical created_at, which makes ordering
  // by created_at non-deterministic (reply could render above the prompt).
  const userAt = new Date()
  const assistantAt = new Date(userAt.getTime() + 1)
  await db.insert(chatMessages).values([
    { accountId, role: 'user', content: message, createdAt: userAt },
    { accountId, role: 'assistant', content: reply, createdAt: assistantAt },
  ])

  const requiresConfirmation = intent.kind !== 'query'

  // Parse council Pals (graceful: [] on any failure).
  const VALID_PALS = ['moneypal', 'healthpal', 'studypal']
  let pals: { palId: string; line: string }[] = []
  if (councilResult.status === 'fulfilled') {
    try {
      const raw = councilResult.value.choices[0]?.message?.content ?? '{}'
      const obj = JSON.parse(raw) as { pals?: { palId?: string; line?: string }[] }
      pals = (obj.pals ?? [])
        .filter((p) => p.palId && p.line && VALID_PALS.includes(p.palId))
        .slice(0, 3)
        .map((p) => ({ palId: p.palId as string, line: p.line as string }))
    } catch {
      pals = []
    }
  }

  logger.info(
    { accountId, intentKind: intent.kind, requiresConfirmation, pals: pals.length },
    'chat.message',
  )

  return c.json({
    reply,
    pals,
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
        kind: z.enum(['add_chore', 'topup', 'set_goal', 'contribute_goal', 'send_note', 'create_rule', 'remember']),
        // The intent parser (and the LLM behind it) may emit `null` for fields it
        // can't fill, so accept null/undefined and coerce numbers. Domain guards
        // below turn any genuinely-missing field into a friendly error.
        kidName: z.string().nullish(),
        kidAccountId: z.string().uuid().nullish(),
        title: z.string().nullish(),
        rewardBrains: z.coerce.number().int().positive().nullish(),
        brainsDelta: z.coerce.number().int().positive().nullish(),
        note: z.string().nullish(),
        goalName: z.string().nullish(),
        targetBrains: z.coerce.number().int().positive().nullish(),
        message: z.string().max(500).nullish(),
        ruleText: z.string().max(300).nullish(),
        fact: z.string().max(300).nullish(),
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
      confirmationMessage: `Chore "${chore.title}" added for ${intent.kidName ?? 'kid'} — $${chore.rewardBrains} reward.`,
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
      confirmationMessage: `Added $${intent.brainsDelta} to ${intent.kidName ?? 'kid'}\u2019s wallet. New balance: $${balanceAfter}.`,
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
      confirmationMessage: `Goal "${goal.name}" set for ${intent.kidName ?? 'kid'} — $${goal.targetBrains} target.`,
    })
  }

  // ── contribute_goal ──────────────────────────────────────────────────
  // Add Brains of progress toward a kid's existing savings goal. A parent can
  // do it for any kid; a kid can do it for their own goal.
  if (intent.kind === 'contribute_goal') {
    if (!intent.kidAccountId) return c.json({ error: 'kid_not_found' }, 400)
    if (!intent.brainsDelta) return c.json({ error: 'amount_required' }, 400)
    if (!isParent && intent.kidAccountId !== actorId) return c.json({ error: 'not_allowed' }, 403)

    const [goal] = await db
      .select()
      .from(goals)
      .where(
        intent.goalName
          ? and(eq(goals.accountId, intent.kidAccountId), eq(goals.status, 'active'), ilike(goals.name, `%${intent.goalName}%`))
          : and(eq(goals.accountId, intent.kidAccountId), eq(goals.status, 'active')),
      )
      .orderBy(desc(goals.createdAt))
      .limit(1)

    if (!goal) return c.json({ error: 'goal_not_found' }, 404)

    const current = goal.currentBrains + intent.brainsDelta
    const completed = current >= goal.targetBrains
    await db
      .update(goals)
      .set({ currentBrains: current, status: completed ? 'completed' : 'active', completedAt: completed ? new Date() : null })
      .where(eq(goals.id, goal.id))

    const [kidAcct] = await db
      .select({ cachedBalance: accounts.cachedBalance })
      .from(accounts)
      .where(eq(accounts.id, intent.kidAccountId))
      .limit(1)

    await db.insert(ledger).values({
      familyId,
      accountId: intent.kidAccountId,
      actorId,
      kind: 'goal_lock',
      brainsDelta: intent.brainsDelta,
      balanceAfter: kidAcct?.cachedBalance ?? 0,
      metadata: { goalId: goal.id, source: 'chat_goal' },
    })

    logger.info({ goalId: goal.id, brainsDelta: intent.brainsDelta, via: 'chat' }, 'chat.execute.contribute_goal')
    return c.json({
      ok: true,
      kind: 'contribute_goal',
      result: { goalId: goal.id, currentBrains: current, completed },
      confirmationMessage: completed
        ? `🎉 ${intent.kidName ?? 'They'} reached the "${goal.name}" goal! Added $${intent.brainsDelta}.`
        : `Added $${intent.brainsDelta} toward ${intent.kidName ?? 'their'} "${goal.name}" — $${current} of $${goal.targetBrains}.`,
    })
  }

  // ── send_note ─────────────────────────────────────────────────────────
  // Drop a message into a kid's in-app inbox.
  if (intent.kind === 'send_note') {
    if (!isParent) return c.json({ error: 'only_parents_can_send_notes' }, 403)
    if (!intent.kidAccountId) return c.json({ error: 'kid_not_found' }, 400)
    if (!intent.message) return c.json({ error: 'message_required' }, 400)

    const [kidMember] = await db
      .select({ familyId: memberships.familyId })
      .from(memberships)
      .where(eq(memberships.accountId, intent.kidAccountId))
      .limit(1)
    if (!kidMember || kidMember.familyId !== familyId) return c.json({ error: 'kid_not_in_family' }, 403)

    await db.insert(inbox).values({
      accountId: intent.kidAccountId,
      kind: 'message',
      title: 'A message from your parent',
      body: intent.message,
      metadata: { fromAccountId: actorId, source: 'chat' },
    })

    logger.info({ kidAccountId: intent.kidAccountId, via: 'chat' }, 'chat.execute.send_note')
    return c.json({
      ok: true,
      kind: 'send_note',
      confirmationMessage: `Sent ${intent.kidName ?? 'your kid'} your message.`,
    })
  }

  // ── create_rule ───────────────────────────────────────────────────────
  // Record a family rule / limit (parents only).
  if (intent.kind === 'create_rule') {
    if (!isParent) return c.json({ error: 'only_parents_can_set_rules' }, 403)
    if (!intent.ruleText) return c.json({ error: 'rule_required' }, 400)

    const [rule] = await db
      .insert(familyRules)
      .values({ familyId, kind: 'custom', value: { text: intent.ruleText }, status: 'confirmed', createdBy: actorId })
      .returning()

    logger.info({ ruleId: rule.id, via: 'chat' }, 'chat.execute.create_rule')
    return c.json({
      ok: true,
      kind: 'create_rule',
      result: { rule },
      confirmationMessage: `Added a family rule: "${intent.ruleText}".`,
    })
  }

  // ── remember ──────────────────────────────────────────────────────────
  // Save a personal memory fact PAL can use later. Subject defaults to caller.
  if (intent.kind === 'remember') {
    if (!intent.fact) return c.json({ error: 'fact_required' }, 400)
    const subjectId = intent.kidAccountId ?? actorId

    await db.insert(memoryFacts).values({
      familyId,
      accountId: subjectId,
      layer: 'personal',
      key: 'note',
      value: { text: intent.fact },
      source: 'chat',
      status: 'confirmed',
      confirmedBy: actorId,
      confirmedAt: new Date(),
    })

    logger.info({ subjectId, via: 'chat' }, 'chat.execute.remember')
    return c.json({
      ok: true,
      kind: 'remember',
      confirmationMessage: intent.kidName
        ? `Got it — I'll remember that about ${intent.kidName}.`
        : `Got it — I'll remember that.`,
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
    // desc(createdAt) gets the newest rows for the limit; we reverse() below to
    // display oldest-first. The asc(role) tiebreaker makes same-timestamp pairs
    // come back as [assistant, user] pre-reverse, so they render [user, assistant].
    .orderBy(desc(chatMessages.createdAt), asc(chatMessages.role))
    .limit(limit)

  return c.json({ messages: messages.reverse() })
})

// ─── DELETE /chat/history ─────────────────────────────────────────────
// Clears all chat messages for the current account. Scoped to the
// authenticated account only — a user can never delete another's chat.
chat.delete('/chat/history', async (c) => {
  const accountId = authedAccountId(c)

  const deleted = await db
    .delete(chatMessages)
    .where(eq(chatMessages.accountId, accountId))
    .returning({ id: chatMessages.id })

  logger.info({ accountId, count: deleted.length }, 'chat.history.cleared')
  return c.json({ ok: true, cleared: deleted.length })
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
