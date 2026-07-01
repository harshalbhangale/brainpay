import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { accounts, chores, families, goals, ledger, memberships } from '../db/schema'
import { studyTopics, studyInterviews, studyStreaks } from '../db/study-schema'

/**
 * PAL Context Loader — builds a rich family snapshot for the LLM.
 *
 * Called before every chat completion so PAL knows:
 *   - Who the caller is (parent or kid)
 *   - All kids in the family with balances, goals, streaks
 *   - Recent ledger activity (last 7 days)
 *   - Pending chores
 *
 * Kept as a pure async function so it's easy to test and cache later.
 */

export type KidSummary = {
  accountId: string
  name: string
  age?: number
  balance: number
  streak: number
  pendingChores: number
  recentActivity: { kind: string; brainsDelta: number; metadata: unknown; createdAt: Date }[]
  activeGoal?: { name: string; targetBrains: number; currentBrains: number }
  interests?: string[]
  savingGoal?: string
  /** StudyPal snapshot so BrainPal can speak to learning, not just money. */
  study?: { subjects: number; totalCards: number; cardsDue: number; masteryPct: number; lastInterviewScore: number | null; streak: number }
}

export type PalContext = {
  callerId: string
  callerRole: string
  callerName: string
  callerBalance: number
  familyId: string | null
  familyName: string | null
  kids: KidSummary[]
  isParent: boolean
}

export async function loadPalContext(accountId: string): Promise<PalContext> {
  // Load caller account.
  const [caller] = await db
    .select({
      cachedBalance: accounts.cachedBalance,
      persona: accounts.persona,
      accountType: accounts.accountType,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  const callerPersona = (caller?.persona ?? {}) as { name?: string; age?: number }
  const callerName = callerPersona.name ?? 'User'
  const callerBalance = caller?.cachedBalance ?? 0

  // Load membership.
  const [memberRow] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)

  if (!memberRow) {
    return {
      callerId: accountId,
      callerRole: caller?.accountType ?? 'unknown',
      callerName,
      callerBalance,
      familyId: null,
      familyName: null,
      kids: [],
      // No membership yet: treat anyone not explicitly a kid as a parent, so a
      // freshly-onboarded parent (accountType still null) isn't dropped into kid mode.
      isParent: caller?.accountType !== 'kid',
    }
  }

  const { familyId, role } = memberRow
  const isParent = ['primary_parent', 'co_parent'].includes(role)

  // Load family name.
  const [famNameRow] = await db
    .select({ name: families.name })
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1)

  // Load all kids in the family.
  const allMembers = await db
    .select({
      accountId: memberships.accountId,
      role: memberships.role,
      persona: accounts.persona,
      cachedBalance: accounts.cachedBalance,
    })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(eq(memberships.familyId, familyId))

  const kids = allMembers.filter((m) => m.role === 'kid')

  // For each kid, load recent activity + pending chores + active goal.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const kidSummaries: KidSummary[] = await Promise.all(
    kids.map(async (kid) => {
      const persona = (kid.persona ?? {}) as { name?: string; age?: number; streak?: number; interests?: string[]; savingGoal?: string }

      // Recent ledger entries.
      const recentActivity = await db
        .select({
          kind: ledger.kind,
          brainsDelta: ledger.brainsDelta,
          metadata: ledger.metadata,
          createdAt: ledger.createdAt,
        })
        .from(ledger)
        .where(and(eq(ledger.accountId, kid.accountId), gte(ledger.createdAt, sevenDaysAgo)))
        .orderBy(desc(ledger.createdAt))
        .limit(10)

      // Pending chores count.
      const pendingChoreRows = await db
        .select({ id: chores.id })
        .from(chores)
        .where(
          and(
            eq(chores.assignedTo, kid.accountId),
            inArray(chores.status, ['pending', 'submitted', 'ai_approved', 'ai_uncertain']),
          ),
        )

      // Active goal.
      const [activeGoal] = await db
        .select({ name: goals.name, targetBrains: goals.targetBrains, currentBrains: goals.currentBrains })
        .from(goals)
        .where(and(eq(goals.accountId, kid.accountId), eq(goals.status, 'active')))
        .limit(1)

      // StudyPal snapshot — subjects, cards due, mastery, last viva, streak.
      const topicRows = await db
        .select({ total: studyTopics.totalCards, due: studyTopics.cardsDue })
        .from(studyTopics)
        .where(and(eq(studyTopics.accountId, kid.accountId), eq(studyTopics.status, 'active')))
      const totalCards = topicRows.reduce((a, r) => a + (r.total ?? 0), 0)
      const cardsDue = topicRows.reduce((a, r) => a + (r.due ?? 0), 0)
      const [iv] = await db
        .select({ score: studyInterviews.score })
        .from(studyInterviews)
        .where(and(eq(studyInterviews.accountId, kid.accountId), isNotNull(studyInterviews.score)))
        .orderBy(desc(studyInterviews.createdAt))
        .limit(1)
      const [streakRow] = await db
        .select({ s: studyStreaks.currentStreak })
        .from(studyStreaks)
        .where(eq(studyStreaks.accountId, kid.accountId))
        .limit(1)
      const study = {
        subjects: topicRows.length,
        totalCards,
        cardsDue,
        masteryPct: totalCards > 0 ? Math.round(((totalCards - cardsDue) / totalCards) * 100) : 0,
        lastInterviewScore: iv?.score ?? null,
        streak: streakRow?.s ?? 0,
      }

      return {
        accountId: kid.accountId,
        name: persona.name ?? 'Kid',
        age: persona.age,
        balance: kid.cachedBalance,
        streak: persona.streak ?? 0,
        pendingChores: pendingChoreRows.length,
        recentActivity,
        activeGoal: activeGoal ?? undefined,
        interests: persona.interests ?? [],
        savingGoal: persona.savingGoal ?? undefined,
        study,
      }
    }),
  )

  return {
    callerId: accountId,
    callerRole: role,
    callerName,
    callerBalance,
    familyId,
    familyName: famNameRow?.name ?? null,
    kids: kidSummaries,
    isParent,
  }
}

