import { Hono } from 'hono'
import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import OpenAI from 'openai'
import { db } from '../db'
import { accounts, families, ledger, memberships } from '../db/schema'
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
import { resolveReadUrl } from '../services/storage'
import { generateTutorSpeech } from '../services/study-tutor-voice'
import { awardStudyBrains, resolveStudyRewards, getFamilyPrimaryParent, DEFAULT_STUDY_REWARDS, type StudyRewardConfig } from '../services/study-rewards'
import { createInterviewConversation, tavusConfigured } from '../services/tavus'
import { createAvatarSession, runwayConfigured, attachAvatarKnowledge, pickAvatarId } from '../services/runway-avatar'
import { generateBlueprint } from '../services/interview-blueprint'
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

/**
 * Family id for the account, creating a personal household if none exists.
 * Solo accounts (e.g. a kid who signed up without a parent invite) otherwise
 * have no membership, which used to 403 every family-scoped feature (StudyPal,
 * chores). We provision a personal family so nothing dead-ends.
 */
async function getOrCreateFamilyId(accountId: string): Promise<string> {
  const existing = await getFamilyId(accountId)
  if (existing) return existing

  const [acct] = await db
    .select({ persona: accounts.persona })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
  const name = ((acct?.persona as Record<string, unknown> | null)?.name as string) || 'My'

  const [fam] = await db.insert(families).values({ name: `${name}'s Family`, avatar: '🏡' }).returning()
  await db.insert(memberships).values({ familyId: fam.id, accountId, role: 'primary_parent' })
  return fam.id
}

// ═══════════════════════════════════════════════════════════════════════
// TOPICS
// ═══════════════════════════════════════════════════════════════════════

const INTAKE_SYSTEM = `You are StudyPal, a warm, sharp study coach for a school kid in AUSTRALIA. In the first ~20 seconds learn just enough to be useful WITHOUT a form.
GOAL: infer { grade, school?, city?, curriculum, subjects[] } from minimal input.
RULES:
- Ask at most TWO questions. Start: "Which school and grade are you in?"
- Infer the AU curriculum from city/state/school. Australia uses ACARA nationally with state variants: NSW, VIC, QLD, WA, SA, TAS, ACT, NT. If unsure, ask ONE short follow-up: "Which state are you in?"
- Normalise grade like "Grade 8" (accept "year 8"/"8th"/"class 8" -> "Grade 8").
- From grade + curriculum, GENERATE the subject list yourself (don't ask the kid to list subjects). Present subjects as tappable chips. Use Australian subject names (English, Mathematics, Science, History, Geography, HASS, Health & PE, Digital Technologies, The Arts; senior: Mathematics Methods, Physics, Chemistry, Biology, Modern History, Economics).
- Warm, brief, age-appropriate. No baby talk, no gratuitous praise.
- When a subject is chosen, offer modes: Study concepts / Quiz / Mock interview.
Return JSON: { "reply": "...", "profile": { "grade": "...", "state": "...", "curriculum": "ACARA/NSW/...", "subjects": ["..."] }, "chips": ["..."], "stage": "intake|subject_chosen|mode_chosen" }`

// AU grounding (extendable): major cities -> state, so "Sydney" resolves even
// when the kid never names the state; and state -> curriculum label.
const AU_STATE_BY_CITY: Record<string, string> = {
  sydney: 'NSW', newcastle: 'NSW', wollongong: 'NSW',
  melbourne: 'VIC', geelong: 'VIC', ballarat: 'VIC',
  brisbane: 'QLD', goldcoast: 'QLD', cairns: 'QLD', townsville: 'QLD',
  perth: 'WA', fremantle: 'WA',
  adelaide: 'SA',
  hobart: 'TAS', launceston: 'TAS',
  canberra: 'ACT',
  darwin: 'NT',
}
const AU_CURRICULUM_BY_STATE: Record<string, string> = {
  NSW: 'NSW (ACARA)', VIC: 'VIC F-10 / VCE (ACARA)', QLD: 'QLD (ACARA)', WA: 'WA (ACARA)',
  SA: 'SA (ACARA)', TAS: 'TAS (ACARA)', ACT: 'ACT (ACARA)', NT: 'NT (ACARA)',
}

