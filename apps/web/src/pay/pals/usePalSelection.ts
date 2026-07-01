/**
 * usePalSelection — which character the user is currently talking to.
 * ───────────────────────────────────────────────────────────────────────────
 * The avatar-first surface is one screen driven by a single `PalKey`. This
 * store holds that choice (persisted across sessions) plus a `chosen` flag so
 * the surface can run its one-time "pick your Pal" onboarding on first open.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PalKey } from './config'

type PalSelectionState = {
  pal: PalKey
  /** True once the user has explicitly picked a Pal at least once. */
  chosen: boolean
  setPal: (pal: PalKey) => void
}

export const usePalSelection = create<PalSelectionState>()(
  persist(
    (set) => ({
      pal: 'ai',
      chosen: false,
      setPal: (pal) => set({ pal, chosen: true }),
    }),
    {
      name: 'brainpal.pal-selection',
      version: 1,
      migrate: (state) => {
        const s = state as Partial<PalSelectionState> | undefined
        const valid: PalKey[] = ['ai', 'moneypal', 'studypal']
        if (!s || !valid.includes(s.pal as PalKey)) return { pal: 'ai', chosen: false } as PalSelectionState
        return s as PalSelectionState
      },
    },
  ),
)
