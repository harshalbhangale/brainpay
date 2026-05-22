import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Family, FamilyMember } from '@/stores/family'

/** Polls /family for current family + members. */
export function useFamily() {
  return useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api<{ family: Family | null; members: FamilyMember[] }>('/family'),
    staleTime: 15_000,
  })
}
