import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AvatarId = 'mika' | 'shizuka'

export type AvatarDef = { id: AvatarId; name: string; src: string }

export const AVATARS: AvatarDef[] = [
  { id: 'mika', name: 'Mika', src: '/mika.vrm' },
  { id: 'shizuka', name: 'Shizuka', src: '/shizuka.vrm' },
]

export function avatarSrc(id: AvatarId): string {
  return (AVATARS.find((a) => a.id === id) ?? AVATARS[0]).src
}

type AvatarState = {
  avatar: AvatarId
  setAvatar: (a: AvatarId) => void
}

/** Which companion model is active. Persisted across sessions. */
export const useAvatar = create<AvatarState>()(
  persist(
    (set) => ({
      avatar: 'mika',
      setAvatar: (avatar) => set({ avatar }),
    }),
    { name: 'brainpal.avatar' },
  ),
)
