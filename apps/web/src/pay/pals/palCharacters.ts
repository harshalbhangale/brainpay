/**
 * palCharacters — the bridge between a BrainPal section and a *character*.
 * ───────────────────────────────────────────────────────────────────────────
 * Each Pal is fronted by one of the companions we ALREADY ship in the live
 * session (`lib/avatar.ts` → rendered by `<Companion>`). We do NOT introduce a
 * new avatar system here; we only *map* each `PalKey` onto an existing
 * `AvatarId` and give it a display identity ("MoneyPal — Mika"). This lets the
 * avatar-first surface show the right face + accent per Pal while the underlying
 * realtime/voice pipeline stays exactly as-is.
 *
 * Mapping (fixed):
 *   AI       → Kirra   (sunny, free-spirited — the everything orchestrator)
 *   MoneyPal → Mika    (friendly & bright — the family bank)
 *   StudyPal → Matilda (kind & quick-witted — the tutor)
 */
import type { AvatarId } from '../../lib/avatar'
import { avatarDef } from '../../lib/avatar'
import { usePalAvatars, palAvatarFor } from './usePalAvatars'
import { PAL_MAP, type PalDef, type PalKey } from './config'

export type PalCharacter = {
  key: PalKey
  /** The Pal product name, e.g. "MoneyPal". */
  palName: string
  /** The character's given name, e.g. "Mika". */
  characterName: string
  /** Combined label used in the surface, e.g. "MoneyPal — Mika". */
  displayName: string
  /** One-line persona shown under the avatar. */
  tagline: string
  /** The EXISTING companion this Pal wears. Only ids from `AVATARS`. */
  avatar: AvatarId
  /** Signature accent (matches the `.pv[data-pal]` palette). */
  accent: string
  gradient: string
  onAccent: string
}

/** PalKey → default AvatarId lives in usePalAvatars (DEFAULT_PAL_AVATARS). */

function buildCharacterWith(pal: PalDef, avatar: AvatarId): PalCharacter {
  // avatarDef falls back to a valid avatar if an id is ever removed, so the
  // surface can never render a broken character.
  const def = avatarDef(avatar)
  return {
    key: pal.key,
    palName: pal.name,
    characterName: def.name,
    displayName: `${pal.name} — ${def.name}`,
    tagline: pal.tagline,
    avatar: def.id,
    accent: pal.accent,
    gradient: pal.gradient,
    onAccent: pal.onAccent,
  }
}

export function palCharacter(pal: PalKey): PalCharacter {
  return buildCharacterWith(PAL_MAP[pal] ?? PAL_MAP.ai, palAvatarFor(pal))
}

/** Reactive: re-renders when the user re-assigns this Pal's avatar in Settings. */
export function usePalCharacter(pal: PalKey): PalCharacter {
  const avatar = usePalAvatars((s) => s.avatars[pal])
  return buildCharacterWith(PAL_MAP[pal] ?? PAL_MAP.ai, avatar ?? palAvatarFor(pal))
}

/** The avatar a Pal wears — convenience for the surface + live session. */
export function palAvatar(pal: PalKey): AvatarId {
  return palAvatarFor(pal)
}
