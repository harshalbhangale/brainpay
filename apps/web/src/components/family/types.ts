export type Member = {
  accountId: string
  role: string
  accountType: string | null
  persona: { name?: string } | null
  cachedBalance: number | null
  todayEventCount?: number
}

export type Family = { id: string; name: string; avatar: string } | null

export type FamilyResponse = { family: Family; members: Member[] }

export type LedgerEntry = {
  id: string
  accountId: string
  actorId: string | null
  kind: string
  brainsDelta: number
  balanceAfter: number
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type FeedResponse = { entries: LedgerEntry[] }

export type Chore = {
  id: string
  title: string
  rewardBrains: number
  status: string
  assignedTo: string
  createdAt: string
  parentNote?: string | null
  aiReason?: string | null
}

export type ChoresResponse = { chores: Chore[] }

export type OutgoingResponse = { requests: { id: string; phone: string; name: string | null }[] }

/** The active subject of the family view: the parent ("you") or a specific kid. */
export type Subject = { kind: 'family' } | { kind: 'kid'; accountId: string }

export type FamilyTab = 'overview' | 'card' | 'chores' | 'activity'

export function kidName(m: { persona: { name?: string } | null }): string {
  return m.persona?.name?.trim() || 'Kid'
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export function isKid(m: Member): boolean {
  return m.role === 'kid' || m.accountType === 'kid'
}
