import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db } from '../db'
import { accounts, chores, families, goals, ledger, memberships } from '../db/schema'

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
      callerRole: 'unknown',
      callerName,
      callerBalance,
      familyId: null,
      familyName: null,
      kids: [],
      isParent: false,
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
      const persona = (kid.persona ?? {}) as { name?: string; age?: number; streak?: number }

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

      return {
        accountId: kid.accountId,
        name: persona.name ?? 'Kid',
        age: persona.age,
        balance: kid.cachedBalance,
        streak: persona.streak ?? 0,
        pendingChores: pendingChoreRows.length,
        recentActivity,
        activeGoal: activeGoal ?? undefined,
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
      ? `Active goal: ${kid.activeGoal.name} (${kid.activeGoal.currentBrains}/${kid.activeGoal.targetBrains} 🧠)`
      : 'No active goal.'

    return `You are PAL — a sarcastic, dry-witted money buddy for kids aged 10-14.
You are talking to ${ctx.callerName}.
Their balance: ${ctx.callerBalance} 🧠.
${goalLine}
Streak: ${kid?.streak ?? 0} days.
Pending chores: ${kid?.pendingChores ?? 0}.

Recent activity (last 7 days):
${ctx.kids.find(k => k.accountId === ctx.callerId)?.recentActivity.slice(0, 5).map(a =>
  `- ${a.kind}: ${a.brainsDelta >= 0 ? '+' : ''}${a.brainsDelta} 🧠`
).join('\n') || '- No recent activity.'}

Rules:
- Be concise. Max 2 sentences unless explaining something complex.
- Never lecture. Never say "you should" or "remember".
- Be helpful and a little sarcastic. The kid is the friend.
- When asked about balance, goals, or chores — give exact numbers.
- When asked "should I buy X?" — give a quick verdict with a reason.`
  }

  // Parent style.
  const kidLines = ctx.kids.map((k) => {
    const goalLine = k.activeGoal
      ? `goal: ${k.activeGoal.name} ${k.activeGoal.currentBrains}/${k.activeGoal.targetBrains}`
      : 'no goal'
    return `- ${k.name}${k.age ? ` (${k.age}yo)` : ''}: ${k.balance} 🧠, streak ${k.streak}d, ${k.pendingChores} pending chores, ${goalLine}`
  }).join('\n')

  return `You are PAL — a smart, slightly sarcastic family money assistant.
You are talking to ${ctx.callerName}, a parent.
Family has ${ctx.kids.length} kid${ctx.kids.length === 1 ? '' : 's'}:
${kidLines || '- No kids yet.'}

Rules:
- Be concise and direct. Parents are busy.
- When asked about a kid, use their exact name and real numbers.
- You can help create chores, top up kids, and set goals — but always show a preview first.
- Tone: warm but efficient. Not sycophantic.`
}
