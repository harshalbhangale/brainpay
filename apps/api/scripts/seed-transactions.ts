/**
 * Dev seed — fun demo transactions for a kid.
 * Run: pnpm --filter @brainpal/api tsx scripts/seed-transactions.ts [KidName]
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db'
import { accounts, ledger, memberships } from '../src/db/schema'

const TXNS = [
  { kind: 'topup', delta: 5000, meta: { note: 'Pocket money' } },
  { kind: 'chore_payout', delta: 300, meta: { choreTitle: 'Walked the dog' } },
  { kind: 'cart_checkout', delta: -450, meta: { itemName: 'Spotify' } },
  { kind: 'cart_checkout', delta: -380, meta: { itemName: 'Starbucks' } },
  { kind: 'scan_skip_reward', delta: 120, meta: { itemName: 'Coke' } },
  { kind: 'cart_checkout', delta: -990, meta: { itemName: 'App Store game' } },
  { kind: 'chore_payout', delta: 250, meta: { choreTitle: 'Cleaned room' } },
  { kind: 'cart_checkout', delta: -1290, meta: { itemName: 'Steam' } },
]

async function main() {
  const wantName = (process.argv[2] ?? 'Alice').toLowerCase()

  const kids = await db
    .select({ accountId: memberships.accountId, familyId: memberships.familyId, persona: accounts.persona })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(eq(memberships.role, 'kid'))

  if (kids.length === 0) throw new Error('No kid members found — add a kid first.')

  const kid =
    kids.find((k) => ((k.persona as { name?: string } | null)?.name ?? '').toLowerCase() === wantName) ?? kids[0]
  const name = (kid.persona as { name?: string } | null)?.name ?? 'Kid'

  const actor = (
    await db
      .select({ accountId: memberships.accountId })
      .from(memberships)
      .where(and(eq(memberships.familyId, kid.familyId), eq(memberships.role, 'primary_parent')))
      .limit(1)
  )[0]?.accountId ?? kid.accountId

  let balance = 0
  const now = Date.now()
  const rows = TXNS.map((t, i) => {
    balance += t.delta
    return {
      familyId: kid.familyId,
      accountId: kid.accountId,
      actorId: actor,
      kind: t.kind,
      brainsDelta: t.delta,
      balanceAfter: balance,
      metadata: t.meta,
      createdAt: new Date(now - (TXNS.length - i) * 3 * 3600_000), // spread over recent hours
    }
  })

  await db.insert(ledger).values(rows)
  await db.update(accounts).set({ cachedBalance: balance }).where(eq(accounts.id, kid.accountId))

  console.log(`Seeded ${rows.length} transactions for ${name}. New balance: $${(balance / 100).toFixed(2)}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
