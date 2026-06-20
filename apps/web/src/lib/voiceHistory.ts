/**
 * Persistent transcript of the user's spoken conversations with the companion.
 * Stored locally (demo); survives across sessions and is viewable in Settings.
 */

export type VoiceLine = { role: 'you' | 'mika'; text: string; at: number }

const KEY = 'brainpal.voiceHistory'
const MAX = 500

export function loadVoiceHistory(): VoiceLine[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as VoiceLine[]) : []
  } catch {
    return []
  }
}

export function appendVoiceLines(lines: Omit<VoiceLine, 'at'>[]) {
  if (lines.length === 0) return
  try {
    const now = Date.now()
    const next = [...loadVoiceHistory(), ...lines.map((l) => ({ ...l, at: now }))].slice(-MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function clearVoiceHistory() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
