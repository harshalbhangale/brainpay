import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { studyCards, studyTopics } from '../db/study-schema'
import { sendPushToAccount } from './push'
import { logger } from '../logger'

const NUDGE_MESSAGES = [
  (fading: number) =>
    `Your brain is leaking! 🧠💧 ${fading} cards fading. Quick 3-min review?`,
  (_fading: number, concept?: string) =>
    concept
      ? `Hey! ${concept} is fading from memory. Save it before it's gone!`
      : `Hey! Your knowledge is fading from memory. Save it before it's gone!`,
  (_fading: number) =>
    `Your streak is about to break! Just 5 cards to keep it alive 🔥`,
]

/**
 * Finds kids with study topics who haven't reviewed in 2+ days and sends nudges.
 */
export async function checkAndSendStudyNudges(): Promise<number> {
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  // Find accounts with study topics that have unreviewed/fading cards
  const staleAccounts = await db
    .select({
      accountId: studyTopics.accountId,
      topicTitle: studyTopics.title,
    })
    .from(studyTopics)
    .where(eq(studyTopics.status, 'active'))
    .groupBy(studyTopics.accountId, studyTopics.title)

  let nudgesSent = 0

  for (const row of staleAccounts) {
    // Check if this kid has any card reviewed in last 2 days
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyCards)
      .where(
        and(
          eq(studyCards.accountId, row.accountId),
          sql`${studyCards.lastReviewedAt} > ${twoDaysAgo}`,
        ),
      )

    if ((recent?.count ?? 0) > 0) continue // Active learner, skip

    // Count fading cards
    const [fading] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyCards)
      .where(
        and(
          eq(studyCards.accountId, row.accountId),
          lt(studyCards.nextReviewAt, new Date()),
        ),
      )

    const fadingCount = fading?.count ?? 0
    if (fadingCount === 0) continue

    // Pick a random nudge message
    const msgFn = NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)]
    const body = msgFn(fadingCount, row.topicTitle)

    try {
      await sendPushToAccount(row.accountId, {
        title: '📚 Study Reminder',
        body,
        data: { screen: 'study-home' },
      })
      nudgesSent++
    } catch (err) {
      logger.warn({ err: String(err), accountId: row.accountId }, 'study_nudge.send_failed')
    }
  }

  logger.info({ nudgesSent }, 'study_nudges.complete')
  return nudgesSent
}
