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

  return server
}
