/**
 * canvasStore — the single switch for the on-demand "canvas" slide-over.
 * ───────────────────────────────────────────────────────────────────────────
 * In the chat-first app the heavy views (ledger, map, family management) are
 * never standing navigation — they are summoned over the chat by a tap on a
 * chat card or by PAL intent, then dismissed. Sheets (top-up, card, chore
 * picker) ride the same switch. Mounted once at the shell (PalShell).
 */
import { create } from 'zustand'

export type CanvasKind = 'activity' | 'map' | 'family' | 'topup' | 'card' | 'chore'

type CanvasState = {
  kind: CanvasKind | null
  /** Optional param, e.g. a kid id for a scoped top-up. */
  param?: string
  open: (kind: CanvasKind, param?: string) => void
  close: () => void
}

export const useCanvas = create<CanvasState>((set) => ({
  kind: null,
  param: undefined,
  open: (kind, param) => set({ kind, param }),
  close: () => set({ kind: null, param: undefined }),
}))