// ─── POST /study/intake ───────────────────────────────────────────────
// Conversational AU setup: "Grade 8, Sydney" -> infer grade + state/curriculum
// + subject chips (no form). Persists grade/state/curriculum to the persona.
study.post('/study/intake', async (c) => {
  const accountId = authedAccountId(c)
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ text: z.string().min(1).max(300).trim() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const [acct] = await db.select({ persona: accounts.persona }).from(accounts).where(eq(accounts.id, accountId)).limit(1)
  const persona = ((acct?.persona as Record<string, unknown>) ?? {})

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INTAKE_SYSTEM },
        { role: 'user', content: parsed.data.text },
      ],
    })
    const raw = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as {
      reply?: string
      profile?: { grade?: string; state?: string; curriculum?: string; subjects?: unknown }
      chips?: unknown
      stage?: string
    }
    const p = raw.profile ?? {}
    const grade = (p.grade || '').toString().trim()
    let state = (p.state || '').toString().trim().toUpperCase()
    let curriculum = (p.curriculum || '').toString().trim()
    const subjects = Array.isArray(p.subjects)
      ? p.subjects.filter((s): s is string => typeof s === 'string').slice(0, 12)
      : []

    // Grounding backfill: recover the state from a mentioned city, then the
    // curriculum from the state, so inference is robust even if the model omits them.
    if (!state) {
      const hay = parsed.data.text.toLowerCase().replace(/[^a-z]/g, '')
      for (const [city, st] of Object.entries(AU_STATE_BY_CITY)) {
        if (hay.includes(city)) { state = st; break }
      }
    }
    if (!curriculum && state && AU_CURRICULUM_BY_STATE[state]) curriculum = AU_CURRICULUM_BY_STATE[state]
    if (!curriculum) curriculum = 'ACARA'

    const chips = Array.isArray(raw.chips)
      ? raw.chips.filter((s): s is string => typeof s === 'string').slice(0, 12)
      : subjects
    const stage = typeof raw.stage === 'string' ? raw.stage : 'intake'

    if (grade || state || curriculum) {
      const nextPersona = { ...persona, ...(grade ? { grade } : {}), ...(state ? { state } : {}), ...(curriculum ? { curriculum } : {}) }
      await db.update(accounts).set({ persona: nextPersona }).where(eq(accounts.id, accountId))
    }

    logger.info({ accountId, grade, state, curriculum, subjectCount: subjects.length }, 'study.intake')
    return c.json({ reply: raw.reply || 'Got it!', profile: { grade, state, curriculum, subjects }, chips, stage })
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'study.intake_failed')
    return c.json({ reply: 'Which school and grade are you in?', profile: { grade: '', state: '', curriculum: '', subjects: [] }, chips: [], stage: 'intake' })
  }
})

