/**
 * usePalAvatars — which companion each Pal wears, chosen by the user.
 * ───────────────────────────────────────────────────────────────────────────
 * The Pal → avatar mapping used to be hardcoded; now it's the user's choice
 * (set in Profile → Pal companions) and persisted. `palCharacter`/`usePalCharacter`
 * read from here, so the avatar AND the name shown for each Pal follow the pick.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AVATARS, type AvatarId } from '../../lib/avatar'
import type { PalKey } from './config'

export type PalAvatarMap = Record<PalKey, AvatarId>

/** Sensible defaults — distinct, fast, rigged companions per Pal. */
export const DEFAULT_PAL_AVATARS: PalAvatarMap = {
  ai: 'kirra',
  moneypal: 'banjo',
  studypal: 'matilda',
}

const isValid = (id: unknown): id is AvatarId => AVATARS.some((a) => a.id === id)

type State = {
  avatars: PalAvatarMap
  setPalAvatar: (pal: PalKey, id: AvatarId) => void
}

export const usePalAvatars = create<State>()(
  persist(
    (set) => ({
      avatars: DEFAULT_PAL_AVATARS,
      setPalAvatar: (pal, id) => set((s) => ({ avatars: { ...s.avatars, [pal]: id } })),
    }),
    {
      name: 'brainpal.pal-avatars',
      version: 1,
      // Backfill any missing/removed ids so a Pal can never point at a dead avatar.
      migrate: (st) => {
        const s = st as Partial<State> | undefined
        const merged = { ...DEFAULT_PAL_AVATARS, ...(s?.avatars ?? {}) }
        for (const key of Object.keys(merged) as PalKey[]) {
          if (!isValid(merged[key])) merged[key] = DEFAULT_PAL_AVATARS[key]
        }
        return { avatars: merged } as State
      },
    },
  ),
)

/** Non-reactive read (for effects / one-off lookups). */
export function palAvatarFor(pal: PalKey): AvatarId {
  return usePalAvatars.getState().avatars[pal] ?? DEFAULT_PAL_AVATARS[pal]
}
