/**
 * Per-member cartoon style overrides.
 * ───────────────────────────────────────────────────────────────────────────
 * A parent can only PATCH their OWN persona on the server, so a per-kid style
 * choice is kept locally (persisted across sessions), just like the companion
 * `useAvatar` store. Keyed by a stable member seed (account id, falling back to
 * name). Absent → the deterministic default kicks in.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartoonStyleId } from './cartoonAvatar'

type CartoonStyleState = {
  styles: Record<string, CartoonStyleId>
  setStyle: (seed: string, style: CartoonStyleId) => void
  clearStyle: (seed: string) => void
}

export const useCartoonStyle = create<CartoonStyleState>()(
  persist(
    (set) => ({
      styles: {},
      setStyle: (seed, style) => set((s) => ({ styles: { ...s.styles, [seed]: style } })),
      clearStyle: (seed) =>
        set((s) => {
          const next = { ...s.styles }
          delete next[seed]
          return { styles: next }
        }),
    }),
    { name: 'brainpal.cartoonStyles', version: 1 },
  ),
)
