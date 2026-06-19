import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import {
  accounts,
  chores,
  familyRules,
  goals,
  ledger,
  memberships,
  sessions,
} from '../db/schema'

/**
 * Creates a new MCP server instance scoped to a parent's family.
 * Each connection gets its own server so tools are pre-scoped to accountId.
 */
export function createMcpServer(accountId: string) {
  const server = new McpServer({
    name: 'BrainPal',
    version: '1.0.0',
  })

  // ── Helper: resolve family + assert parent role ──────────────────────
  async function requireParentFamily() {
    const [row] = await db
      .select({ familyId: memberships.familyId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.accountId, accountId))
      .limit(1)
    if (!row) throw new Error('No family found for this account')
    if (!['primary_parent', 'co_parent', 'guardian'].includes(row.role)) {
      throw new Error('Only parents can use BrainPal MCP tools')
    }
    return row.familyId
  }

  // ── get_family_overview ──────────────────────────────────────────────
  server.tool(
    'get_family_overview',
    'Get all family members with their roles and current Brain balances',
    {},
    async () => {
      const familyId = await requireParentFamily()
      const members = await db
        .select({
          accountId: memberships.accountId,
          role: memberships.role,
          persona: accounts.persona,
          cachedBalance: accounts.cachedBalance,
          accountType: accounts.accountType,
        })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .where(eq(memberships.familyId, familyId))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(members, null, 2) }],
      }
    },
  )

  // ── get_kid_balance ──────────────────────────────────────────────────
  server.tool(
    'get_kid_balance',
    "Get a specific kid's current Brain balance by their name",
    { kidName: z.string().describe("The kid's name") },
    async ({ kidName }) => {
      const familyId = await requireParentFamily()
      const members = await db
        .select({
          accountId: memberships.accountId,
          persona: accounts.persona,
          cachedBalance: accounts.cachedBalance,
        })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

      const kid = members.find((m) => {
        const name = (m.persona as { name?: string } | null)?.name ?? ''
        return name.toLowerCase().includes(kidName.toLowerCase())
      })

      if (!kid) return { content: [{ type: 'text' as const, text: `No kid named "${kidName}" found in your family` }] }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ name: kidName, balance: kid.cachedBalance }, null, 2) }],
      }
    },
  )

  // ── list_spending ────────────────────────────────────────────────────
  server.tool(
    'list_spending',
    'List recent spending transactions for a kid (or all kids). Shows what items were purchased and how many Brains were spent.',
    {
      kidName: z.string().optional().describe("Filter by kid name (optional — omit for all kids)"),
      limit: z.number().min(1).max(50).default(20).describe('Max results (default 20)'),
    },
    async ({ kidName, limit }) => {
      const familyId = await requireParentFamily()

      // If kidName provided, resolve to accountId
      let kidAccountId: string | undefined
      if (kidName) {
        const members = await db
          .select({ accountId: memberships.accountId, persona: accounts.persona })
          .from(memberships)
          .innerJoin(accounts, eq(accounts.id, memberships.accountId))
          .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

        const kid = members.find((m) => {
          const name = (m.persona as { name?: string } | null)?.name ?? ''
          return name.toLowerCase().includes(kidName.toLowerCase())
        })
        if (!kid) return { content: [{ type: 'text' as const, text: `No kid named "${kidName}" found` }] }
        kidAccountId = kid.accountId
      }

      const conditions = [
        eq(ledger.familyId, familyId),
        sql`${ledger.kind} IN ('purchase', 'cart_checkout')`,
      ]
      if (kidAccountId) conditions.push(eq(ledger.accountId, kidAccountId))

      const entries = await db
        .select()
        .from(ledger)
        .where(and(...conditions))
        .orderBy(desc(ledger.createdAt))
        .limit(limit)

      const formatted = entries.map((e) => ({
        date: e.createdAt,
        brains: e.brainsDelta,
        item: (e.metadata as { itemName?: string })?.itemName ?? 'Unknown',
        amountCents: (e.metadata as { amountCents?: number })?.amountCents,
      }))

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] }
    },
  )

  // ── get_health_stats ─────────────────────────────────────────────────
  server.tool(
    'get_health_stats',
    "Get health-related statistics: camera scan sessions, healthy vs unhealthy purchases, and scan skip rewards. Shows how a kid interacts with the health features.",
    {
      kidName: z.string().optional().describe("Filter by kid name (optional)"),
      days: z.number().min(1).max(90).default(7).describe('Look-back period in days (default 7)'),
    },
    async ({ kidName, days }) => {
      const familyId = await requireParentFamily()

      // Resolve kid
      let kidAccountId: string | undefined
      if (kidName) {
        const members = await db
          .select({ accountId: memberships.accountId, persona: accounts.persona })
          .from(memberships)
          .innerJoin(accounts, eq(accounts.id, memberships.accountId))
          .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

        const kid = members.find((m) => {
          const name = (m.persona as { name?: string } | null)?.name ?? ''
          return name.toLowerCase().includes(kidName.toLowerCase())
        })
        if (!kid) return { content: [{ type: 'text' as const, text: `No kid named "${kidName}" found` }] }
        kidAccountId = kid.accountId
      }

      const since = new Date()
      since.setDate(since.getDate() - days)

      // Scan sessions
      const sessionConditions = kidAccountId
        ? and(eq(sessions.accountId, kidAccountId), gte(sessions.startedAt, since))
        : gte(sessions.startedAt, since)

      const scanSessions = await db
        .select({
          totalSessions: sql<number>`count(*)::int`,
          totalDetections: sql<number>`coalesce(sum(${sessions.detections}), 0)::int`,
          totalFrames: sql<number>`coalesce(sum(${sessions.framesSent}), 0)::int`,
        })
        .from(sessions)
        .where(sessionConditions)

      // Health-related ledger entries (scan_skip_reward = kid chose healthy)
      const ledgerConditions = [
        eq(ledger.familyId, familyId),
        gte(ledger.createdAt, since),
        sql`${ledger.kind} IN ('scan_skip_reward', 'purchase', 'cart_checkout')`,
      ]
      if (kidAccountId) ledgerConditions.push(eq(ledger.accountId, kidAccountId))

      const healthLedger = await db
        .select({
          kind: ledger.kind,
          count: sql<number>`count(*)::int`,
          totalBrains: sql<number>`coalesce(sum(${ledger.brainsDelta}), 0)::int`,
        })
        .from(ledger)
        .where(and(...ledgerConditions))
        .groupBy(ledger.kind)

      // Family rules
      const rules = await db
        .select()
        .from(familyRules)
        .where(eq(familyRules.familyId, familyId))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            period: `Last ${days} days`,
            scanActivity: scanSessions[0] ?? { totalSessions: 0, totalDetections: 0, totalFrames: 0 },
            ledgerBreakdown: healthLedger,
            familyRules: rules.map((r) => ({ kind: r.kind, value: r.value })),
          }, null, 2),
        }],
      }
    },
  )

  // ── list_chores ──────────────────────────────────────────────────────
  server.tool(
    'list_chores',
    'List chores for the family. Shows status, assigned kid, reward, and completion info.',
    {
      status: z.string().optional().describe("Filter by status: pending, submitted, ai_approved, ai_rejected, parent_approved, parent_rejected, paid"),
    },
    async ({ status }) => {
      const familyId = await requireParentFamily()

      const conditions = [eq(chores.familyId, familyId)]
      if (status) conditions.push(eq(chores.status, status))

      const rows = await db
        .select()
        .from(chores)
        .where(and(...conditions))
        .orderBy(desc(chores.createdAt))
        .limit(50)

      // Enrich with kid names
      const kidIds = [...new Set(rows.map((r) => r.assignedTo))]
      const kids = kidIds.length
        ? await db
            .select({ id: accounts.id, persona: accounts.persona })
            .from(accounts)
            .where(sql`${accounts.id} IN ${kidIds}`)
        : []
      const kidMap = new Map(kids.map((k) => [k.id, (k.persona as { name?: string } | null)?.name ?? 'Unknown']))

      const formatted = rows.map((r) => ({
        id: r.id,
        title: r.title,
        assignedTo: kidMap.get(r.assignedTo) ?? r.assignedTo,
        rewardBrains: r.rewardBrains,
        status: r.status,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }))

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] }
    },
  )

  // ── list_goals ───────────────────────────────────────────────────────
  server.tool(
    'list_goals',
    "List savings goals for kids in the family. Shows progress toward each goal.",
    {
      status: z.string().optional().describe("Filter by status: active, completed, abandoned"),
    },
    async ({ status }) => {
      const familyId = await requireParentFamily()

      const conditions = [eq(goals.familyId, familyId)]
      if (status) conditions.push(eq(goals.status, status))

      const rows = await db
        .select()
        .from(goals)
        .where(and(...conditions))
        .orderBy(desc(goals.createdAt))
        .limit(50)

      // Enrich with kid names
      const kidIds = [...new Set(rows.map((r) => r.accountId).filter(Boolean))] as string[]
      const kids = kidIds.length
        ? await db
            .select({ id: accounts.id, persona: accounts.persona })
            .from(accounts)
            .where(sql`${accounts.id} IN ${kidIds}`)
        : []
      const kidMap = new Map(kids.map((k) => [k.id, (k.persona as { name?: string } | null)?.name ?? 'Unknown']))

      const formatted = rows.map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        kid: r.accountId ? kidMap.get(r.accountId) ?? r.accountId : 'Family goal',
        targetBrains: r.targetBrains,
        currentBrains: r.currentBrains,
        progress: `${Math.round((r.currentBrains / r.targetBrains) * 100)}%`,
        status: r.status,
      }))

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] }
    },
  )

  // ══════════════════════════════════════════════════════════════════════
  // WRITE TOOLS
  // ══════════════════════════════════════════════════════════════════════

  // ── create_chore ─────────────────────────────────────────────────────
  server.tool(
    'create_chore',
    'Create a new chore and assign it to a kid. The kid earns the reward Brains when the chore is approved.',
    {
      kidName: z.string().describe("The kid's name to assign the chore to"),
      title: z.string().describe('What the chore is (e.g. "Make your bed", "Walk the dog")'),
      rewardBrains: z.number().min(1).max(10000).describe('How many Brains the kid earns for completing it'),
    },
    async ({ kidName, title, rewardBrains }) => {
      const familyId = await requireParentFamily()

      const members = await db
        .select({ accountId: memberships.accountId, persona: accounts.persona })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

      const kid = members.find((m) => {
        const name = (m.persona as { name?: string } | null)?.name ?? ''
        return name.toLowerCase().includes(kidName.toLowerCase())
      })
      if (!kid) return { content: [{ type: 'text' as const, text: `No kid named "${kidName}" in your family` }] }

      const [chore] = await db
        .insert(chores)
        .values({
          familyId,
          assignedTo: kid.accountId,
          createdBy: accountId,
          title,
          rewardBrains,
          status: 'pending',
        })
        .returning()

      return { content: [{ type: 'text' as const, text: JSON.stringify({ created: true, choreId: chore.id, title, assignedTo: kidName, rewardBrains }, null, 2) }] }
    },
  )

  // ── approve_chore ────────────────────────────────────────────────────
  server.tool(
    'approve_chore',
    'Approve a submitted chore and pay the kid their reward Brains.',
    {
      choreId: z.string().describe('The chore ID to approve'),
    },
    async ({ choreId }) => {
      const familyId = await requireParentFamily()

      const [chore] = await db
        .select()
        .from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
        .limit(1)

      if (!chore) return { content: [{ type: 'text' as const, text: 'Chore not found' }] }
      const approvable = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']
      if (!approvable.includes(chore.status)) {
        return { content: [{ type: 'text' as const, text: `Chore can't be approved — current status: ${chore.status}` }] }
      }

      // Pay the kid atomically
      await db.transaction(async (tx) => {
        await tx
          .update(accounts)
          .set({ cachedBalance: sql`${accounts.cachedBalance} + ${chore.rewardBrains}` })
          .where(eq(accounts.id, chore.assignedTo))

        const [acct] = await tx.select({ cachedBalance: accounts.cachedBalance }).from(accounts).where(eq(accounts.id, chore.assignedTo))

        await tx.insert(ledger).values({
          familyId,
          accountId: chore.assignedTo,
          actorId: accountId,
          kind: 'chore_payout',
          brainsDelta: chore.rewardBrains,
          balanceAfter: acct.cachedBalance,
          metadata: { choreId: chore.id, choreTitle: chore.title, approvedBy: accountId },
        })

        await tx.update(chores).set({ status: 'paid', completedAt: new Date() }).where(eq(chores.id, choreId))
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ approved: true, choreId, title: chore.title, brainsPaid: chore.rewardBrains }, null, 2) }] }
    },
  )

  // ── reject_chore ─────────────────────────────────────────────────────
  server.tool(
    'reject_chore',
    'Reject a submitted chore with an optional note explaining why.',
    {
      choreId: z.string().describe('The chore ID to reject'),
      reason: z.string().optional().describe('Optional reason for rejection'),
    },
    async ({ choreId, reason }) => {
      const familyId = await requireParentFamily()

      const [chore] = await db
        .select()
        .from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
        .limit(1)

      if (!chore) return { content: [{ type: 'text' as const, text: 'Chore not found' }] }

      await db.update(chores).set({ status: 'parent_rejected', parentNote: reason ?? null }).where(eq(chores.id, choreId))

      return { content: [{ type: 'text' as const, text: JSON.stringify({ rejected: true, choreId, title: chore.title, reason }, null, 2) }] }
    },
  )

  // ── topup_brains ─────────────────────────────────────────────────────
  server.tool(
    'topup_brains',
    "Give Brains to a kid. Use this for allowance, rewards, or manual top-ups.",
    {
      kidName: z.string().describe("The kid's name"),
      amount: z.number().min(1).max(100000).describe('Number of Brains to give'),
      note: z.string().optional().describe('Optional note (e.g. "Weekly allowance")'),
    },
    async ({ kidName, amount, note }) => {
      const familyId = await requireParentFamily()

      const members = await db
        .select({ accountId: memberships.accountId, persona: accounts.persona })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'kid')))

      const kid = members.find((m) => {
        const name = (m.persona as { name?: string } | null)?.name ?? ''
        return name.toLowerCase().includes(kidName.toLowerCase())
      })
      if (!kid) return { content: [{ type: 'text' as const, text: `No kid named "${kidName}" in your family` }] }

      // Credit atomically
      const result = await db.transaction(async (tx) => {
        await tx
          .update(accounts)
          .set({ cachedBalance: sql`${accounts.cachedBalance} + ${amount}` })
          .where(eq(accounts.id, kid.accountId))

        const [acct] = await tx.select({ cachedBalance: accounts.cachedBalance }).from(accounts).where(eq(accounts.id, kid.accountId))

        await tx.insert(ledger).values({
          familyId,
          accountId: kid.accountId,
          actorId: accountId,
          kind: 'topup',
          brainsDelta: amount,
          balanceAfter: acct.cachedBalance,
          metadata: { note: note ?? null, source: 'mcp_topup' },
        })

        return { balanceAfter: acct.cachedBalance }
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ topped_up: true, kid: kidName, amount, newBalance: result.balanceAfter, note }, null, 2) }] }
    },
  )

  // ── set_family_rule ──────────────────────────────────────────────────
  server.tool(
    'set_family_rule',
    'Set or update a family rule (e.g. daily sugar limit, spend limit per transaction, health threshold).',
    {
      kind: z.string().describe('Rule type: sugar_limit_g, spend_limit_per_txn, health_threshold, or any custom key'),
      value: z.any().describe('The value for this rule (number, string, or object)'),
    },
    async ({ kind, value }) => {
      const familyId = await requireParentFamily()

      // Upsert: check if rule exists
      const [existing] = await db
        .select({ id: familyRules.id })
        .from(familyRules)
        .where(and(eq(familyRules.familyId, familyId), eq(familyRules.kind, kind)))
        .limit(1)

      if (existing) {
        await db.update(familyRules).set({ value, updatedAt: new Date() }).where(eq(familyRules.id, existing.id))
      } else {
        await db.insert(familyRules).values({ familyId, kind, value, status: 'confirmed', createdBy: accountId })
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ rule_set: true, kind, value }, null, 2) }] }
    },
  )

  return server
}
