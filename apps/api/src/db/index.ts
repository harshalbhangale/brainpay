import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { loadEnv } from '../env'
import * as schema from './schema'

const env = loadEnv()

// Supabase Postgres connection. Use the pooler URL in prod; direct in dev/migrations.
const sql = postgres(env.SUPABASE_URL, { prepare: false, max: 5 })

export const db = drizzle(sql, { schema })
export { schema }
