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
import { processDocument } from '../services/study-pipeline'
import { generateTutorSpeech } from '../services/study-tutor-voice'
import { awardStudyBrains, STUDY_REWARD_AMOUNTS } from '../services/study-rewards'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const study = new Hono<{ Variables: AuthVars }>()

// ── Public/cron endpoints (no auth) ───────────────────────────────────
study.post('/study/nudge-check', async (c) => {
  const cronKey = c.req.header('X-Cron-Key')
  if (cronKey !== 'brainpal-internal-cron-2024') {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const { checkAndSendStudyNudges } = await import('../services/study-nudges')
  const count = await checkAndSendStudyNudges()
  return c.json({ ok: true, nudgesSent: count })
})

// ── Auth-gated endpoints ──────────────────────────────────────────────
study.use('/study/*', requireAuth)

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
// INTERVIEWS (voice study tutor)
// ═══════════════════════════════════════════════════════════════════════

study.post('/study/topics/:id/interview', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')

  const [topic] = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  // Get weak concepts (cards not yet mastered)
  const weakCards = await db
    .select({ front: studyCards.front, back: studyCards.back })
    .from(studyCards)
    .where(and(eq(studyCards.topicId, topicId), sql`${studyCards.status} != 'mastered'`))
    .limit(20)

  const focusAreas = weakCards.map((c) => c.front)

  const [interview] = await db.insert(studyInterviews).values({
    topicId,
    accountId,
    focusAreas,
  }).returning()

  const conceptList = weakCards.map((c) => `- Q: ${c.front}\n  A: ${c.back}`).join('\n')

  const systemPrompt = `You are a friendly, encouraging study tutor helping a kid review "${topic.title}". Your job is to ask them to explain concepts in their own words, then probe deeper with follow-up questions. Be conversational, use simple language, and celebrate when they get things right. If they struggle, give gentle hints rather than the answer directly.

Focus on these concepts the kid hasn't mastered yet:
${conceptList || '(No specific weak areas — do a general review of the topic)'}

Rules:
- Ask ONE question at a time
- Wait for their response before asking the next
- Keep responses short (2-3 sentences max)
- Use encouraging language ("Great thinking!", "Almost there!")
- After 3-5 questions, wrap up with a brief summary of how they did`

  return c.json({ interviewId: interview.id, systemPrompt }, 201)
})

study.post('/study/interviews/:id/complete', async (c) => {
  const accountId = authedAccountId(c)
  const interviewId = c.req.param('id')

  const [interview] = await db
    .select()
    .from(studyInterviews)
    .where(and(eq(studyInterviews.id, interviewId), eq(studyInterviews.accountId, accountId)))
    .limit(1)
  if (!interview) return c.json({ error: 'not_found' }, 404)
  if (interview.status === 'completed') return c.json({ error: 'already_completed' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    transcript: z.array(z.object({ role: z.string(), text: z.string() })).default([]),
    score: z.number().int().min(1).max(10).optional(),
    durationSecs: z.number().int().min(0).default(0),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const brainsEarned = Math.max(5, Math.min(25, (parsed.data.score ?? 5) * 3))

  await db.update(studyInterviews).set({
    status: 'completed',
    transcript: parsed.data.transcript,
    score: parsed.data.score ?? null,
    durationSecs: parsed.data.durationSecs,
    brainsEarned,
    completedAt: new Date(),
  }).where(eq(studyInterviews.id, interviewId))

  // Award brains
  const familyId = await getFamilyId(accountId)
  if (familyId) {
    await db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ cachedBalance: sql`${accounts.cachedBalance} + ${brainsEarned}` })
        .where(eq(accounts.id, accountId))
      await tx.insert(ledger).values({
        familyId,
        accountId,
        actorId: accountId,
        kind: 'study_interview',
        brainsDelta: brainsEarned,
        balanceAfter: sql`(select cached_balance from accounts where id = ${accountId})`,
        metadata: { interviewId, topicId: interview.topicId },
      })
    })
  }

  return c.json({ ok: true, brainsEarned, score: parsed.data.score })
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
