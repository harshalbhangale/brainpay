/**
 * canvasStore — overlay/modal switch (top-up, card, chore picker).
 * ───────────────────────────────────────────────────────────────────────────
 * Full views (activity, family, map, study, chores) are no longer slide-overs —
 * they own the main pane via `useNav`. For backwards-compatible call sites,
 * `open()` transparently routes those kinds to the nav section instead, and
 * only true modals stay here. Mounted once at the shell (SheetHost).
 */
import { create } from 'zustand'
import { useNav, type Section } from './useNav'

export type CanvasKind = 'activity' | 'map' | 'family' | 'topup' | 'card' | 'chore' | 'study' | 'chores' | 'insights'

/** Kinds that are really full sections — routed to the main pane via useNav. */
const SECTION_OF: Partial<Record<CanvasKind, Section>> = {
  activity: 'activity',
  family: 'family',
  map: 'map',
  study: 'study',
  chores: 'chores',
}

type SheetKind = 'topup' | 'card' | 'chore' | 'insights'

type CanvasState = {
  kind: SheetKind | null
  /** Optional param, e.g. a kid id for a scoped top-up. */
  param?: string
  open: (kind: CanvasKind, param?: string) => void
  close: () => void
}

export const useCanvas = create<CanvasState>((set) => ({
  kind: null,
  param: undefined,
  open: (kind, param) => {
    const section = SECTION_OF[kind]
    if (section) {
      useNav.getState().setSection(section)
      set({ kind: null, param: undefined })
      return
    }
    set({ kind: kind as SheetKind, param })
  },
  close: () => set({ kind: null, param: undefined }),
}))
