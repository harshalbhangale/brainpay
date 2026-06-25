import { Hono } from 'hono'
import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import OpenAI from 'openai'
import { db } from '../db'
import { accounts, ledger, memberships } from '../db/schema'
import {
  studyCards,
  studyDocuments,
  studyInterviews,
  studyQuizzes,
  studyStreaks,
  studyTopics,
} from '../db/study-schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { processDocument } from '../services/study-pipeline'
import { generateTutorSpeech } from '../services/study-tutor-voice'
import { awardStudyBrains, STUDY_REWARD_AMOUNTS } from '../services/study-rewards'
import { createInterviewConversation, tavusConfigured } from '../services/tavus'
import { completeInterview } from '../services/tavus-interview'
import { loadEnv } from '../env'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const study = new Hono<{ Variables: AuthVars }>()
study.use('*', requireAuth)

// ─── Helper: get familyId ─────────────────────────────────────────────
async function getFamilyId(accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  return row?.familyId ?? null
}

// ═══════════════════════════════════════════════════════════════════════
// TOPICS
// ═══════════════════════════════════════════════════════════════════════

study.post('/study/topics', async (c) => {
  const accountId = authedAccountId(c)
  const familyId = await getFamilyId(accountId)
  if (!familyId) return c.json({ error: 'no_family' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    title: z.string().min(1).max(200).trim(),
    emoji: z.string().max(10).default('📚'),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)

  const [topic] = await db.insert(studyTopics).values({
    accountId,
    familyId,
    title: parsed.data.title,
    emoji: parsed.data.emoji,
  }).returning()

  return c.json({ topic }, 201)
})

study.get('/study/topics', async (c) => {
  const accountId = authedAccountId(c)

  const topics = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.accountId, accountId), eq(studyTopics.status, 'active')))
    .orderBy(desc(studyTopics.createdAt))

  return c.json({ topics })
})

study.get('/study/topics/:id', async (c) => {
  const accountId = authedAccountId(c)
  const id = c.req.param('id')

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, id), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'not_found' }, 404)

  const docs = await db
    .select()
    .from(studyDocuments)
    .where(eq(studyDocuments.topicId, id))
    .orderBy(desc(studyDocuments.createdAt))

  const cardsDue = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studyCards)
    .where(and(eq(studyCards.topicId, id), lte(studyCards.nextReviewAt, new Date())))

  return c.json({ topic, documents: docs, cardsDue: cardsDue[0]?.count ?? 0 })
})

// ═══════════════════════════════════════════════════════════════════════
// DOCUMENTS (upload)
// ═══════════════════════════════════════════════════════════════════════

study.post('/study/topics/:id/documents', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  // Verify topic ownership
  const [topic] = await db
    .select({ id: studyTopics.id })
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    title: z.string().min(1).max(200).trim(),
    fileUrl: z.string().min(1),
    fileType: z.enum(['pdf', 'image', 'text', 'file']),
    fileSize: z.number().int().min(0).default(0),
    content: z.string().optional(), // For 'text'/'file' type: raw content directly
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)

  const [doc] = await db.insert(studyDocuments).values({
    topicId,
    accountId,
    title: parsed.data.title,
    fileUrl: parsed.data.fileUrl,
    fileType: parsed.data.fileType,
    fileSize: parsed.data.fileSize,
    processingStatus: 'pending',
  }).returning()

  // Kick off async processing (non-blocking)
  processDocument(doc.id, parsed.data.content).catch(() => undefined)

  return c.json({ document: doc }, 201)
})

study.get('/study/topics/:id/documents', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const docs = await db
    .select()
    .from(studyDocuments)
    .where(and(eq(studyDocuments.topicId, topicId), eq(studyDocuments.accountId, accountId)))
    .orderBy(desc(studyDocuments.createdAt))

  return c.json({ documents: docs })
})

