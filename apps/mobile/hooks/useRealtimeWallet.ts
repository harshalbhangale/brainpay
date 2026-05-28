import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeRealtime } from '@/lib/supabase-realtime'
import { useAuthStore } from '@/stores/auth'

/**
 * Subscribes to ledger + chores realtime events for the current account
 * and invalidates the relevant React Query caches so the UI updates live.
 *
 * Mount once at the top of an app group (parent or kid layout).
 */
export function useRealtimeWallet() {
  const accountId = useAuthStore((s) => s.accountId)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!accountId) return

    // Wallet/ledger updates for this account.
    const unsubLedger = subscribeRealtime(
      { table: 'ledger', filter: `account_id=eq.${accountId}`, event: 'INSERT' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
        queryClient.invalidateQueries({ queryKey: ['family'] })
        queryClient.invalidateQueries({ queryKey: ['family-feed'] })
      },
    )

    // Chores updates for the family — we use a broader filter since kids
    // and parents both care about their family's chores.
    const unsubChores = subscribeRealtime(
      { table: 'chores', event: '*' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['chores'] })
      },
    )

    return () => {
      unsubLedger()
      unsubChores()
    }
  }, [accountId, queryClient])
}
