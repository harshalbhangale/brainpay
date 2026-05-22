import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from '../env'

/**
 * Supabase admin client (service role).
 * SERVER-ONLY. Lazy-init so the API can boot without Supabase configured.
 *
 * Uses SUPABASE_API_URL (https://...) for the JS client. SUPABASE_URL in our
 * env is the postgresql:// connection string used by Drizzle and is NOT a
 * valid input for createClient.
 */

let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const env = loadEnv()
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — cannot create admin client')
  }
  // Prefer the explicit API URL; fall back to SUPABASE_URL only if it's https://.
  const apiUrl =
    env.SUPABASE_API_URL ??
    (env.SUPABASE_URL.startsWith('https://') ? env.SUPABASE_URL : undefined)
  if (!apiUrl) {
    throw new Error(
      'SUPABASE_API_URL missing — set the https://*.supabase.co URL (SUPABASE_URL holds the postgres connection string).',
    )
  }
  cached = createClient(apiUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