// POST /study/topics/:id/regenerate — rebuild concepts from current materials.
// Replaces non-bookmarked cards; bookmarked cards are preserved.
study.post('/study/topics/:id/regenerate', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  // Drop all non-bookmarked cards for this topic (keep saved ones).
  await db
    .delete(studyCards)
    .where(and(eq(studyCards.topicId, topicId), eq(studyCards.bookmarked, false)))

  // Recount surviving (bookmarked) cards.
  const [{ count: kept }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studyCards)
    .where(eq(studyCards.topicId, topicId))

  await db
    .update(studyTopics)
    .set({ totalCards: kept, cardsDue: kept })
    .where(eq(studyTopics.id, topicId))

  // Re-process every ready document to regenerate fresh cards (async).
  const docs = await db
    .select()
    .from(studyDocuments)
    .where(eq(studyDocuments.topicId, topicId))

  if (docs.length > 0) {
    for (const doc of docs) {
      processDocument(doc.id).catch(() => undefined)
    }
  } else {
    // No materials — generate from the topic title alone.
    const content = `Generate key concepts, important definitions, formulas, and study material for: ${topic.title}. Cover the most important topics a student should know.`
    const [doc] = await db.insert(studyDocuments).values({
      topicId,
      accountId,
      title: `${topic.title} concepts`,
      fileUrl: 'text://inline',
      fileType: 'text',
      processingStatus: 'pending',
    }).returning()
    processDocument(doc.id, content).catch(() => undefined)
  }

  return c.json({ ok: true, keptBookmarked: kept })
})

// POST /study/topics/:id/chat — text chat grounded in this topic's concepts.
study.post('/study/topics/:id/chat', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    message: z.string().min(1).max(2000),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
      .max(20)
      .default([]),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  // Ground the tutor in this topic's concept cards.
  const cards = await db
    .select({ front: studyCards.front, back: studyCards.back })
    .from(studyCards)
    .where(eq(studyCards.topicId, topicId))
    .limit(40)

  const conceptContext = cards.length
    ? cards.map((c) => `- ${c.front}: ${c.back}`).join('\n')
    : '(No concepts generated yet — answer from general knowledge of the topic.)'

  const system = `You are a friendly, patient study tutor helping a student learn "${topic.title}".
Answer their questions clearly and simply, like a kind teacher for an 8-14 year old.
Prefer the study material below when relevant; you may add helpful context, but stay accurate.
Keep answers concise (2-5 sentences) unless they ask for more. Encourage them.

STUDY MATERIAL FOR THIS TOPIC:
${conceptContext}`

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        ...parsed.data.history.map((m) => ({ role: m.role, content: m.content }) as const),
        { role: 'user', content: parsed.data.message },
      ],
      max_tokens: 500,
      temperature: 0.5,
    })
    const reply = resp.choices[0]?.message?.content?.trim() || "Hmm, I'm not sure — can you ask that another way?"
    return c.json({ reply })
  } catch {
    return c.json({ error: 'chat_failed' }, 502)
  }
})

// ═══════════════════════════════════════════════════════════════════════
// CARDS (list + review)
// ═══════════════════════════════════════════════════════════════════════

study.get('/study/topics/:id/cards', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')
  const dueOnly = c.req.query('due') === 'true'
  const bookmarkedOnly = c.req.query('bookmarked') === 'true'

  const conditions = [eq(studyCards.topicId, topicId), eq(studyCards.accountId, accountId)]
  if (dueOnly) conditions.push(lte(studyCards.nextReviewAt, new Date()))
  if (bookmarkedOnly) conditions.push(eq(studyCards.bookmarked, true))

  const cards = await db
    .select()
    .from(studyCards)
    .where(and(...conditions))
    .orderBy(studyCards.nextReviewAt)
    .limit(50)

  return c.json({ cards })
})

