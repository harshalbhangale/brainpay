/**
 * activeChild — which kid the chat is currently scoped to (chat-first AI-OS).
 * ───────────────────────────────────────────────────────────────────────────
 * A parent switches the active child from the sidebar context card; `childId`
 * is then injected into every /chat and /chat/execute request so the backend
 * scopes context (wallet/chores/goals/location) to that kid. `null` means
 * "Whole family". For a kid account the scope is always themselves, so callers
 * pass their own account id regardless of this store.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ActiveChildState = {
  /** Selected kid's account id, or null for "Whole family". */
  childId: string | null
  setChild: (id: string | null) => void
}

export const useActiveChild = create<ActiveChildState>()(
  persist(
    (set) => ({
      childId: null,
      setChild: (childId) => set({ childId }),
    }),
    { name: 'brainpal.activeChild.v1' },
  ),
)