/**
 * Serialise context into a compact system-prompt string for the LLM.
 */
export function contextToSystemPrompt(ctx: PalContext, style: 'parent' | 'kid' = 'parent'): string {
  if (style === 'kid') {
    const kid = ctx.kids.find((k) => k.accountId === ctx.callerId) ?? ctx.kids[0]
    const goalLine = kid?.activeGoal
      ? `Active goal: ${kid.activeGoal.name} ($${kid.activeGoal.currentBrains} of $${kid.activeGoal.targetBrains})`
      : 'No active goal.'

    // Pull persona fields set during onboarding
    const kidPersona = kid as unknown as { spend_style?: string } | undefined
    const spendStyle = kidPersona?.spend_style
    const spendLine = spendStyle
      ? `Spend style: ${spendStyle === 'impulse' ? 'impulse spender — apply more friction' : spendStyle === 'saver' ? 'natural saver — celebrate streaks' : 'mixed spender'}.`
      : ''
    const interestsLine = kid?.interests && kid.interests.length
      ? `They love: ${kid.interests.join(', ')} — weave these in when you give examples.`
      : ''
    const savingLine = kid?.savingGoal ? `They're saving up for: ${kid.savingGoal} — connect money tips to this.` : ''
    const st = kid?.study
    const studyLine = st && st.subjects > 0
      ? `Study: ${st.subjects} subject(s), ${st.cardsDue} card(s) to review, ${st.masteryPct}% mastered${st.lastInterviewScore != null ? `, last interview ${st.lastInterviewScore}/10` : ''}, study streak ${st.streak} day(s).`
      : 'Study: nothing set up yet.'

    return `You are PAL — a warm, encouraging money & study buddy for kids aged 10-14.
You are talking to ${ctx.callerName}.
Their balance: $${ctx.callerBalance} AUD.
${goalLine}
Streak: ${kid?.streak ?? 0} days.
Pending jobs: ${kid?.pendingChores ?? 0}.
${studyLine}
${spendLine}
${interestsLine}
${savingLine}

Recent activity (last 7 days):
${ctx.kids.find(k => k.accountId === ctx.callerId)?.recentActivity.slice(0, 5).map(a =>
  `- ${a.kind}: ${a.brainsDelta >= 0 ? '+' : ''}$${a.brainsDelta}`
).join('\n') || '- No recent activity.'}

Rules:
- Be concise and warm. Max 2 sentences unless explaining something.
- Encouraging and clear. Never lecture, never sarcastic.
- For money, goals, jobs or study — give the exact numbers above.
- When asked "should I buy X?" give a quick, kind verdict with a reason.`
  }

  // Parent style — use onboarding persona fields to personalise
  const parentPersona = {} as {
    money_upbringing?: string
    parenting_style?: string
    primary_goal?: string
    kid_situation?: string
  }
  // (persona fields are on the account row, not in ctx directly — PAL uses them via tone)

  const kidLines = ctx.kids.map((k) => {
    const goalLine = k.activeGoal
      ? `goal: ${k.activeGoal.name} $${k.activeGoal.currentBrains}/$${k.activeGoal.targetBrains}`
      : 'no goal'
    const st = k.study
    const studyLine = st && st.subjects > 0
      ? `; study: ${st.subjects} subj, ${st.cardsDue} cards due, ${st.masteryPct}% mastered${st.lastInterviewScore != null ? `, last viva ${st.lastInterviewScore}/10` : ''}`
      : ''
    return `- ${k.name}${k.age ? ` (${k.age}yo)` : ''}: $${k.balance} AUD, streak ${k.streak}d, ${k.pendingChores} pending jobs, ${goalLine}${studyLine}`
  }).join('\n')

  const familyBlock = ctx.kids.length === 0
    ? `${ctx.callerName} hasn't added any kids yet. If they ask about kids, balances, jobs, allowance, goals or study, tell them they can add a child in the Family tab (the "Add child" button) — then you'll be able to help. Do NOT invent kids or numbers.`
    : `${ctx.callerName}'s family — ${ctx.kids.length} kid${ctx.kids.length === 1 ? '' : 's'}:\n${kidLines}`

  return `You are PAL — a smart, warm, clear family assistant for BrainPal. You help with both money AND study.
You are talking to ${ctx.callerName}, a parent. Total in their own wallet: $${ctx.callerBalance} AUD.

${familyBlock}

The snapshot above is current and real — it's your source of truth for money AND study. When asked about a kid — balance, jobs, allowance, goals, subjects, cards due, mastery or interview scores — answer DIRECTLY using these exact names and numbers. Never claim you don't have access; if a specific value isn't in the snapshot, say it isn't set up yet.

Rules:
- Be concise, warm and direct. Parents are busy. Money is AUD ($).
- Use the kids' real names. If they have no kids yet, guide them to add one.
- You can create jobs, top up a kid, and set goals — show a preview first.
- Warm but efficient. Not sycophantic, no filler.`
}