study.post('/study/topics', async (c) => {
  const accountId = authedAccountId(c)
  const familyId = await getOrCreateFamilyId(accountId)

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
    chapter: z.string().min(1).max(200).trim().optional(), // Lesson name — forces all generated cards into this chapter.
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

  // Kick off async processing (non-blocking). A lesson name (chapter) forces
  // every generated card into that lesson.
  processDocument(doc.id, parsed.data.content, parsed.data.chapter).catch(() => undefined)

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

// GET /study/documents/:id/url — resolve a material to a short-lived openable
// URL (signed) so the student can actually view their PDF/image. Ownership-
// checked. Inline text docs have no file to open.
study.get('/study/documents/:id/url', async (c) => {
  const accountId = authedAccountId(c)
  const docId = c.req.param('id')

  const [doc] = await db
    .select({ id: studyDocuments.id, fileUrl: studyDocuments.fileUrl, fileType: studyDocuments.fileType })
    .from(studyDocuments)
    .where(and(eq(studyDocuments.id, docId), eq(studyDocuments.accountId, accountId)))
    .limit(1)
  if (!doc) return c.json({ error: 'not_found' }, 404)
  if (!doc.fileUrl || doc.fileUrl.startsWith('text://') || doc.fileUrl.startsWith('local://')) {
    return c.json({ error: 'not_a_file' }, 400)
  }

  try {
    const url = await resolveReadUrl(doc.fileUrl)
    if (!url) return c.json({ error: 'not_openable' }, 400)
    return c.json({ url, fileType: doc.fileType })
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120), docId }, 'study.doc_url_failed')
    return c.json({ error: 'resolve_failed' }, 502)
  }
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
  const chapter = c.req.query('chapter') || undefined

  const conditions = [eq(studyCards.topicId, topicId), eq(studyCards.accountId, accountId)]
  if (dueOnly) conditions.push(lte(studyCards.nextReviewAt, new Date()))
  if (bookmarkedOnly) conditions.push(eq(studyCards.bookmarked, true))
  if (chapter) conditions.push(eq(studyCards.chapter, chapter))

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

// GET /study/cards/saved — every bookmarked card across ALL topics, for the
// cross-topic "Review saved" spaced-repetition session. Due (or overdue) cards
// come first (nextReviewAt ascending) so the review targets what's fading.
study.get('/study/cards/saved', async (c) => {
  const accountId = authedAccountId(c)
  const rows = await db
    .select({
      id: studyCards.id,
      front: studyCards.front,
      back: studyCards.back,
      status: studyCards.status,
      chapter: studyCards.chapter,
      nextReviewAt: studyCards.nextReviewAt,
      topicId: studyCards.topicId,
      topicTitle: studyTopics.title,
      topicEmoji: studyTopics.emoji,
    })
    .from(studyCards)
    .innerJoin(studyTopics, eq(studyTopics.id, studyCards.topicId))
    .where(and(eq(studyCards.accountId, accountId), eq(studyCards.bookmarked, true)))
    .orderBy(studyCards.nextReviewAt)
  const now = Date.now()
  const dueCount = rows.filter((r) => !r.nextReviewAt || new Date(r.nextReviewAt).getTime() <= now).length
  return c.json({ cards: rows, dueCount })
})

// POST /study/cards/:id/cheatsheet — expand a single concept into a rich,
// kid-friendly "cheat sheet" (definition, key points, example, analogy,
// optional formula, common mistake). Generated on demand from the card +
// topic + the student's grade. Ownership-checked.
study.post('/study/cards/:id/cheatsheet', async (c) => {
  const accountId = authedAccountId(c)
  const cardId = c.req.param('id')

  const [card] = await db
    .select({ id: studyCards.id, front: studyCards.front, back: studyCards.back, topicId: studyCards.topicId, chapter: studyCards.chapter })
    .from(studyCards)
    .where(and(eq(studyCards.id, cardId), eq(studyCards.accountId, accountId)))
    .limit(1)
  if (!card) return c.json({ error: 'not_found' }, 404)

  const [topic] = await db
    .select({ title: studyTopics.title })
    .from(studyTopics)
    .where(eq(studyTopics.id, card.topicId))
    .limit(1)
  const persona = await db
    .select({ persona: accounts.persona })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
    .then((r) => (r[0]?.persona ?? {}) as Record<string, unknown>)
  const grade = typeof persona.grade === 'string' ? persona.grade : null

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a brilliant, friendly tutor making a one-page "cheat sheet" for ONE concept, for a school student${grade ? ` in ${grade}` : ''}. Be accurate, vivid and age-appropriate.
Return ONLY JSON:
{
  "emoji": "<one emoji that represents the concept>",
  "title": "<short concept title>",
  "definition": "<one crisp sentence a student can remember>",
  "keyPoints": ["<3-5 must-know points, each short>"],
  "example": "<one concrete worked or real-world example>",
  "analogy": "<\\"Think of it like…\\" — a simple everyday analogy>",
  "formula": "<a formula/rule if relevant, else empty string>",
  "mistake": "<the most common mistake students make, and how to avoid it>"
}`,
        },
        {
          role: 'user',
          content: `Subject/topic: ${topic?.title ?? 'this subject'}${card.chapter ? ` — lesson: ${card.chapter}` : ''}\nConcept: ${card.front}\nReference explanation: ${card.back}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 700,
    })
    const p = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    return c.json({
      cheatsheet: {
        emoji: typeof p.emoji === 'string' ? p.emoji : '💡',
        title: typeof p.title === 'string' && p.title.trim() ? p.title : card.front,
        definition: typeof p.definition === 'string' ? p.definition : card.back,
        keyPoints: Array.isArray(p.keyPoints) ? p.keyPoints.slice(0, 6).map(String) : [],
        example: typeof p.example === 'string' ? p.example : '',
        analogy: typeof p.analogy === 'string' ? p.analogy : '',
        formula: typeof p.formula === 'string' ? p.formula : '',
        mistake: typeof p.mistake === 'string' ? p.mistake : '',
      },
    })
  } catch (err) {
    // Graceful fallback to the raw card so the screen never dead-ends.
    logger.warn({ err: String(err).slice(0, 120), cardId }, 'study.cheatsheet_failed')
    return c.json({
      cheatsheet: { emoji: '💡', title: card.front, definition: card.back, keyPoints: [], example: '', analogy: '', formula: '', mistake: '' },
    })
  }
})

// GET /study/cards/due — all due cards across topics (joined with their topic
// so a cross-subject "Today's review" can label each card). ?limit (default 20).
study.get('/study/cards/due', async (c) => {
  const accountId = authedAccountId(c)
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  const cards = await db
    .select({
      id: studyCards.id,
      front: studyCards.front,
      back: studyCards.back,
      status: studyCards.status,
      chapter: studyCards.chapter,
      nextReviewAt: studyCards.nextReviewAt,
      topicId: studyCards.topicId,
      topicTitle: studyTopics.title,
      topicEmoji: studyTopics.emoji,
    })
    .from(studyCards)
    .innerJoin(studyTopics, eq(studyTopics.id, studyCards.topicId))
    .where(and(eq(studyCards.accountId, accountId), lte(studyCards.nextReviewAt, new Date())))
    .orderBy(studyCards.nextReviewAt)
    .limit(limit)

  return c.json({ cards, count: cards.length })
})

