import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from '../env'

/**
 * Supabase admin client (service role).
 * SERVER-ONLY. Lazy-init so the API can boot without Supabase configured
 * (current state in prototype mode).
 */

let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const env = loadEnv()
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — cannot create admin client')
  }
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
