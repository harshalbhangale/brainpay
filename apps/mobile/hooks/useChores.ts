import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Chore = {
  id: string
  familyId: string
  assignedTo: string
  createdBy: string
  title: string
  rewardBrains: number
  status: 'pending' | 'submitted' | 'ai_approved' | 'ai_rejected' | 'ai_uncertain' | 'parent_approved' | 'parent_rejected' | 'paid'
  verificationPhoto: string | null
  aiVerdict: 'approved' | 'rejected' | 'uncertain' | null
  aiReason: string | null
  parentNote: string | null
  createdAt: string
  submittedAt: string | null
  completedAt: string | null
}

export function useChores(opts?: { status?: Chore['status'][] }) {
  const statusParam = opts?.status?.length ? `?status=${opts.status.join(',')}` : ''
  return useQuery({
    queryKey: ['chores', statusParam],
    queryFn: () => api<{ chores: Chore[] }>(`/chores${statusParam}`),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}