// POST /study/vision-extract — turn photos of a worksheet/textbook/notes into
// clean study text a deck can be built from. Uses gpt-4o vision. Max 3 images.
study.post('/study/vision-extract', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    images: z.array(z.string().max(2_000_000).refine((s) => /^(data:image\/|https?:\/\/)/i.test(s), 'invalid image url')).min(1).max(3),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You extract study material from photos (a worksheet, textbook page, or handwritten notes). Transcribe and lightly organise the LEARNABLE content — key terms, definitions, facts, formulas, questions and worked examples — into clean plain text a tutor can turn into flashcards. Ignore page furniture (headers, page numbers, logos). If the image has no study content, reply exactly "NO_CONTENT".`,
        },
        {
          role: 'user',
          content: [
            { type: 'text' as const, text: 'Extract the study material from these image(s):' },
            ...parsed.data.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
    })
    const text = res.choices[0]?.message?.content?.trim() ?? ''
    if (!text || text === 'NO_CONTENT') return c.json({ text: '' })
    return c.json({ text: text.slice(0, 16_000) })
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'study.vision_extract_failed')
    return c.json({ error: 'extract_failed' }, 502)
  }
})

// POST /study/cards/:id/explain — explain ONE concept a different way on demand
// (simpler / example / mnemonic). Grounded in the card + topic + grade.
study.post('/study/cards/:id/explain', async (c) => {
  const accountId = authedAccountId(c)
  const cardId = c.req.param('id')

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ style: z.enum(['simpler', 'example', 'mnemonic']) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const [card] = await db
    .select({ front: studyCards.front, back: studyCards.back, topicId: studyCards.topicId, chapter: studyCards.chapter })
    .from(studyCards)
    .where(and(eq(studyCards.id, cardId), eq(studyCards.accountId, accountId)))
    .limit(1)
  if (!card) return c.json({ error: 'not_found' }, 404)

  const [topic] = await db.select({ title: studyTopics.title }).from(studyTopics).where(eq(studyTopics.id, card.topicId)).limit(1)
  const persona = await db.select({ persona: accounts.persona }).from(accounts).where(eq(accounts.id, accountId)).limit(1).then((r) => (r[0]?.persona ?? {}) as Record<string, unknown>)
  const grade = typeof persona.grade === 'string' ? persona.grade : null

  const ask: Record<string, string> = {
    simpler: 'Explain this concept in the simplest possible way — like to a younger kid — in 2-3 short sentences. No jargon.',
    example: 'Give ONE fresh, concrete, real-world example that makes this concept click. 2-3 sentences.',
    mnemonic: 'Give a catchy mnemonic or memory trick to remember this, then one short line on how to use it.',
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 240,
      temperature: 0.6,
      messages: [
        { role: 'system', content: `You are a warm, sharp study tutor for a student${grade ? ` in ${grade}` : ''}. Be accurate, vivid and age-appropriate. Plain text only — no markdown headings or lists unless natural.` },
        { role: 'user', content: `Topic: ${topic?.title ?? 'this subject'}${card.chapter ? ` — lesson: ${card.chapter}` : ''}\nConcept: ${card.front}\nReference explanation: ${card.back}\n\n${ask[parsed.data.style]}` },
      ],
    })
    const text = res.choices[0]?.message?.content?.trim() || card.back
    return c.json({ text })
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120), cardId }, 'study.explain_failed')
    return c.json({ text: card.back })
  }
})

// GET /study/weak-spots — the concepts a student keeps missing, aggregated from
// recent quizzes (weakConcepts) and interviews (analysis.weakPoints). Powers the
// "Practise your trouble spots" deck.
study.get('/study/weak-spots', async (c) => {
  const accountId = authedAccountId(c)

  const quizzes = await db
    .select({ weakConcepts: studyQuizzes.weakConcepts })
    .from(studyQuizzes)
    .where(and(eq(studyQuizzes.accountId, accountId), eq(studyQuizzes.status, 'completed')))
    .orderBy(desc(studyQuizzes.completedAt))
    .limit(25)

  const interviews = await db
    .select({ analysis: studyInterviews.analysis })
    .from(studyInterviews)
    .where(and(eq(studyInterviews.accountId, accountId), eq(studyInterviews.status, 'completed')))
    .orderBy(desc(studyInterviews.completedAt))
    .limit(25)

  const freq = new Map<string, number>()
  const bump = (s: unknown) => { if (typeof s === 'string' && s.trim()) { const k = s.trim(); freq.set(k, (freq.get(k) ?? 0) + 1) } }
  for (const q of quizzes) for (const w of (q.weakConcepts as string[] | null) ?? []) bump(w)
  for (const iv of interviews) {
    const wp = (iv.analysis as { weakPoints?: unknown } | null)?.weakPoints
    if (Array.isArray(wp)) for (const w of wp) bump(w)
  }

  const spots = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([concept, count]) => ({ concept, count }))
  return c.json({ spots, total: spots.length })
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
      const rewards = await resolveStudyRewards(familyId)
      if (rewards.enabled && rewards.study_review_session > 0) {
        await awardStudyBrains(accountId, familyId, 'study_review_session', rewards.study_review_session, { reviewedToday: 10 })
      }
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
      const rewards = await resolveStudyRewards(familyId)
      if (rewards.enabled && rewards.study_streak > 0) {
        await awardStudyBrains(accountId, familyId, 'study_streak', rewards.study_streak, { streak: newStreak })
      }
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
    .limit(mode === 'viva' ? 20 : 16)

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

  // Pull the kid's name/grade for a personal greeting + context (shared by both
  // the Runway and Tavus interviewers).
  const [acct] = await db
    .select({ persona: accounts.persona })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
  const persona = (acct?.persona ?? {}) as Record<string, unknown>
  const kidName = typeof persona.name === 'string' ? persona.name : null
  const grade = typeof persona.grade === 'string' ? persona.grade : null

  // Prefer the Runway avatar interview when configured (real-time GWM-1 avatar —
  // the custom "Simon" viva interviewer). We generate a PDF-grounded viva
  // blueprint, attach it to the avatar as its knowledge, then mint a session.
  if (runwayConfigured()) {
    try {
      // Pick the character once (deterministic by interview id so any reconnect
      // lands on the same face), ground THAT avatar in this topic's material,
      // then mint a session bound to it.
      const avatarId = pickAvatarId(interview.id)
      try {
        const { knowledgeMarkdown } = await generateBlueprint({
          topicTitle: topic.title,
          chapter: chapter ?? null,
          concepts: cards,
          kidName,
          grade,
        })
        await attachAvatarKnowledge(
          knowledgeMarkdown,
          `Viva — ${topic.title}${chapter ? ` · ${chapter}` : ''}`,
          avatarId,
        )
      } catch (err) {
        logger.warn({ err: String(err).slice(0, 160), interviewId: interview.id }, 'study.blueprint_failed')
      }

      const session = await createAvatarSession({ avatarId })
      return c.json(
        { interviewId: interview.id, provider: 'runway', runway: session, mode, chapter: chapter ?? null },
        201,
      )
    } catch (err) {
      // Never dead-end the kid — fall through to Tavus, then the legacy tutor.
      logger.warn({ err: String(err).slice(0, 200), interviewId: interview.id }, 'study.runway_create_failed')
    }
  }

  // No Tavus configured → tell the client to use the legacy voice tutor.
  if (!tavusConfigured()) {
    return c.json({ interviewId: interview.id, provider: 'legacy', mode, chapter: chapter ?? null }, 201)
  }

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
      maxDurationSecs: 180,
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

// ═══════════════════════════════════════════════════════════════════════
// PARENT OVERSIGHT — a parent monitors their kids' studying (read-only)
// ═══════════════════════════════════════════════════════════════════════

// The parent's family id, but only for non-kid members (kids can't oversee).
async function parentFamilyId(accountId: string): Promise<string | null> {
  const [m] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  if (!m || m.role === 'kid') return null
  return m.familyId
}

// True if `kidId` is a kid in `familyId`.
async function kidInFamily(familyId: string, kidId: string): Promise<boolean> {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), eq(memberships.accountId, kidId), eq(memberships.role, 'kid')))
    .limit(1)
  return !!m
}

// GET /study/rewards-config — the family's study-to-earn settings (parent only).
study.get('/study/rewards-config', async (c) => {
  const accountId = authedAccountId(c)
  const familyId = await parentFamilyId(accountId)
  if (!familyId) return c.json({ error: 'not_a_parent' }, 403)
  const config = await resolveStudyRewards(familyId)
  return c.json({ config })
})

// PUT /study/rewards-config — tune study-to-earn amounts (parent only). Stored
// on the family's primary parent so every parent shares one config.
study.put('/study/rewards-config', async (c) => {
  const accountId = authedAccountId(c)
  const familyId = await parentFamilyId(accountId)
  if (!familyId) return c.json({ error: 'not_a_parent' }, 403)

  const amt = z.number().int().min(0).max(1000)
  const parsed = z.object({
    enabled: z.boolean().optional(),
    study_quiz_pass: amt.optional(),
    study_quiz_perfect: amt.optional(),
    study_review_session: amt.optional(),
    study_streak: amt.optional(),
    study_upload: amt.optional(),
  }).safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const parent = await getFamilyPrimaryParent(familyId)
  if (!parent) return c.json({ error: 'no_parent' }, 404)
  const current = (parent.persona.studyRewards ?? {}) as Partial<StudyRewardConfig>
  const nextRewards = { ...DEFAULT_STUDY_REWARDS, ...current, ...parsed.data }
  await db.update(accounts).set({ persona: { ...parent.persona, studyRewards: nextRewards } }).where(eq(accounts.id, parent.accountId))

  const config = await resolveStudyRewards(familyId)
  return c.json({ ok: true, config })
})

// GET /study/children — the parent's kids, each with a study summary.
study.get('/study/children', async (c) => {
  const accountId = authedAccountId(c)
  const familyId = await parentFamilyId(accountId)
  if (!familyId) return c.json({ error: 'not_a_parent' }, 403)

  const kids = await db
    .select({ accountId: memberships.accountId, persona: accounts.persona })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

  const children = await Promise.all(kids.map(async (kid) => {
    const persona = (kid.persona ?? {}) as Record<string, unknown>
    const [{ count: subjectCount } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyTopics)
      .where(eq(studyTopics.accountId, kid.accountId))
    const [{ count: interviewCount } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyInterviews)
      .where(and(eq(studyInterviews.accountId, kid.accountId), eq(studyInterviews.status, 'completed')))
    const [lastInterview] = await db
      .select({ score: studyInterviews.score, completedAt: studyInterviews.completedAt })
      .from(studyInterviews)
      .where(and(eq(studyInterviews.accountId, kid.accountId), eq(studyInterviews.status, 'completed')))
      .orderBy(desc(studyInterviews.completedAt))
      .limit(1)
    const [streak] = await db
      .select({ currentStreak: studyStreaks.currentStreak })
      .from(studyStreaks)
      .where(eq(studyStreaks.accountId, kid.accountId))
      .limit(1)
    return {
      accountId: kid.accountId,
      name: typeof persona.name === 'string' ? persona.name : 'Your child',
      grade: typeof persona.grade === 'string' ? persona.grade : null,
      avatar: typeof persona.avatar === 'string' ? persona.avatar : null,
      subjectCount,
      interviewCount,
      lastScore: lastInterview?.score ?? null,
      lastInterviewAt: lastInterview?.completedAt ?? null,
      streak: streak?.currentStreak ?? 0,
    }
  }))

  return c.json({ children })
})

// GET /study/children/:kidId/overview — one kid's subjects, stats + recent interviews.
study.get('/study/children/:kidId/overview', async (c) => {
  const accountId = authedAccountId(c)
  const kidId = c.req.param('kidId')
  const familyId = await parentFamilyId(accountId)
  if (!familyId) return c.json({ error: 'not_a_parent' }, 403)
  if (!(await kidInFamily(familyId, kidId))) return c.json({ error: 'forbidden' }, 403)

  const subjects = await db
    .select({ id: studyTopics.id, title: studyTopics.title, emoji: studyTopics.emoji, totalCards: studyTopics.totalCards, cardsDue: studyTopics.cardsDue })
    .from(studyTopics)
    .where(eq(studyTopics.accountId, kidId))
    .orderBy(desc(studyTopics.createdAt))

  const interviews = await db
    .select({
      id: studyInterviews.id,
      topicId: studyInterviews.topicId,
      topicTitle: studyTopics.title,
      topicEmoji: studyTopics.emoji,
      chapter: studyInterviews.chapter,
      mode: studyInterviews.mode,
      score: studyInterviews.score,
      summary: studyInterviews.summary,
      durationSecs: studyInterviews.durationSecs,
      brainsEarned: studyInterviews.brainsEarned,
      focus: studyInterviews.focus,
      analysis: studyInterviews.analysis,
      completedAt: studyInterviews.completedAt,
      createdAt: studyInterviews.createdAt,
    })
    .from(studyInterviews)
    .leftJoin(studyTopics, eq(studyInterviews.topicId, studyTopics.id))
    .where(and(eq(studyInterviews.accountId, kidId), eq(studyInterviews.status, 'completed')))
    .orderBy(desc(studyInterviews.completedAt))
    .limit(20)

  const [streak] = await db
    .select({ currentStreak: studyStreaks.currentStreak, longestStreak: studyStreaks.longestStreak })
    .from(studyStreaks)
    .where(eq(studyStreaks.accountId, kidId))
    .limit(1)

  return c.json({ subjects, interviews, streak: streak ?? { currentStreak: 0, longestStreak: 0 } })
})

// GET /study/children/:kidId/interviews/:id — full detail of a kid's interview
// (transcript + focus/integrity signals) for the parent.
study.get('/study/children/:kidId/interviews/:id', async (c) => {
  const accountId = authedAccountId(c)
  const kidId = c.req.param('kidId')
  const interviewId = c.req.param('id')
  const familyId = await parentFamilyId(accountId)
  if (!familyId) return c.json({ error: 'not_a_parent' }, 403)
  if (!(await kidInFamily(familyId, kidId))) return c.json({ error: 'forbidden' }, 403)

  const [iv] = await db
    .select()
    .from(studyInterviews)
    .where(and(eq(studyInterviews.id, interviewId), eq(studyInterviews.accountId, kidId)))
    .limit(1)
  if (!iv) return c.json({ error: 'not_found' }, 404)

  const [topic] = await db
    .select({ title: studyTopics.title, emoji: studyTopics.emoji })
    .from(studyTopics)
    .where(eq(studyTopics.id, iv.topicId))
    .limit(1)

  return c.json({
    interview: {
      id: iv.id,
      topicId: iv.topicId,
      topicTitle: topic?.title ?? null,
      topicEmoji: topic?.emoji ?? null,
      chapter: iv.chapter,
      mode: iv.mode,
      score: iv.score,
      summary: iv.summary,
      keepPractising: iv.keepPractising,
      focusAreas: iv.focusAreas,
      transcript: iv.transcript,
      focus: iv.focus,
      analysis: iv.analysis,
      durationSecs: iv.durationSecs,
      brainsEarned: iv.brainsEarned,
      status: iv.status,
      completedAt: iv.completedAt,
      createdAt: iv.createdAt,
    },
  })
})

// GET /study/interviews — past interviews (history + scores). Optional
// ?topicId= and ?chapter= filters; newest first. Returns completed interviews
// with their score, summary and headline stats (no transcript — see detail).
study.get('/study/interviews', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.query('topicId')
  const chapter = c.req.query('chapter')
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100)

  const conds = [eq(studyInterviews.accountId, accountId), eq(studyInterviews.status, 'completed')]
  if (topicId) conds.push(eq(studyInterviews.topicId, topicId))
  if (chapter) conds.push(eq(studyInterviews.chapter, chapter))

  const rows = await db
    .select({
      id: studyInterviews.id,
      topicId: studyInterviews.topicId,
      topicTitle: studyTopics.title,
      topicEmoji: studyTopics.emoji,
      chapter: studyInterviews.chapter,
      mode: studyInterviews.mode,
      score: studyInterviews.score,
      summary: studyInterviews.summary,
      durationSecs: studyInterviews.durationSecs,
      brainsEarned: studyInterviews.brainsEarned,
      keepPractising: studyInterviews.keepPractising,
      focus: studyInterviews.focus,
      analysis: studyInterviews.analysis,
      completedAt: studyInterviews.completedAt,
      createdAt: studyInterviews.createdAt,
    })
    .from(studyInterviews)
    .leftJoin(studyTopics, eq(studyInterviews.topicId, studyTopics.id))
    .where(and(...conds))
    .orderBy(desc(studyInterviews.completedAt))
    .limit(limit)

  return c.json({ interviews: rows })
})

// GET /study/interviews/:id — full detail of one past interview, including the
// transcript and focus/integrity signals. Ownership-checked.
study.get('/study/interviews/:id', async (c) => {
  const accountId = authedAccountId(c)
  const interviewId = c.req.param('id')

  const [iv] = await db
    .select()
    .from(studyInterviews)
    .where(eq(studyInterviews.id, interviewId))
    .limit(1)
  if (!iv) return c.json({ error: 'not_found' }, 404)
  if (iv.accountId !== accountId) return c.json({ error: 'forbidden' }, 403)

  const [topic] = await db
    .select({ title: studyTopics.title, emoji: studyTopics.emoji })
    .from(studyTopics)
    .where(eq(studyTopics.id, iv.topicId))
    .limit(1)

  return c.json({
    interview: {
      id: iv.id,
      topicId: iv.topicId,
      topicTitle: topic?.title ?? null,
      topicEmoji: topic?.emoji ?? null,
      chapter: iv.chapter,
      mode: iv.mode,
      score: iv.score,
      summary: iv.summary,
      keepPractising: iv.keepPractising,
      focusAreas: iv.focusAreas,
      transcript: iv.transcript,
      focus: iv.focus,
      analysis: iv.analysis,
      durationSecs: iv.durationSecs,
      brainsEarned: iv.brainsEarned,
      status: iv.status,
      completedAt: iv.completedAt,
      createdAt: iv.createdAt,
    },
  })
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

// POST /study/interviews/:id/runway-session — mint a fresh Runway avatar
// session for an existing interview. Used to (re)connect: the first session is
// returned at interview start, but Runway sessions are one-time use and capped
// at ~5 minutes, so the client calls this to resume after a timeout or a
// dropped connection. Ownership-checked.
study.post('/study/interviews/:id/runway-session', async (c) => {
  const accountId = authedAccountId(c)
  const interviewId = c.req.param('id')

  const [iv] = await db
    .select({ id: studyInterviews.id, accountId: studyInterviews.accountId, status: studyInterviews.status })
    .from(studyInterviews)
    .where(eq(studyInterviews.id, interviewId))
    .limit(1)
  if (!iv) return c.json({ error: 'not_found' }, 404)
  if (iv.accountId !== accountId) return c.json({ error: 'forbidden' }, 403)
  if (iv.status === 'completed') return c.json({ error: 'already_completed' }, 409)
  if (!runwayConfigured()) return c.json({ error: 'runway_unavailable' }, 503)

  try {
    const session = await createAvatarSession({ seed: interviewId })
    return c.json({ provider: 'runway', runway: session })
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 200), interviewId }, 'study.runway_session_failed')
    return c.json({ error: 'runway_session_failed' }, 502)
  }
})

// GET /study/topics/:id/blueprint — preview/return the generated oral-viva
// blueprint for a topic (optionally ?chapter=). Used to preview what will be
// asked, and as the question plan for the Phase 2 LiveKit agent (Option B).
study.get('/study/topics/:id/blueprint', async (c) => {
  const accountId = authedAccountId(c)
  const topicId = c.req.param('id')
  const chapter = c.req.query('chapter') || null

  const [topic] = await db
    .select({ id: studyTopics.id, title: studyTopics.title })
    .from(studyTopics)
    .where(and(eq(studyTopics.id, topicId), eq(studyTopics.accountId, accountId)))
    .limit(1)
  if (!topic) return c.json({ error: 'topic_not_found' }, 404)

  const conds = [eq(studyCards.topicId, topicId), eq(studyCards.accountId, accountId)]
  if (chapter) conds.push(eq(studyCards.chapter, chapter))
  const cards = await db
    .select({ front: studyCards.front, back: studyCards.back })
    .from(studyCards)
    .where(and(...conds))
    .limit(24)
  if (cards.length === 0) return c.json({ error: 'no_concepts' }, 400)

  const persona = await db
    .select({ persona: accounts.persona })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
    .then((r) => (r[0]?.persona ?? {}) as Record<string, unknown>)

  const { blueprint, focusAreas } = await generateBlueprint({
    topicTitle: topic.title,
    chapter,
    concepts: cards,
    kidName: typeof persona.name === 'string' ? persona.name : null,
    grade: typeof persona.grade === 'string' ? persona.grade : null,
  })
  return c.json({ blueprint, focusAreas })
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
        content: `Generate a multiple-choice quiz for a student based on their study cards. Return JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correctAnswer":"A","concept":"...","explanation":"..."}]}. Generate 5-10 questions. Each question has exactly 4 options labeled by the option text. correctAnswer must be the exact text of the correct option. concept is a short label of what the question tests. explanation is ONE short, clear sentence (kid-friendly, ≤ 25 words) saying WHY the correct answer is right — used to teach after they answer.`,
      },
      { role: 'user', content: cardContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })

  let questions: { question: string; options: string[]; correctAnswer: string; concept: string; explanation?: string }[] = []
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

  const questions = quiz.questions as { question: string; options: string[]; correctAnswer: string; concept: string; explanation?: string; kidAnswer: string | null; isCorrect: boolean | null }[]
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

  // Calculate brains earned (parent-tunable, family-wide).
  const familyId = await getFamilyId(accountId)
  const rewards = familyId ? await resolveStudyRewards(familyId) : DEFAULT_STUDY_REWARDS
  let brainsEarned = 0
  if (rewards.enabled) {
    if (scorePct === 100) brainsEarned = rewards.study_quiz_perfect
    else if (scorePct >= 80) brainsEarned = rewards.study_quiz_pass
  }

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
  if (brainsEarned > 0 && familyId) {
    const kind = scorePct === 100 ? 'study_quiz_perfect' as const : 'study_quiz_pass' as const
    await awardStudyBrains(accountId, familyId, kind, brainsEarned, { quizId, scorePct })
  }

  return c.json({ ok: true, correctCount, scorePct, brainsEarned, weakConcepts, questions })
})
