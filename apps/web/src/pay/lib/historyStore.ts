/**
 * historyStore — app-level control for the History overlay.
 * ───────────────────────────────────────────────────────────────────────────
 * The overlay is mounted once at the app shell (PalShell), but it's opened from
 * several places: the drawer (a specific session or the full list), and the
 * chat header's history button. This tiny store is the single switch so they
 * all drive the same surface, regardless of which Pal is active.
 */
import { create } from 'zustand'

type HistoryState = {
  open: boolean
  /** When set, the overlay opens straight into that session's transcript. */
  sessionId?: string
  openHistory: (sessionId?: string) => void
  close: () => void
}

export const useHistoryView = create<HistoryState>((set) => ({
  open: false,
  sessionId: undefined,
  openHistory: (sessionId) => set({ open: true, sessionId }),
  close: () => set({ open: false, sessionId: undefined }),
}))
