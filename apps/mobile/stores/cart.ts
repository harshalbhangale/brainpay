import { create } from 'zustand'

/**
 * Local cart store — mirrors the server-side cart_items for instant UI feedback.
 * The server is the source of truth; this store is kept in sync via React Query
 * invalidation. We use it here only for the badge count on the dashboard.
 */

type CartState = {
  itemCount: number
  setItemCount: (n: number) => void
  increment: () => void
  reset: () => void
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  setItemCount: (n) => set({ itemCount: n }),
  increment: () => set((s) => ({ itemCount: s.itemCount + 1 })),
  reset: () => set({ itemCount: 0 }),
}))
