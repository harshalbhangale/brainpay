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

/** A single concept the viva touched, with how well the student handled it. */
export type ConceptRating = {
  name: string
  /** 1 = needs work · 2 = getting there · 3 = strong */
  rating: 1 | 2 | 3
}

/**
 * Rich, kid-friendly analysis of a spoken viva. This is the headline payload the
 * app shows after an interview, in Past interviews, and to parents.
 */
export type InterviewAnalysis = {
  score: number // 1-10
  /** Short level label, e.g. "Beginning" | "Developing" | "Proficient" | "Mastering". */
  level: string
  /** A punchy, encouraging one-liner for the kid (e.g. "You really get fractions!"). */
  headline: string
  /** One or two warm sentences summarising how it went. */
  summary: string
  /** What the student did well (1-3). */
  strengths: string[]
  /** Specific gaps to work on (1-3). Mirrored into keepPractising for back-compat. */
  weakPoints: string[]
  /** Concrete, actionable next steps (2-3). */
  recommendations: string[]
  /** Per-concept handling, for a quick visual breakdown. */
  concepts: ConceptRating[]
  /** A motivating closing line for the kid. */
  encouragement: string
}

export type InterviewScore = { score: number; summary: string; keepPractising: string[]; analysis: InterviewAnalysis }

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
  analysis: InterviewAnalysis | null
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

  const fallback = (score: number): InterviewScore => {
    const analysis: InterviewAnalysis = {
      score,
      level: levelFor(score),
      headline: 'Nice effort — every interview makes you sharper!',
      summary: 'Good effort today. Keep explaining ideas out loud and you\'ll keep climbing.',
      strengths: [],
      weakPoints: [],
      recommendations: ['Review the concepts you found tricky, then try another interview.'],
      concepts: [],
      encouragement: "You showed up and tried — that's how brains grow. 💪",
    }
    return { score, summary: analysis.summary, keepPractising: [], analysis }
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert, warm oral examiner analysing a child's spoken viva (oral exam). Judge how well they EXPLAINED and REASONED about ideas in their OWN words — understanding, application, reasoning and communication — not rote recall. Be honest but kind and age-appropriate; speak TO the child ("you").

Return ONLY JSON with this exact shape:
{
  "score": <integer 1-10>,
  "level": "<one of: Beginning, Developing, Proficient, Mastering>",
  "headline": "<one punchy, encouraging line addressed to the child, max 8 words>",
  "summary": "<1-2 warm sentences on how it went, addressed to the child>",
  "strengths": ["<1-3 specific things they did well; name the concept>"],
  "weakPoints": ["<1-3 specific gaps/misunderstandings; name the concept>"],
  "recommendations": ["<2-3 concrete, actionable next steps; specific, not generic>"],
  "concepts": [{"name":"<concept discussed>","rating":<1=needs work,2=getting there,3=strong>}],
  "encouragement": "<one motivating closing line for the child>"
}
Only include concepts that actually came up. If the transcript is empty or too short to judge, give a low score and say so kindly.`,
        },
        {
          role: 'user',
          content: `Concepts in scope:\n${concepts}\n\nTranscript:\n${convo || '(no transcript captured)'}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)))
    const strArr = (v: unknown, n: number): string[] =>
      Array.isArray(v) ? v.slice(0, n).map((x) => String(x)).filter((s) => s.trim()) : []
    const conceptArr: ConceptRating[] = Array.isArray(parsed.concepts)
      ? parsed.concepts
          .slice(0, 8)
          .map((c: { name?: unknown; rating?: unknown }) => ({
            name: String(c?.name ?? '').slice(0, 80),
            rating: (Math.max(1, Math.min(3, Math.round(Number(c?.rating) || 2))) as 1 | 2 | 3),
          }))
          .filter((c: ConceptRating) => c.name.trim())
      : []
    const analysis: InterviewAnalysis = {
      score,
      level: typeof parsed.level === 'string' && parsed.level.trim() ? parsed.level : levelFor(score),
      headline: typeof parsed.headline === 'string' && parsed.headline.trim() ? parsed.headline : 'Great work today!',
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary : 'Nice effort — keep practising!',
      strengths: strArr(parsed.strengths, 3),
      weakPoints: strArr(parsed.weakPoints, 3),
      recommendations: strArr(parsed.recommendations, 3),
      concepts: conceptArr,
      encouragement: typeof parsed.encouragement === 'string' && parsed.encouragement.trim() ? parsed.encouragement : "You're getting sharper every time. 🚀",
    }
    return { score, summary: analysis.summary, keepPractising: analysis.weakPoints, analysis }
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'study.interview_score_failed')
    return fallback(5)
  }
}

function levelFor(score: number): string {
  if (score >= 9) return 'Mastering'
  if (score >= 7) return 'Proficient'
  if (score >= 4) return 'Developing'
  return 'Beginning'
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
      analysis: (iv.analysis as InterviewAnalysis | null) ?? null,
    }
  }

  const transcript = input.transcript ?? []
  let score = input.score
  let summary = input.summary
  let keepPractising = input.keepPractising ?? []
  let analysis: InterviewAnalysis | null = null

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
      analysis: null,
    }
  }

  if (transcript.length > 0) {
    const s = await scoreInterview((iv.focusAreas as string[]) ?? [], transcript)
    analysis = s.analysis
    if (score == null) score = s.score
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
      analysis,
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
    analysis,
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
