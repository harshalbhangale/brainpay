import { eq, sql } from 'drizzle-orm'
import OpenAI from 'openai'
import { db } from '../db'
import { memberships } from '../db/schema'
import { studyCards, studyDocuments, studyTopics } from '../db/study-schema'
import { logger } from '../logger'
import { awardStudyBrains, STUDY_REWARD_AMOUNTS } from './study-rewards'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * Process a document: extract text → chunk → embed → generate cards.
 * Runs async (fire-and-forget from the route handler).
 */
export async function processDocument(documentId: string, rawContent?: string) {
  try {
    await db.update(studyDocuments)
      .set({ processingStatus: 'processing' })
      .where(eq(studyDocuments.id, documentId))

    const [doc] = await db.select().from(studyDocuments).where(eq(studyDocuments.id, documentId)).limit(1)
    if (!doc) return

    // Step 1: Extract text
    let text: string
    if (rawContent) {
      text = rawContent
    } else if (doc.rawText) {
      // Re-processing (e.g. regenerate): reuse the previously stored source.
      text = doc.rawText
    } else if (doc.fileType === 'image') {
      text = await extractFromImage(doc.fileUrl)
    } else if (doc.fileType === 'pdf') {
      text = await extractFromPdf(doc.fileUrl)
    } else {
      text = rawContent ?? ''
    }

    if (!text || text.length < 20) {
      await db.update(studyDocuments)
        .set({ processingStatus: 'failed', error: 'Could not extract meaningful text' })
        .where(eq(studyDocuments.id, documentId))
      return
    }

    // Persist the resolved source text so the topic can be regenerated later.
    if (!doc.rawText) {
      await db.update(studyDocuments)
        .set({ rawText: text.slice(0, 200000) })
        .where(eq(studyDocuments.id, documentId))
    }

    // Step 2: Chunk semantically
    const chunks = chunkText(text)

    // Step 3: Embed chunks and store in S3 Vectors (non-fatal — cards are
    // the primary output; vector storage is for future RAG/quiz retrieval).
    let storedChunks = 0
    for (const chunk of chunks) {
      try {
        await embedAndStore(chunk, doc.topicId, documentId, doc.accountId)
        storedChunks++
      } catch (embErr) {
        logger.warn({ err: String(embErr).slice(0, 120), documentId }, 'study.embed_skipped')
      }
    }

    // Step 4: Generate flashcards (the main output the kid sees)
    const cards = await generateCards(text, doc.topicId, doc.accountId, documentId)

    // Step 5: Update document + topic stats
    await db.update(studyDocuments).set({
      processingStatus: 'ready',
      chunkCount: storedChunks,
      processedAt: new Date(),
    }).where(eq(studyDocuments.id, documentId))

    await db.update(studyTopics).set({
      totalCards: sql`${studyTopics.totalCards} + ${cards.length}`,
      cardsDue: sql`${studyTopics.cardsDue} + ${cards.length}`,
    }).where(eq(studyTopics.id, doc.topicId))

    // Award brains for successful document upload (non-fatal). Only on the
    // first processing — never on regenerate/reprocess (doc.rawText preset).
    if (!doc.rawText) {
      try {
        const [membership] = await db
          .select({ familyId: memberships.familyId })
          .from(memberships)
          .where(eq(memberships.accountId, doc.accountId))
          .limit(1)
        if (membership?.familyId) {
          await awardStudyBrains(doc.accountId, membership.familyId, 'study_upload', STUDY_REWARD_AMOUNTS.study_upload, { documentId })
        }
      } catch (rewardErr) {
        logger.warn({ err: String(rewardErr).slice(0, 120), documentId }, 'study.reward_skipped')
      }
    }

    logger.info({ documentId, chunks: chunks.length, cards: cards.length }, 'study.document_processed')
  } catch (err) {
    logger.error({ err: String(err), documentId }, 'study.process_failed')
    await db.update(studyDocuments)
      .set({ processingStatus: 'failed', error: String(err).slice(0, 500) })
      .where(eq(studyDocuments.id, documentId))
  }
}

// ─── Text extraction ──────────────────────────────────────────────────

async function extractFromImage(fileUrl: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Extract all text from this image. Preserve headings, bullet points, and structure. If there are diagrams, describe them briefly.' },
        { type: 'image_url', image_url: { url: fileUrl } },
      ],
    }],
    max_tokens: 4000,
  })
  return res.choices[0]?.message?.content ?? ''
}

async function extractFromPdf(fileUrl: string): Promise<string> {
  // For now, use GPT-4o vision on the PDF URL (works for most PDFs)
  // For production, add pdf-parse for text-based PDFs
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Extract all text content from this document. Preserve structure, headings, and formatting.' },
        { type: 'image_url', image_url: { url: fileUrl } },
      ],
    }],
    max_tokens: 4000,
  })
  return res.choices[0]?.message?.content ?? ''
}

