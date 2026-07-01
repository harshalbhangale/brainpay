import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { accounts, ledger, memberships } from '../db/schema'
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

/** Family-wide, parent-tunable study-to-earn config (stored on the primary parent). */
export type StudyRewardConfig = { enabled: boolean } & Record<StudyRewardKind, number>

export const DEFAULT_STUDY_REWARDS: StudyRewardConfig = { enabled: true, ...STUDY_REWARD_AMOUNTS }

/** The family's primary parent (where the shared reward config lives). */
export async function getFamilyPrimaryParent(familyId: string): Promise<{ accountId: string; persona: Record<string, unknown> } | null> {
  const [row] = await db
    .select({ accountId: memberships.accountId, persona: accounts.persona })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'primary_parent')))
    .limit(1)
  if (!row) return null
  return { accountId: row.accountId, persona: (row.persona ?? {}) as Record<string, unknown> }
}

/** Resolve the family's study-to-earn amounts (parent overrides merged over defaults). */
export async function resolveStudyRewards(familyId: string): Promise<StudyRewardConfig> {
  const parent = await getFamilyPrimaryParent(familyId)
  const cfg = (parent?.persona?.studyRewards ?? {}) as Partial<StudyRewardConfig>
  return {
    enabled: cfg.enabled !== false,
    study_upload: clampAmt(cfg.study_upload, STUDY_REWARD_AMOUNTS.study_upload),
    study_quiz_pass: clampAmt(cfg.study_quiz_pass, STUDY_REWARD_AMOUNTS.study_quiz_pass),
    study_quiz_perfect: clampAmt(cfg.study_quiz_perfect, STUDY_REWARD_AMOUNTS.study_quiz_perfect),
    study_review_session: clampAmt(cfg.study_review_session, STUDY_REWARD_AMOUNTS.study_review_session),
    study_streak: clampAmt(cfg.study_streak, STUDY_REWARD_AMOUNTS.study_streak),
  }
}

function clampAmt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1000, Math.round(v))) : fallback
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
