import { Hono } from 'hono'
import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { memberships } from '../db/schema'
import {
  studyCards,
  studyDocuments,
  studyStreaks,
  studyTopics,
} from '../db/study-schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { processDocument } from '../services/study-pipeline'
import { generateTutorSpeech } from '../services/study-tutor-voice'

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
    fileType: z.enum(['pdf', 'image', 'text']),
    fileSize: z.number().int().min(0).default(0),
    content: z.string().optional(), // For 'text' type: raw content directly
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

// ═══════════════════════════════════════════════════════════════════════
// CARDS (list + review)
// ═══════════════════════════════════════════════════════════════════════

study.get('/study/topics/:id/cards', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')
  const dueOnly = c.req.query('due') === 'true'

  const conditions = [eq(studyCards.topicId, topicId), eq(studyCards.accountId, accountId)]
  if (dueOnly) conditions.push(lte(studyCards.nextReviewAt, new Date()))

  const cards = await db
    .select()
    .from(studyCards)
    .where(and(...conditions))
    .orderBy(studyCards.nextReviewAt)
    .limit(50)

  return c.json({ cards })
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
}

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
