/**
 * Sessions — a unified, client-side log of the user's conversations across
 * every modality the app actually supports today:
 *
 *   text   → the AI council chat (typed)
 *   voice  → "Talk to Mika" live voice session
 *   camera → "Point & Ask" live camera session
 *   avatar → StudyPal's live video tutor (Tavus/Runway) interview
 *
 * This is the real data behind the History screen and the drawer's recent list,
 * so there are no dead-ends: a session row only exists because that session
 * actually happened. Persisted locally (demo) — no backend required.
 *
 * Legacy voice transcripts (brainpal.voiceHistory) are folded in once, grouped
 * by day, so existing users immediately see their past chats instead of an
 * empty screen.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { loadVoiceHistory } from '../../lib/voiceHistory'

export type SessionKind = 'text' | 'voice' | 'camera' | 'avatar'

export type SessionTurn = { role: string; text: string }

export type ChatSession = {
  id: string
  kind: SessionKind
  title: string
  createdAt: number
  updatedAt: number
  turns: SessionTurn[]
}

const MAX_SESSIONS = 100
const MAX_TURNS = 300

type SessionState = {
  sessions: ChatSession[]
  migratedLegacy: boolean
  /** Begin a new session; returns its id so the caller can append turns. */
  start: (kind: SessionKind, title: string) => string
  /** Append turns to an existing session (no-op if the id is unknown). */
  append: (id: string, turns: SessionTurn[]) => void
  /** Replace a session's title (e.g. once the first message is known). */
  rename: (id: string, title: string) => void
  remove: (id: string) => void
  clear: () => void
  /** One-time import of the old flat voice transcript into voice sessions. */
  migrateLegacy: () => void
}

function makeId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessions: [],
      migratedLegacy: false,

      start: (kind, title) => {
        const id = makeId()
        const now = Date.now()
        set((st) => ({
          sessions: [{ id, kind, title: title || defaultTitle(kind), createdAt: now, updatedAt: now, turns: [] }, ...st.sessions].slice(0, MAX_SESSIONS),
        }))
        return id
      },

      append: (id, turns) => {
        if (turns.length === 0) return
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === id ? { ...s, turns: [...s.turns, ...turns].slice(-MAX_TURNS), updatedAt: Date.now() } : s,
          ),
        }))
      },

      rename: (id, title) =>
        set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? { ...s, title } : s)) })),

      remove: (id) => set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) })),

      clear: () => set({ sessions: [] }),

      migrateLegacy: () =>
        set((st) => {
          if (st.migratedLegacy) return st
          const lines = loadVoiceHistory()
          if (lines.length === 0) return { ...st, migratedLegacy: true }
          // Group consecutive lines by calendar day into one voice session each.
          const byDay = new Map<string, typeof lines>()
          for (const l of lines) {
            const k = dayKey(l.at)
            const arr = byDay.get(k)
            if (arr) arr.push(l)
            else byDay.set(k, [l])
          }
          const migrated: ChatSession[] = []
          for (const arr of byDay.values()) {
            const createdAt = arr[0].at
            const updatedAt = arr[arr.length - 1].at
            migrated.push({
              id: makeId(),
              kind: 'voice',
              title: 'Voice chat with Mika',
              createdAt,
              updatedAt,
              turns: arr.map((l) => ({ role: l.role === 'you' ? 'you' : 'pal', text: l.text })).slice(-MAX_TURNS),
            })
          }
          const sessions = [...st.sessions, ...migrated]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_SESSIONS)
          return { ...st, sessions, migratedLegacy: true }
        }),
    }),
    { name: 'brainpal.sessions.v1' },
  ),
)

export function defaultTitle(kind: SessionKind): string {
  switch (kind) {
    case 'text': return 'New chat'
    case 'voice': return 'Talk to Mika'
    case 'camera': return 'Point & Ask'
    case 'avatar': return 'Tutor interview'
  }
}

/** Sessions newest-first — the canonical order for the list and drawer. */
export function sortedSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
}
