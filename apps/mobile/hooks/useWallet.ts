import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type LedgerEntry = {
  id: string
  familyId: string
  accountId: string
  actorId: string
  kind: string
  brainsDelta: number
  balanceAfter: number
  metadata: Record<string, unknown>
  createdAt: string
}

export type WalletData = {
  balance: number
  entries: LedgerEntry[]
}

/** Polls /wallet for the current account's balance + recent ledger entries. */
export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<WalletData>('/wallet'),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}
