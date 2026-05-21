import { create } from 'zustand'

/**
 * Auth store — Detailed Spec § 2.5.
 * Wired day 2.
 */
type AuthStatus = 'idle' | 'sendingCode' | 'awaitingCode' | 'verifying' | 'authenticated' | 'error'

type AuthState = {
  status: AuthStatus
  phone: string | null
  setPhone: (phone: string | null) => void
  setStatus: (status: AuthStatus) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  phone: null,
  setPhone: (phone) => set({ phone }),
  setStatus: (status) => set({ status }),
}))
