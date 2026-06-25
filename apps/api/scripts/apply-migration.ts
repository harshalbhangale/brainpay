/**
 * Apply a single SQL migration file against SUPABASE_URL (idempotent migrations).
 * Run: tsx --env-file=../../.env scripts/apply-migration.ts <path-to.sql>
 */
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const file = process.argv[2]
if (!file) { console.error('usage: apply-migration.ts <file.sql>'); process.exit(1) }
const url = process.env.SUPABASE_URL
if (!url) { console.error('SUPABASE_URL not set'); process.exit(1) }

const sqlText = readFileSync(file, 'utf8')
const sql = postgres(url, { prepare: false, max: 1 })

async function main() {
  console.log('applying', file, '…')
  await sql.unsafe(sqlText)
  console.log('✅ applied')
  await sql.end()
}
main().catch(async (e) => { console.error('❌ failed:', e?.message ?? e); try { await sql.end() } catch { /* */ } process.exit(1) })
