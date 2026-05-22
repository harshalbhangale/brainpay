import { create } from 'zustand'

/**
 * Family store — caches the current family + members so screens can read
 * without refetching. TanStack Query owns the network/cache; this store
 * holds the IDs and the per-screen accent color.
 */

export type FamilyMember = {
  accountId: string
  role: 'primary_parent' | 'co_parent' | 'guardian' | 'kid'
  accountType: 'parent' | 'kid' | 'extended' | null
  persona: {
    name?: string
    avatar?: string
    color?: string
    age?: number
    voiceId?: string
    style?: string
  }
  cachedBalance: number
  todayEventCount?: number
}

export type Family = {
  id: string
  name: string
  avatar: string | null
}

type FamilyState = {
  family: Family | null
  members: FamilyMember[]
  setFamily: (family: Family | null) => void
  setMembers: (members: FamilyMember[]) => void
  reset: () => void
}

export const useFamilyStore = create<FamilyState>((set) => ({
  family: null,
  members: [],
  setFamily: (family) => set({ family }),
  setMembers: (members) => set({ members }),
  reset: () => set({ family: null, members: [] }),
}))
