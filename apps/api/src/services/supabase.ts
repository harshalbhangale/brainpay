import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../env'

/**
 * Supabase admin client (service role).
 * SERVER-ONLY. Used for admin tasks like JWT issuance from edge fns,
 * and any RLS-bypassing reads from the API.
 */
const env = loadEnv()

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
