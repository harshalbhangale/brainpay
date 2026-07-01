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

/** PalKey → existing AvatarId. These ids must exist in `lib/avatar.ts`. */
const PAL_AVATAR: Record<PalKey, AvatarId> = {
  ai: 'kirra',
  moneypal: 'banjo',
  studypal: 'matilda',
}

function buildCharacter(pal: PalDef): PalCharacter {
  const avatar = PAL_AVATAR[pal.key]
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

export const PAL_CHARACTERS: Record<PalKey, PalCharacter> = {
  ai: buildCharacter(PAL_MAP.ai),
  moneypal: buildCharacter(PAL_MAP.moneypal),
  studypal: buildCharacter(PAL_MAP.studypal),
}

export function palCharacter(pal: PalKey): PalCharacter {
  return PAL_CHARACTERS[pal] ?? PAL_CHARACTERS.ai
}

/** The avatar a Pal wears — convenience for the surface + live session. */
export function palAvatar(pal: PalKey): AvatarId {
  return palCharacter(pal).avatar
}
