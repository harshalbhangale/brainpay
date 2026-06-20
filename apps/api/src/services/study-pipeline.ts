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

    // Award brains for successful document upload
    const [membership] = await db
      .select({ familyId: memberships.familyId })
      .from(memberships)
      .where(eq(memberships.accountId, doc.accountId))
      .limit(1)
    if (membership?.familyId) {
      await awardStudyBrains(doc.accountId, membership.familyId, 'study_upload', STUDY_REWARD_AMOUNTS.study_upload, { documentId })
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

// ─── Card generation ──────────────────────────────────────────────────

async function generateCards(
  text: string,
  topicId: string,
  accountId: string,
  documentId: string,
): Promise<{ front: string; back: string }[]> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a study card generator for a student. Create flashcards from the provided text.
Each card should test ONE concept. The front is a question, the back is a concise answer.
Return JSON array: [{"front": "...", "back": "..."}]
Generate 5-15 cards depending on content density. Focus on key definitions, formulas, and important facts.`,
      },
      { role: 'user', content: text.slice(0, 6000) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
  })

  let cards: { front: string; back: string }[] = []
  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    cards = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }

  if (cards.length === 0) return []

  // Insert all cards
  const values = cards.map((card) => ({
    topicId,
    accountId,
    documentId,
    front: card.front,
    back: card.back,
    status: 'new' as const,
    nextReviewAt: new Date(),
  }))

  await db.insert(studyCards).values(values)

  return cards
}
