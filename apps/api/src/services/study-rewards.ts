import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { accounts, ledger } from '../db/schema'
import { logger } from '../logger'

export type StudyRewardKind =
  | 'study_upload'
  | 'study_quiz_pass'
  | 'study_quiz_perfect'
  | 'study_review_session'
  | 'study_streak'

export const STUDY_REWARD_AMOUNTS: Record<StudyRewardKind, number> = {
  study_upload: 5,
  study_quiz_pass: 15,
  study_quiz_perfect: 30,
  study_review_session: 5,
  study_streak: 50,
}

export async function awardStudyBrains(
  accountId: string,
  familyId: string,
  kind: StudyRewardKind,
  amount: number,
  metadata: Record<string, unknown> = {},
): Promise<{ balanceAfter: number }> {
  return db.transaction(async (tx) => {
    const [acct] = await tx
      .select({ cachedBalance: accounts.cachedBalance })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for('update')

    if (!acct) throw new Error(`account_not_found:${accountId}`)

    const balanceAfter = acct.cachedBalance + amount

    await tx
      .update(accounts)
      .set({ cachedBalance: sql`${accounts.cachedBalance} + ${amount}` })
      .where(eq(accounts.id, accountId))

    await tx.insert(ledger).values({
      familyId,
      accountId,
      actorId: accountId,
      kind,
      brainsDelta: amount,
      balanceAfter,
      metadata: { ...metadata, source: 'study_reward' },
    })

    logger.info({ accountId, kind, amount, balanceAfter }, 'study.reward_awarded')
    return { balanceAfter }
  })
}
