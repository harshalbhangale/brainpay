import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * PAL voice preference.
 * The chosen `key` is sent to the live bridge (session.start → voice), which
 * maps it to an ElevenLabs voice id. Voices lean Australian by default.
 * The StudyPal interview always uses the warm tutor voice server-side.
 */
export type VoiceKey = 'normal' | 'good' | 'cute' | 'real' | 'anime'

export type VoiceOption = { key: VoiceKey; label: string; desc: string; emoji: string }

export const VOICE_OPTIONS: VoiceOption[] = [
  { key: 'normal', label: 'Normal', desc: 'Clear, friendly everyday voice', emoji: '🗣️' },
  { key: 'good', label: 'Warm tutor', desc: 'Calm and encouraging — best for studying', emoji: '🎓' },
  { key: 'cute', label: 'Cute', desc: 'Bright, playful and youthful', emoji: '🐣' },
  { key: 'real', label: 'Real · Australian', desc: 'Natural, true-to-life Aussie accent', emoji: '🇦🇺' },
  { key: 'anime', label: 'Anime', desc: 'Stylised character voice', emoji: '✨' },
]

type VoiceState = {
  voice: VoiceKey
  setVoice: (v: VoiceKey) => void
}

export const useVoicePrefs = create<VoiceState>()(
  persist(
    (set) => ({
      voice: 'normal',
      setVoice: (voice) => set({ voice }),
    }),
    { name: 'brainpal.voice' },
  ),
)

/** Non-reactive accessor for use outside React (e.g. on live-session connect). */
export function getVoiceKey(): VoiceKey {
  return useVoicePrefs.getState().voice
}
