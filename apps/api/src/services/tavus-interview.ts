/**
 * Interview scoring + completion (shared by the authed complete route and the
 * Tavus webhook). Scores the spoken interview from its transcript, stores the
 * AI summary + webcam focus/integrity signals, ends the Tavus room, and awards
 * Brains through the ledger — guarded so it only happens once.
 */
import { eq, sql } from 'drizzle-orm'
import OpenAI from 'openai'
import { db } from '../db'
import { accounts, ledger, memberships } from '../db/schema'
import { studyInterviews } from '../db/study-schema'
import { logger } from '../logger'
import { endConversation } from './tavus'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type TranscriptLine = { role: string; text: string }
export type InterviewFocus = { lookingPct?: number; flags?: string[]; notes?: string }

export type InterviewScore = { score: number; summary: string; keepPractising: string[] }

export type CompleteInput = {
  transcript?: TranscriptLine[]
  focus?: InterviewFocus | null
  durationSecs?: number
  /** When the client/model already produced a score, trust it; else we derive one. */
  score?: number
  summary?: string
  keepPractising?: string[]
}

export type CompleteResult = {
  ok: true
  brainsEarned: number
  score: number | null
  summary: string | null
  keepPractising: string[]
  focus: InterviewFocus | null
}

async function getFamilyId(accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  return row?.familyId ?? null
}

/** Grade how well the student EXPLAINED the concepts (not just recalled them). */
export async function scoreInterview(focusAreas: string[], transcript: TranscriptLine[]): Promise<InterviewScore> {
  const convo = transcript
    .filter((t) => t.text?.trim())
    .map((t) => `${t.role === 'kid' || t.role === 'you' || t.role === 'user' ? 'Student' : 'Tutor'}: ${t.text}`)
    .join('\n')
    .slice(0, 8000)
  const concepts = focusAreas.slice(0, 20).map((f) => `- ${f}`).join('\n') || '(general review)'

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are grading a kid's spoken study interview. Judge how well they EXPLAINED the ideas in their own words (understanding, not just recall). Be honest but encouraging.
Return ONLY JSON: {"score": <integer 1-10>, "summary": "<warm one-sentence summary>", "keepPractising": ["<1-3 specific, actionable things to practise; name the concept>"]}`,
        },
        {
          role: 'user',
          content: `Concepts being reviewed:\n${concepts}\n\nTranscript:\n${convo || '(no transcript captured)'}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)))
    return {
      score,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Nice effort — keep practising!',
      keepPractising: Array.isArray(parsed.keepPractising) ? parsed.keepPractising.slice(0, 3).map(String) : [],
    }
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'study.interview_score_failed')
    return { score: 5, summary: 'Good effort — keep practising!', keepPractising: [] }
  }
}

/**
 * Complete an interview: score (if needed), persist, end the Tavus room, award
 * Brains. Idempotent — a second call (e.g. webhook after the client) is a no-op.
 * Pass `accountId` to enforce ownership (authed route); omit it for the webhook.
 */
export async function completeInterview(
  interviewId: string,
  accountId: string | null,
  input: CompleteInput,
): Promise<CompleteResult | { error: string }> {
  const [iv] = await db
    .select()
    .from(studyInterviews)
    .where(eq(studyInterviews.id, interviewId))
    .limit(1)
  if (!iv) return { error: 'not_found' }
  if (accountId && iv.accountId !== accountId) return { error: 'forbidden' }

  if (iv.status === 'completed') {
    return {
      ok: true,
      brainsEarned: iv.brainsEarned ?? 0,
      score: iv.score ?? null,
      summary: iv.summary ?? null,
      keepPractising: (iv.keepPractising as string[]) ?? [],
      focus: (iv.focus as InterviewFocus | null) ?? null,
    }
  }

  const transcript = input.transcript ?? []
  let score = input.score
  let summary = input.summary
  let keepPractising = input.keepPractising ?? []

  // Nothing to grade (a dropped connection, or the real transcript will arrive
  // via the Tavus webhook). Don't finalize or award a default score — leave the
  // interview open so a later webhook can complete it properly.
  if (transcript.length === 0 && score == null) {
    return {
      ok: true,
      brainsEarned: 0,
      score: null,
      summary: null,
      keepPractising: [],
      focus: input.focus ?? null,
    }
  }

  if (score == null && transcript.length > 0) {
    const s = await scoreInterview((iv.focusAreas as string[]) ?? [], transcript)
    score = s.score
    summary = summary ?? s.summary
    if (keepPractising.length === 0) keepPractising = s.keepPractising
  }

  const brainsEarned = Math.max(5, Math.min(25, (score ?? 5) * 3))

  await db
    .update(studyInterviews)
    .set({
      status: 'completed',
      transcript,
      score: score ?? null,
      summary: summary ?? null,
      keepPractising,
      focus: input.focus ?? null,
      durationSecs: input.durationSecs ?? 0,
      brainsEarned,
      completedAt: new Date(),
    })
    .where(eq(studyInterviews.id, interviewId))

  if (iv.tavusConversationId) void endConversation(iv.tavusConversationId)

  const familyId = await getFamilyId(iv.accountId)
  if (familyId) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(accounts)
          .set({ cachedBalance: sql`${accounts.cachedBalance} + ${brainsEarned}` })
          .where(eq(accounts.id, iv.accountId))
        await tx.insert(ledger).values({
          familyId,
          accountId: iv.accountId,
          actorId: iv.accountId,
          kind: 'study_interview',
          brainsDelta: brainsEarned,
          balanceAfter: sql`(select cached_balance from accounts where id = ${iv.accountId})`,
          metadata: { interviewId, topicId: iv.topicId, chapter: iv.chapter ?? null },
        })
      })
    } catch (err) {
      logger.warn({ err: String(err).slice(0, 120), interviewId }, 'study.interview_award_failed')
    }
  }

  return {
    ok: true,
    brainsEarned,
    score: score ?? null,
    summary: summary ?? null,
    keepPractising,
    focus: input.focus ?? null,
  }
}

/** Handle a Tavus conversation webhook (transcription ready / conversation ended). */
export async function handleTavusWebhook(payload: unknown): Promise<{ handled: boolean }> {
  const ev = (payload ?? {}) as {
    event_type?: string
    conversation_id?: string
    properties?: { transcript?: TranscriptLine[]; duration?: number }
  }
  const conversationId = ev.conversation_id
  if (!conversationId) return { handled: false }

  // Only act on terminal events that carry (or imply) the transcript.
  const terminal = ['application.transcription_ready', 'conversation.ended', 'system.shutdown']
  if (ev.event_type && !terminal.includes(ev.event_type)) return { handled: false }

  const [iv] = await db
    .select({ id: studyInterviews.id })
    .from(studyInterviews)
    .where(eq(studyInterviews.tavusConversationId, conversationId))
    .limit(1)
  if (!iv) return { handled: false }

  const transcript = ev.properties?.transcript ?? []
  await completeInterview(iv.id, null, { transcript, durationSecs: ev.properties?.duration ?? 0 })
  return { handled: true }
}
