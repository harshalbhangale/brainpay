import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Account = {
  id: string
  phone: string
  accountType: string | null
  persona: Record<string, unknown> | null
  cachedBalance: number | null
}

type AuthState = {
  token: string | null
  expiresAt: number | null
  account: Account | null
  setAuth: (a: { token: string; expiresAt: number; account: Account }) => void
  updateAccount: (partial: Partial<Account>) => void
  logout: () => void
}

/**
 * Token + account, persisted to localStorage.
 *
 * Note: localStorage is less hardened than the mobile app's expo-secure-store.
 * That's an accepted tradeoff for a browser client / PWA.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      account: null,
      setAuth: ({ token, expiresAt, account }) => set({ token, expiresAt, account }),
      updateAccount: (partial) =>
        set((s) => ({ account: s.account ? { ...s.account, ...partial } : s.account })),
      logout: () => set({ token: null, expiresAt: null, account: null }),
    }),
    { name: 'brainpal.auth' },
  ),
)

/** Non-reactive token accessor for use outside React (e.g. the api wrapper). */
export function getStoredToken(): string | null {
  return useAuthStore.getState().token
}
