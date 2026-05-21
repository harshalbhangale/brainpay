import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from '../env'

/**
 * Supabase admin client (service role).
 * SERVER-ONLY. Used for admin tasks like JWT issuance from edge fns,
 * and any RLS-bypassing reads from the API.
 * Returns null if SUPABASE_SERVICE_ROLE_KEY / SUPABASE_API_URL are not set.
 */
const env = loadEnv()

export const supabaseAdmin: SupabaseClient | null =
  env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_API_URL
    ? createClient(env.SUPABASE_API_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null
