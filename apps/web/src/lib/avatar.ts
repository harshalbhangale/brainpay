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
export type AvatarId = 'kai' | 'luna' | 'nova' | 'milo' | 'mika' | 'shizuka'
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
  { id: 'kai', name: 'Kai', src: '/avatars/kai.glb', kind: 'glb', blurb: 'Adventurous & upbeat', accent: '#4f8cff' },
  { id: 'luna', name: 'Luna', src: '/avatars/luna.glb', kind: 'glb', blurb: 'Calm & dreamy', accent: '#a78bfa' },
  { id: 'nova', name: 'Nova', src: '/avatars/nova.glb', kind: 'glb', blurb: 'Curious & clever', accent: '#22c3a6' },
  { id: 'milo', name: 'Milo', src: '/avatars/milo.glb', kind: 'glb', blurb: 'Playful & warm', accent: '#ff8a5b' },
  { id: 'mika', name: 'Mika', src: '/mika.vrm', kind: 'vrm', blurb: 'Friendly & bright', accent: '#34d399' },
  { id: 'shizuka', name: 'Shizuka', src: '/shizuka.vrm', kind: 'vrm', blurb: 'Gentle & wise', accent: '#f472b6' },
]

const DEFAULT_AVATAR: AvatarId = 'kai'

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
      version: 2,
    },
  ),
)
