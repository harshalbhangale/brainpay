import { create } from 'zustand'

/** Minimal cart counter, parity with the mobile app's stores/cart. */
type CartState = {
  itemCount: number
  increment: (n?: number) => void
  reset: () => void
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  increment: (n = 1) => set((s) => ({ itemCount: s.itemCount + n })),
  reset: () => set({ itemCount: 0 }),
}))
