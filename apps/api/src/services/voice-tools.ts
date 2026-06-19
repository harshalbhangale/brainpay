import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { accounts, chores, memberships } from '../db/schema'
import { logger } from '../logger'
import { sendPushToAccount, PushTemplates } from './push'
import { sendSms, sendSmsToAccount, SmsTemplates } from './sms'

/**
 * Voice tool layer — the ONLY way the voice agent touches business logic.
 *
 * Two tools exposed to the OpenAI Realtime session:
 *   find_child   — resolve a child by name within the caller's family
 *   create_task  — create a chore (status 'pending'), notify parent + kid
 *
 * Money safety: voice can CREATE tasks but NEVER credits a wallet. Payout
 * only happens through the existing chores parent_approved → paid path.
 *
 * All functions validate: caller identity, family membership, parent role.
 */

// ─── OpenAI tool schemas (passed to session.update) ───────────────────
export const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'find_child',
    description:
      "Find a child in the calling parent's family by name. Call this before create_task to resolve the child's id. Returns the matched child or a list of options if ambiguous.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "The child's name as spoken by the parent" },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'create_task',
    description:
      'Create a task (chore) for a child. Only call after find_child has resolved a childId and you have confirmed the title and reward with the parent.',
    parameters: {
      type: 'object',
      properties: {
        childId: { type: 'string', description: 'The resolved child account id from find_child' },
        title: { type: 'string', description: 'Short task title, e.g. "Finish math homework"' },
        rewardBrains: {
          type: 'number',
          description: 'Reward in Brain Points (1 Brain = 1 cent). e.g. $5 = 500.',
        },
      },
      required: ['childId', 'title', 'rewardBrains'],
    },
  },
] as const

// ─── Identity: resolve the calling parent from their phone number ─────
export async function resolveCallerParent(fromPhone: string): Promise<{
  accountId: string
  familyId: string
  name: string
} | null> {
  const [acct] = await db
    .select({ id: accounts.id, persona: accounts.persona })
    .from(accounts)
    .where(eq(accounts.phone, fromPhone))
    .limit(1)

  if (!acct) return null

  const [member] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, acct.id))
    .limit(1)

  if (!member) return null
  if (!['primary_parent', 'co_parent'].includes(member.role)) return null

  const persona = (acct.persona ?? {}) as { name?: string }
  return { accountId: acct.id, familyId: member.familyId, name: persona.name ?? 'there' }
}

// ─── Tool: find_child ─────────────────────────────────────────────────
export async function toolFindChild(
  familyId: string,
  query: string,
): Promise<{ matched?: { id: string; name: string }; options?: { id: string; name: string }[] }> {
  const kids = await db
    .select({ accountId: memberships.accountId, persona: accounts.persona })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

  const named = kids.map((k) => ({
    id: k.accountId,
    name: ((k.persona ?? {}) as { name?: string }).name ?? 'Kid',
  }))

  const q = query.trim().toLowerCase()
  const exact = named.filter((k) => k.name.toLowerCase() === q)
  if (exact.length === 1) return { matched: exact[0] }

  const partial = named.filter((k) => k.name.toLowerCase().includes(q) || q.includes(k.name.toLowerCase()))
  if (partial.length === 1) return { matched: partial[0] }

  // Ambiguous or no match — return all options for the agent to clarify.
  return { options: named }
}

// ─── Tool: create_task ────────────────────────────────────────────────
// Idempotency: skip if an identical pending task for this child was made
// in the last 5 minutes (guards against double tool-calls on one call).
export async function toolCreateTask(opts: {
  parentId: string
  parentName: string
  familyId: string
  childId: string
  title: string
  rewardBrains: number
}): Promise<{ ok: boolean; choreId?: string; childName: string; error?: string }> {
  const { parentId, parentName, familyId, childId, title, rewardBrains } = opts

  // Validate child is a kid in this family.
  const [kidMember] = await db
    .select({ familyId: memberships.familyId, role: memberships.role, persona: accounts.persona, phone: accounts.phone })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(eq(memberships.accountId, childId))
    .limit(1)

  if (!kidMember || kidMember.familyId !== familyId || kidMember.role !== 'kid') {
    return { ok: false, childName: 'kid', error: 'child_not_in_family' }
  }

  const childName = ((kidMember.persona ?? {}) as { name?: string }).name ?? 'your kid'
  const reward = Math.max(1, Math.min(100_000, Math.round(rewardBrains)))

  // Idempotency — recent identical pending task.
  const recent = await db
    .select({ id: chores.id, status: chores.status, title: chores.title, createdAt: chores.createdAt })
    .from(chores)
    .where(and(eq(chores.assignedTo, childId), eq(chores.status, 'pending')))

  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  const dupe = recent.find(
    (r) => r.title.trim().toLowerCase() === title.trim().toLowerCase() && new Date(r.createdAt).getTime() > fiveMinAgo,
  )
  if (dupe) {
    logger.info({ choreId: dupe.id }, 'voice_tools.create_task.idempotent_skip')
    return { ok: true, choreId: dupe.id, childName }
  }

  const [chore] = await db
    .insert(chores)
    .values({
      familyId,
      assignedTo: childId,
      createdBy: parentId,
      title: title.trim().slice(0, 200),
      rewardBrains: reward,
      status: 'pending',
    } as any)
    .returning()

  logger.info({ choreId: chore.id, childId, reward, via: 'voice_call' }, 'voice_tools.create_task')

  // Notify — SMS to parent (confirmation) + kid (assignment), push to kid.
  const parentMsg = SmsTemplates.taskCreated(childName, chore.title, reward)
  sendSmsToAccount(parentId, parentMsg).catch(() => undefined)

  if (kidMember.phone) {
    const kidMsg = SmsTemplates.taskAssigned(chore.title, reward)
    sendSms({ toPhone: kidMember.phone, accountId: childId, ...kidMsg }).catch(() => undefined)
  }
  sendPushToAccount(childId, PushTemplates.choreSubmitted(parentName, chore.title)).catch(() => undefined)

  return { ok: true, choreId: chore.id, childName }
}
