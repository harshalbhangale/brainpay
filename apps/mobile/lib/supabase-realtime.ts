import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Supabase Realtime client for live updates on ledger, chores, inbox.
 *
 * Used by hooks to invalidate React Query caches when the server
 * inserts new rows for the family.
 */

const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
})

export type RealtimeFilter = {
  table: 'ledger' | 'chores' | 'inbox'
  filter?: string // e.g. "family_id=eq.UUID" or "account_id=eq.UUID"
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
}

/**
 * Subscribe to realtime events on a table.
 * Returns an unsubscribe function.
 */
export function subscribeRealtime(
  filter: RealtimeFilter,
  onChange: (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void,
): () => void {
  const channel: RealtimeChannel = supabase.channel(`mp-${filter.table}-${Date.now()}`)
    .on(
      // @ts-expect-error supabase types are loose here
      'postgres_changes',
      {
        event: filter.event ?? '*',
        schema: 'public',
        table: filter.table,
        filter: filter.filter,
      },
      onChange,
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}

export { supabase }