// POST /study/cards/:id/bookmark — toggle (or set) a card's bookmark
study.post('/study/cards/:id/bookmark', async (c) => {
  const accountId = authedAccountId(c)
  const cardId = c.req.param('id')

  const [card] = await db
    .select({ id: studyCards.id, bookmarked: studyCards.bookmarked })
    .from(studyCards)
    .where(and(eq(studyCards.id, cardId), eq(studyCards.accountId, accountId)))
    .limit(1)
  if (!card) return c.json({ error: 'not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ bookmarked: z.boolean().optional() }).safeParse(body)
  const next = parsed.success && typeof parsed.data.bookmarked === 'boolean' ? parsed.data.bookmarked : !card.bookmarked

  await db.update(studyCards).set({ bookmarked: next }).where(eq(studyCards.id, cardId))
  return c.json({ ok: true, bookmarked: next })
})

// GET /study/cards/due — all due cards across topics
study.get('/study/cards/due', async (c) => {
  const accountId = authedAccountId(c)

  const cards = await db
    .select()
    .from(studyCards)
    .where(and(eq(studyCards.accountId, accountId), lte(studyCards.nextReviewAt, new Date())))
    .orderBy(studyCards.nextReviewAt)
    .limit(50)

  return c.json({ cards, count: cards.length })
})

// POST /study/cards/:id/review — submit review result (SM-2)
study.post('/study/cards/:id/review', async (c) => {
  const accountId = authedAccountId(c)
  const cardId = c.req.param('id')

  const body = await c.req.json().catch(() => ({}))
  // quality: 0=blackout, 1=wrong, 2=hard, 3=ok, 4=easy, 5=perfect
  const parsed = z.object({ quality: z.number().int().min(0).max(5) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const { quality } = parsed.data

  const [card] = await db
    .select()
    .from(studyCards)
    .where(and(eq(studyCards.id, cardId), eq(studyCards.accountId, accountId)))
    .limit(1)
  if (!card) return c.json({ error: 'not_found' }, 404)

  // SM-2 algorithm
  let ef = parseFloat(card.easeFactor as string)
  let interval = card.interval
  let reviewCount = card.reviewCount + 1

  if (quality < 3) {
    // Failed — reset
    interval = 0
    reviewCount = 0
  } else {
    if (card.interval === 0) interval = 1
    else if (card.interval === 1) interval = 6
    else interval = Math.round(card.interval * ef)
  }

  // Update ease factor
  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (ef < 1.3) ef = 1.3

  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + Math.max(interval, 1))

  const status = quality >= 4 && reviewCount >= 3 ? 'mastered' : quality < 3 ? 'learning' : card.status === 'new' ? 'learning' : card.status

  await db.update(studyCards).set({
    easeFactor: ef.toFixed(2),
    interval,
    reviewCount,
    nextReviewAt,
    lastReviewedAt: new Date(),
    difficulty: quality,
    status,
  }).where(eq(studyCards.id, cardId))

  // Update streak
  await updateStreak(accountId)

  // Award brains for review session milestone (10+ cards in a session = same day)
  const familyId = await getFamilyId(accountId)
  if (familyId) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [reviewed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyCards)
      .where(and(eq(studyCards.accountId, accountId), sql`${studyCards.lastReviewedAt} >= ${today}`))
    if (reviewed?.count === 10) {
      await awardStudyBrains(accountId, familyId, 'study_review_session', STUDY_REWARD_AMOUNTS.study_review_session, { reviewedToday: 10 })
    }
  }

  return c.json({ ok: true, nextReviewAt, interval, status })
})

// ═══════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════

study.get('/study/stats', async (c) => {
  const accountId = authedAccountId(c)

  const [streak] = await db
    .select()
    .from(studyStreaks)
    .where(eq(studyStreaks.accountId, accountId))
    .limit(1)

  const [dueCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studyCards)
    .where(and(eq(studyCards.accountId, accountId), lte(studyCards.nextReviewAt, new Date())))

  const [topicCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studyTopics)
    .where(and(eq(studyTopics.accountId, accountId), eq(studyTopics.status, 'active')))

  const [mastered] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studyCards)
    .where(and(eq(studyCards.accountId, accountId), eq(studyCards.status, 'mastered')))

  return c.json({
    streak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    cardsDue: dueCount?.count ?? 0,
    topicsActive: topicCount?.count ?? 0,
    cardsMastered: mastered?.count ?? 0,
  })
})

// ─── Helper: update study streak ──────────────────────────────────────
async function updateStreak(accountId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [existing] = await db
    .select()
    .from(studyStreaks)
    .where(eq(studyStreaks.accountId, accountId))
    .limit(1)

  if (!existing) {
    await db.insert(studyStreaks).values({ accountId, currentStreak: 1, longestStreak: 1, lastStudyDate: new Date() })
    return
  }

  const lastDate = existing.lastStudyDate ? new Date(existing.lastStudyDate) : null
  if (lastDate) lastDate.setHours(0, 0, 0, 0)

  if (lastDate && lastDate.getTime() === today.getTime()) return // Already counted today

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const newStreak = lastDate && lastDate.getTime() === yesterday.getTime()
    ? existing.currentStreak + 1
    : 1

  await db.update(studyStreaks).set({
    currentStreak: newStreak,
    longestStreak: Math.max(newStreak, existing.longestStreak),
    lastStudyDate: new Date(),
    updatedAt: new Date(),
  }).where(eq(studyStreaks.id, existing.id))

  // Award brains for 7-day streak milestone
  if (newStreak === 7 || (newStreak > 7 && newStreak % 7 === 0)) {
    const familyId = await getFamilyId(accountId)
    if (familyId) {
      await awardStudyBrains(accountId, familyId, 'study_streak', STUDY_REWARD_AMOUNTS.study_streak, { streak: newStreak })
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INTERVIEWS (Tavus video tutor — chapter-scoped)
// ═══════════════════════════════════════════════════════════════════════

// GET /study/topics/:id/chapters — concept chapters with progress, for the
// chapter picker before an interview.
study.get('/study/topics/:id/chapters', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const [topic] = await db
    .select({ id: studyTopics.id })
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  const rows = await db
    .select({
      chapter: studyCards.chapter,
      total: sql<number>`count(*)::int`,
      due: sql<number>`count(*) filter (where ${studyCards.nextReviewAt} <= now())::int`,
      mastered: sql<number>`count(*) filter (where ${studyCards.status} = 'mastered')::int`,
    })
    .from(studyCards)
    .where(and(eq(studyCards.topicId, topicId), eq(studyCards.accountId, accountId)))
    .groupBy(studyCards.chapter)

  const chapters = rows.map((r) => ({
    chapter: r.chapter ?? 'General',
    total: r.total,
    due: r.due,
    mastered: r.mastered,
  }))

  return c.json({ chapters })
})

study.post('/study/topics/:id/interview', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    chapter: z.string().min(1).max(200).optional(),
    conceptIds: z.array(z.string().uuid()).max(20).optional(),
    proctor: z.boolean().optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
  const { chapter, conceptIds } = parsed.data

  // Determine scope + select the concepts to probe.
  const mode: 'chapter' | 'concept' | 'viva' = conceptIds?.length ? 'concept' : chapter ? 'chapter' : 'viva'
  const conds = [eq(studyCards.topicId, topicId), eq(studyCards.accountId, accountId)]
  if (chapter) conds.push(eq(studyCards.chapter, chapter))
  if (mode === 'viva') conds.push(sql`${studyCards.status} != 'mastered'`)
  if (conceptIds?.length) conds.push(sql`${studyCards.id} = ANY(${conceptIds})`)

  const cards = await db
    .select({ front: studyCards.front, back: studyCards.back })
    .from(studyCards)
    .where(and(...conds))
    .limit(mode === 'viva' ? 20 : 12)

  const focusAreas = cards.map((cd) => cd.front)
  // Proctor on for tests (chapter/viva) by default; off for quick concept practice.
  const proctor = parsed.data.proctor ?? mode !== 'concept'

  const [interview] = await db.insert(studyInterviews).values({
    topicId,
    accountId,
    focusAreas,
    chapter: chapter ?? null,
    mode,
  }).returning()

  // No Tavus configured → tell the client to use the legacy voice tutor.
  if (!tavusConfigured()) {
    return c.json({ interviewId: interview.id, provider: 'legacy', mode, chapter: chapter ?? null }, 201)
  }

  // Pull the kid's name/grade for a personal greeting + context.
  const [acct] = await db
    .select({ persona: accounts.persona })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
  const persona = (acct?.persona ?? {}) as Record<string, unknown>
  const kidName = typeof persona.name === 'string' ? persona.name : null
  const grade = typeof persona.grade === 'string' ? persona.grade : null

  const env = loadEnv()
  const callbackUrl = env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/study/tavus/webhook${env.TAVUS_WEBHOOK_SECRET ? `?key=${encodeURIComponent(env.TAVUS_WEBHOOK_SECRET)}` : ''}`
    : undefined

  try {
    const conv = await createInterviewConversation({
      topicTitle: topic.title,
      chapter: chapter ?? null,
      kidName,
      grade,
      concepts: cards,
      proctor,
      maxDurationSecs: mode === 'viva' ? 480 : 360,
      callbackUrl,
    })
    await db
      .update(studyInterviews)
      .set({ tavusConversationId: conv.conversationId, tavusConversationUrl: conv.conversationUrl })
      .where(eq(studyInterviews.id, interview.id))

    return c.json(
      {
        interviewId: interview.id,
        provider: 'tavus',
        conversationUrl: conv.conversationUrl,
        conversationId: conv.conversationId,
        token: conv.token ?? null,
        mode,
        chapter: chapter ?? null,
        proctor,
      },
      201,
    )
  } catch (err) {
    // Graceful fallback — never dead-end the kid; use the legacy voice tutor.
    logger.warn({ err: String(err).slice(0, 200), interviewId: interview.id }, 'study.tavus_create_failed')
    return c.json({ interviewId: interview.id, provider: 'legacy', mode, chapter: chapter ?? null }, 201)
  }
})

study.post('/study/interviews/:id/complete', async (c) => {
  const accountId = authedAccountId(c)
  const interviewId = c.req.param('id')

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    transcript: z.array(z.object({ role: z.string(), text: z.string() })).default([]),
    score: z.number().int().min(1).max(10).optional(),
    durationSecs: z.number().int().min(0).default(0),
    summary: z.string().max(500).optional(),
    keepPractising: z.array(z.string().max(200)).max(5).optional(),
    focus: z
      .object({
        lookingPct: z.number().min(0).max(100).optional(),
        flags: z.array(z.string().max(120)).max(10).optional(),
        notes: z.string().max(500).optional(),
      })
      .optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const result = await completeInterview(interviewId, accountId, parsed.data)
  if ('error' in result) {
    return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403)
  }
  return c.json(result)
})

// ═══════════════════════════════════════════════════════════════════════
// NUDGE CHECK (cron endpoint)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// TUTOR VOICE (ElevenLabs TTS)
// ═══════════════════════════════════════════════════════════════════════

// POST /study/tts — generate tutor speech for card reading or feedback
study.post('/study/tts', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const text = (body as { text?: string }).text
  if (!text || text.length > 500) return c.json({ error: 'text required (max 500 chars)' }, 400)

  try {
    const { audio, contentType } = await generateTutorSpeech(text)
    return new Response(audio, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } })
  } catch (err) {
    return c.json({ error: 'tts_failed' }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════════
// QUIZZES
// ═══════════════════════════════════════════════════════════════════════

// POST /study/topics/:id/quiz — generate a quiz from the topic's cards
study.post('/study/topics/:id/quiz', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  const cards = await db
    .select({ front: studyCards.front, back: studyCards.back })
    .from(studyCards)
    .where(eq(studyCards.topicId, topicId))
    .limit(30)

  if (cards.length < 3) return c.json({ error: 'not_enough_cards', message: 'Need at least 3 cards to generate a quiz' }, 400)

  const cardContent = cards.map((c) => `Q: ${c.front}\nA: ${c.back}`).join('\n\n')

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Generate a multiple-choice quiz for a student based on their study cards. Return JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correctAnswer":"A","concept":"..."}]}. Generate 5-10 questions. Each question has exactly 4 options labeled by the option text. correctAnswer must be the exact text of the correct option. concept is a short label of what the question tests.`,
      },
      { role: 'user', content: cardContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })

  let questions: { question: string; options: string[]; correctAnswer: string; concept: string }[] = []
  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    questions = Array.isArray(parsed.questions) ? parsed.questions : []
  } catch {
    return c.json({ error: 'generation_failed' }, 500)
  }

  if (questions.length === 0) return c.json({ error: 'generation_failed' }, 500)

  const [quiz] = await db.insert(studyQuizzes).values({
    topicId,
    accountId,
    questionCount: questions.length,
    questions: questions.map((q) => ({ ...q, kidAnswer: null, isCorrect: null })),
    status: 'in_progress',
  }).returning()

  return c.json({ quiz: { ...quiz, questions } }, 201)
})