// ─── Chunking ─────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  // Split by double newlines or headings first, then enforce max size
  const sections = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const section of sections) {
    if (current.length + section.length > 1500) {
      if (current) chunks.push(current.trim())
      current = section
    } else {
      current += (current ? '\n\n' : '') + section
    }
  }
  if (current.trim()) chunks.push(current.trim())

  return chunks.filter((c) => c.length > 30) // Drop tiny chunks
}

// ─── Embedding + S3 Vectors storage ──────────────────────────────────

async function embedAndStore(content: string, topicId: string, documentId: string, accountId: string) {
  // text-embedding-3-small caps at 8192 tokens (~32k chars). Truncate to be safe.
  const input = content.slice(0, 24000)
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  })
  const embedding = embRes.data[0].embedding

  // Insert via the S3 Vectors FDW (SQL)
  await db.execute(sql`
    INSERT INTO study_chunks (id, topic_id, document_id, account_id, content, metadata, embedding)
    VALUES (
      ${crypto.randomUUID()},
      ${topicId},
      ${documentId},
      ${accountId},
      ${content},
      ${JSON.stringify({ length: content.length })}::jsonb,
      ${JSON.stringify(embedding)}::vector
    )
  `)
}

// ─── Card generation (full-document, chapter-tagged) ──────────────────

type GenCard = { front: string; back: string; chapter: string }

const CARD_SYSTEM_PROMPT = `You are an expert study flashcard generator for school students.

You will receive EITHER an excerpt of study material (notes, textbook text, extracted PDF/image content) OR a request to generate concepts for a subject and grade.

Produce flashcards covering the most important concepts, definitions, formulas, and facts in THIS excerpt.

For EACH card also identify the "chapter" — the chapter / unit / section / topic heading the concept belongs to. Infer it from headings in the text. If you truly cannot tell, use "General".

Return ONLY valid JSON in this exact shape:
{"cards": [{"front": "question or concept", "back": "clear, concise answer", "chapter": "chapter or section name"}]}

Generate 6-12 cards for this excerpt. Each card tests ONE concept. Answers must be student-friendly and accurate.`

/** Split text into ~12k-char batches on paragraph boundaries so the whole
 *  document is covered (not just the opening), then generate cards per batch. */
function batchText(text: string, maxLen = 12000): string[] {
  if (text.length <= maxLen) return [text]
  const paras = text.split(/\n\n+/)
  const batches: string[] = []
  let current = ''
  for (const p of paras) {
    if (current.length + p.length > maxLen && current) {
      batches.push(current.trim())
      current = p
    } else {
      current += (current ? '\n\n' : '') + p
    }
  }
  if (current.trim()) batches.push(current.trim())
  return batches
}

async function generateCardsForBatch(excerpt: string): Promise<GenCard[]> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CARD_SYSTEM_PROMPT },
      { role: 'user', content: excerpt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
  })
  const raw = res.choices[0]?.message?.content ?? '{}'
  try {
    const parsed = JSON.parse(raw)
    const arr = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : parsed.flashcards
    if (!Array.isArray(arr)) return []
    return arr
      .filter((c: unknown): c is { front: string; back: string; chapter?: unknown } =>
        !!c && typeof (c as { front?: unknown }).front === 'string' && typeof (c as { back?: unknown }).back === 'string',
      )
      .map((c) => ({
        front: c.front,
        back: c.back,
        chapter: typeof c.chapter === 'string' && c.chapter.trim() ? c.chapter.trim() : 'General',
      }))
  } catch {
    logger.warn({ raw: raw.slice(0, 200) }, 'study.card_parse_failed')
    return []
  }
}

const MAX_CARDS_PER_DOC = 80

async function generateCards(
  text: string,
  topicId: string,
  accountId: string,
  documentId: string,
): Promise<GenCard[]> {
  const batches = batchText(text)
  const all: GenCard[] = []
  for (const batch of batches) {
    if (all.length >= MAX_CARDS_PER_DOC) break
    try {
      const cards = await generateCardsForBatch(batch)
      all.push(...cards)
    } catch (err) {
      logger.warn({ err: String(err).slice(0, 120), documentId }, 'study.card_batch_failed')
    }
  }

  // Dedupe near-identical fronts (cross-batch overlap) and cap.
  const seen = new Set<string>()
  const cards = all
    .filter((c) => {
      const key = c.front.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_CARDS_PER_DOC)

  if (cards.length === 0) {
    logger.warn({ documentId }, 'study.no_cards_generated')
    return []
  }

  await db.insert(studyCards).values(cards.map((card) => ({
    topicId,
    accountId,
    documentId,
    chapter: card.chapter,
    front: card.front,
    back: card.back,
    status: 'new' as const,
    nextReviewAt: new Date(),
  })))

  logger.info({ documentId, cardCount: cards.length, batches: batches.length }, 'study.cards_generated')
  return cards
}
