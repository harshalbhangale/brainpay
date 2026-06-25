/**
 * MoneyPal data hooks.
 * ───────────────────────────────────────────────────────────────────────────
 * Each hook returns a normalized view-model and a `live` flag:
 *   - logged in  → REAL data from the backend (wallet, family, ledger) and the
 *                  real top-up mutation that moves value through the ledger.
 *   - logged out → the mock showcase data, so the public /pay preview still works.
 * Screens consume the same shape either way.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { isKid, kidName, type LedgerEntry, type Member } from '../components/family/types'
import { payApi } from './api'
import { ACCOUNT, BALANCE_TREND, KIDS, TRANSACTIONS, type Txn } from './data'
import type { Pastel } from './tokens'

const TILES: Pastel[] = ['sky', 'mint', 'butter', 'lilac', 'peach', 'blush']
function tileFor(seed: string): Pastel {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return TILES[h % TILES.length]
}

const TILE_BY_KIND: Record<string, Pastel> = {
  topup: 'mint',
  topup_stripe: 'mint',
  chore_payout: 'sky',
  cart_checkout: 'butter',
  adjustment: 'lilac',
}

/** Adapt a server ledger entry into the UI's Txn shape. */
function ledgerToTxn(e: LedgerEntry): Txn {
  const md = (e.metadata ?? {}) as Record<string, unknown>
  let name = e.kind.replace(/_/g, ' ')
  if (e.kind === 'topup' || e.kind === 'topup_stripe') name = (md.note as string) || 'Money added'
  else if (e.kind === 'chore_payout') name = (md.choreTitle as string) ? `Chore: ${md.choreTitle}` : 'Chore reward'
  else if (e.kind === 'cart_checkout') name = (md.itemName as string) || 'Purchase'
  else if (e.kind === 'adjustment') name = (md.note as string) || 'Adjustment'
  return {
    id: e.id,
    name,
    detail: e.kind.replace(/_/g, ' '),
    amount: Math.abs(e.brainsDelta),
    dir: e.brainsDelta >= 0 ? 'in' : 'out',
    category: e.kind,
    tile: TILE_BY_KIND[e.kind] ?? 'lilac',
    initials: name.slice(0, 2).toUpperCase(),
    when: e.createdAt,
    status: 'done',
  }
}

export type WalletVM = {
  live: boolean
  loading: boolean
  balance: number
  available: number
  changePct: number
  trend: number[]
  txns: Txn[]
}

export function useWallet(): WalletVM {
  const token = useAuthStore((s) => s.token)
  const q = useQuery({
    queryKey: ['pay', 'wallet'],
    queryFn: () => payApi.wallet(50),
    enabled: !!token,
    retry: 1,
    staleTime: 15_000,
  })

  if (token && q.data) {
    const entries = q.data.entries ?? []
    const txns = entries.map(ledgerToTxn)
    const trend = [...entries].reverse().map((e) => e.balanceAfter).slice(-14)
    return {
      live: true,
      loading: q.isLoading,
      balance: q.data.balance,
      available: q.data.balance,
      changePct: 0,
      trend: trend.length >= 2 ? trend : [q.data.balance, q.data.balance],
      txns,
    }
  }

  return {
    live: false,
    loading: token ? q.isLoading : false,
    balance: ACCOUNT.balance,
    available: ACCOUNT.available,
    changePct: ACCOUNT.changePct,
    trend: BALANCE_TREND,
    txns: TRANSACTIONS,
  }
}

export type FamilyKidVM = {
  id: string
  name: string
  age?: number
  initials: string
  tile: Pastel
  avatar?: string
  balance: number
  allowance: number
  cadence: 'weekly' | 'monthly'
  goal?: { title: string; saved: number; target: number; tile: Pastel }
  tasksDue: number
  lastLocation?: { lat: number; lng: number; place?: string | null; at?: string } | null
  live: boolean
}

function memberToVM(m: Member): FamilyKidVM {
  const name = kidName(m)
  const persona = (m.persona ?? {}) as Record<string, unknown>
  return {
    id: m.accountId,
    name,
    age: typeof persona.age === 'number' ? (persona.age as number) : undefined,
    initials: name.slice(0, 2).toUpperCase(),
    tile: tileFor(m.accountId),
    avatar: typeof persona.avatar === 'string' ? (persona.avatar as string) : undefined,
    balance: m.cachedBalance ?? 0,
    allowance: 10,
    cadence: 'weekly',
    goal: undefined, // per-kid goals aren't exposed to the parent yet
    tasksDue: m.todayEventCount ?? 0,
    lastLocation: m.lastLocation ?? undefined,
    live: true,
  }
}

function mockToVM(k: (typeof KIDS)[number]): FamilyKidVM {
  return {
    id: k.id,
    name: k.name,
    age: k.age,
    initials: k.initials,
    tile: k.tile,
    avatar: k.avatar,
    balance: k.balance,
    allowance: k.allowance.amount,
    cadence: k.allowance.cadence,
    goal: { title: k.goal.title, saved: k.goal.saved, target: k.goal.target, tile: k.goal.tile },
    tasksDue: k.tasksDue,
    lastLocation: undefined,
    live: false,
  }
}

export function useFamilyKids() {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()
  const fam = useQuery({
    queryKey: ['pay', 'family'],
    queryFn: () => payApi.family(),
    enabled: !!token,
    retry: 1,
    staleTime: 15_000,
  })

  const give = useMutation({
    mutationFn: (v: { kidAccountId: string; amount: number; note?: string }) =>
      payApi.topupKid(v.kidAccountId, v.amount, v.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pay', 'family'] })
      qc.invalidateQueries({ queryKey: ['pay', 'wallet'] })
    },
  })

  const liveKids = token ? (fam.data?.members ?? []).filter(isKid).map(memberToVM) : []

  // Signed in → real family data (even when there are no kids yet). The mock
  // showcase only applies to the signed-out public preview.
  if (token) {
    return { live: true, loading: fam.isLoading, kids: liveKids, give }
  }
  return { live: false, loading: false, kids: KIDS.map(mockToVM), give }
}
