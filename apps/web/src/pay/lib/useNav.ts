/**
 * useNav — the primary app navigation for the full-size shell.
 * ───────────────────────────────────────────────────────────────────────────
 * The app is two things: the AI **chat** and the structured **UI** sections.
 * This store is the single switch the desktop sidebar and the mobile bottom
 * nav both drive. Heavy views now own the main pane (no more phone-width
 * slide-overs); only true modals (top-up, card, chore picker) overlay.
 */
import { create } from 'zustand'

export type Section = 'chat' | 'money' | 'study' | 'family' | 'activity' | 'map' | 'chores'

type NavState = {
  section: Section
  setSection: (s: Section) => void
}

export const useNav = create<NavState>((set) => ({
  section: 'chat',
  setSection: (section) => set({ section }),
}))
