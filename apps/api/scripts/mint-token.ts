/**
 * One-off script: mint a JWT for a parent account by phone number.
 * Usage: tsx --env-file=../../.env scripts/mint-token.ts +917028167389
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { accounts } from '../src/db/schema'
import { mintToken } from '../src/services/jwt'

const phone = process.argv[2]
if (!phone) {
  console.error('Usage: tsx scripts/mint-token.ts <phone-e164>')
  process.exit(1)
}

const [acct] = await db
  .select({ id: accounts.id, phone: accounts.phone })
  .from(accounts)
  .where(eq(accounts.phone, phone))
  .limit(1)

if (!acct) {
  console.error(`No account found for phone: ${phone}`)
  process.exit(1)
}

const { token, expiresAt } = await mintToken({ accountId: acct.id, phone: acct.phone })
console.log(`\nAccount ID: ${acct.id}`)
console.log(`Phone:      ${acct.phone}`)
console.log(`Expires:    ${new Date(expiresAt * 1000).toISOString()}`)
console.log(`\nToken:\n${token}\n`)
process.exit(0)