// POST /study/quizzes/:id/submit — grade a completed quiz
study.post('/study/quizzes/:id/submit', async (c) => {
  const accountId = authedAccountId(c)
  const quizId = c.req.param('id')

  const [quiz] = await db
    .select()
    .from(studyQuizzes)
    .where(and(eq(studyQuizzes.id, quizId), eq(studyQuizzes.accountId, accountId)))
    .limit(1)
  if (!quiz) return c.json({ error: 'not_found' }, 404)
  if (quiz.status === 'completed') return c.json({ error: 'already_submitted' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    answers: z.array(z.object({ questionIndex: z.number().int().min(0), answer: z.string() })),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const questions = quiz.questions as { question: string; options: string[]; correctAnswer: string; concept: string; kidAnswer: string | null; isCorrect: boolean | null }[]
  let correctCount = 0
  const weakConcepts: string[] = []

  for (const { questionIndex, answer } of parsed.data.answers) {
    if (questionIndex >= questions.length) continue
    const q = questions[questionIndex]
    const isCorrect = q.correctAnswer === answer
    q.kidAnswer = answer
    q.isCorrect = isCorrect
    if (isCorrect) correctCount++
    else if (q.concept && !weakConcepts.includes(q.concept)) weakConcepts.push(q.concept)
  }

  const scorePct = Math.round((correctCount / quiz.questionCount) * 100)

  // Calculate brains earned
  let brainsEarned = 0
  if (scorePct === 100) brainsEarned = STUDY_REWARD_AMOUNTS.study_quiz_perfect
  else if (scorePct >= 80) brainsEarned = STUDY_REWARD_AMOUNTS.study_quiz_pass

  await db.update(studyQuizzes).set({
    correctCount,
    scorePct,
    weakConcepts,
    brainsEarned,
    questions,
    status: 'completed',
    completedAt: new Date(),
  }).where(eq(studyQuizzes.id, quizId))

  // Award brains
  if (brainsEarned > 0) {
    const familyId = await getFamilyId(accountId)
    if (familyId) {
      const kind = scorePct === 100 ? 'study_quiz_perfect' as const : 'study_quiz_pass' as const
      await awardStudyBrains(accountId, familyId, kind, brainsEarned, { quizId, scorePct })
    }
  }

  return c.json({ ok: true, correctCount, scorePct, brainsEarned, weakConcepts, questions })
})
