import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * BrainPal companions.
 *
 * Two kinds share one selector:
 *   - 'glb' — VRoid characters exported as plain glTF (rig = J_Bip_* bones,
 *     face = Fcl_* blendshapes). Rendered by <GlbCompanion>. These are texture-
 *     compressed (WebP, ≤1024px) so they load fast on mobile.
 *   - 'vrm' — the original VRM models, rendered by <VrmCompanion> via
 *     @pixiv/three-vrm.
 *
 * <Companion> picks the right renderer from `kind`, so call sites never care.
 */
export type AvatarId = 'archie' | 'matilda' | 'kirra' | 'banjo' | 'mika' | 'shizuka' | 'nova'
export type AvatarKind = 'glb' | 'vrm'

export type AvatarDef = {
  id: AvatarId
  name: string
  src: string
  kind: AvatarKind
  /** One-line personality shown in the picker. */
  blurb: string
  /** Signature accent (hex) for the picker card glow. */
  accent: string
}

export const AVATARS: AvatarDef[] = [
  { id: 'archie', name: 'Archie', src: '/avatars/archie.glb', kind: 'glb', blurb: 'Bold & full of beans', accent: '#4f8cff' },
  { id: 'matilda', name: 'Matilda', src: '/avatars/matilda.glb', kind: 'glb', blurb: 'Kind & quick-witted', accent: '#f472b6' },
  { id: 'kirra', name: 'Kirra', src: '/avatars/kirra.glb', kind: 'glb', blurb: 'Sunny & free-spirited', accent: '#22c3a6' },
  { id: 'banjo', name: 'Banjo', src: '/avatars/banjo.glb', kind: 'glb', blurb: 'Cheeky & full of fun', accent: '#ff8a5b' },
  { id: 'mika', name: 'Mika', src: '/avatars/moneypal.glb', kind: 'glb', blurb: 'Friendly & bright', accent: '#34d399' },
  { id: 'shizuka', name: 'Shizuka', src: '/shizuka.vrm', kind: 'vrm', blurb: 'Gentle & wise', accent: '#a78bfa' },
  { id: 'nova', name: 'Nova', src: '/nova.vrm', kind: 'vrm', blurb: 'Cool & collected', accent: '#6366f1' },
]

const DEFAULT_AVATAR: AvatarId = 'archie'

export function avatarDef(id: AvatarId): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0]
}

export function avatarSrc(id: AvatarId): string {
  return avatarDef(id).src
}

export function avatarKind(id: AvatarId): AvatarKind {
  return avatarDef(id).kind
}

type AvatarState = {
  avatar: AvatarId
  setAvatar: (a: AvatarId) => void
}

/** Which companion model is active. Persisted across sessions. */
export const useAvatar = create<AvatarState>()(
  persist(
    (set) => ({
      avatar: DEFAULT_AVATAR,
      setAvatar: (avatar) => set({ avatar }),
    }),
    {
      name: 'brainpal.avatar',
      // Drop a persisted id that no longer exists (e.g. a removed model).
      migrate: (state) => {
        const s = state as Partial<AvatarState> | undefined
        if (!s || !AVATARS.some((a) => a.id === s.avatar)) return { avatar: DEFAULT_AVATAR } as AvatarState
        return s as AvatarState
      },
      version: 3,
    },
  ),
)
