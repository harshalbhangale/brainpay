/**
 * PalShell — the authenticated home, now chat-first (an AI OS).
 * ───────────────────────────────────────────────────────────────────────────
 * The chat (AIPal) is the home surface. The slim sidebar holds just two things:
 * a parent/child context card on top and conversation history below. Heavy
 * views (ledger, map, family) are summoned as slide-over canvases over the chat
 * (see Canvas/CanvasHost), never as standing tabs. `goPal` survives only for
 * resuming an avatar/study session.
 */
import { useCallback, useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { User, Menu, X, SquarePen, MessageSquareText, AudioLines, Camera, Video } from 'lucide-react'
import { useLocationReporter } from '../../lib/useLocationReporter'
import { useAuthStore } from '../../stores/auth'
import { PhoneCanvas } from '../components/shell'
import { Avatar } from '../components/primitives'
import { SwipeDrawer } from '../components/SwipeDrawer'
import { ContextCard } from '../components/ContextCard'
import { CanvasHost } from '../components/Canvas'
import { Profile } from '../screens/Profile'
import { SessionHistory } from '../screens/SessionHistory'
import { PAL_MAP, type PalKey } from './config'
import { sendAiCommand } from './aiBus'
import { useHistoryView } from '../lib/historyStore'
import { useSessionStore, sortedSessions, type SessionKind, type ChatSession } from '../lib/sessions'
import { AIPal } from './AIPal'
import { StudyPal } from './StudyPal'

type Reveal = { key: PalKey; x: number; y: number; leaving: boolean }

export function PalShell() {
  const [pal, setPal] = useState<PalKey>('ai')
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const account = useAuthStore((s) => s.account)
  const historyOpen = useHistoryView((s) => s.open)
  const openHistory = useHistoryView((s) => s.openHistory)

  // Fold any legacy voice transcript into the sessions log, once.
  useEffect(() => { useSessionStore.getState().migrateLegacy() }, [])

  // Everyone in the family reports their device location so it's mutual —
  // parents see their kids and kids see their parents on the family map.
  useLocationReporter(!!account)

  // Programmatic Pal switch — survives for resuming an avatar/study session.
  // Plays the circular color flood from the top-center.
  const goPal = useCallback(
    (next: PalKey) => {
      setPal((cur) => {
        if (next === cur) return cur
        setReveal({ key: next, x: 50, y: 6, leaving: false })
        window.setTimeout(() => setPal(next), 330)
        window.setTimeout(() => setReveal((r) => (r ? { ...r, leaving: true } : null)), 390)
        window.setTimeout(() => setReveal(null), 730)
        return cur
      })
    },
    [],
  )

  const name = (account?.persona?.name as string) || 'You'
  const photo = typeof account?.persona?.avatar === 'string' ? (account.persona.avatar as string) : undefined
  const role = account?.accountType === 'kid' ? 'Kid' : 'Parent'

  // Drawer actions. Pal-targeting actions switch to the AI Pal first; the
  // command is queued by aiBus and flushed once <Chat> mounts after the switch.
  const closeThen = useCallback((fn: () => void) => { setDrawerOpen(false); fn() }, [])
  const onNewChat = useCallback(() => closeThen(() => { goPal('ai'); sendAiCommand({ type: 'new-chat' }) }), [closeThen, goPal])
  const onOpenHistory = useCallback((sessionId?: string) => closeThen(() => openHistory(sessionId)), [closeThen, openHistory])
  const onProfile = useCallback(() => closeThen(() => setProfileOpen(true)), [closeThen])

  // Continue a recorded session. Text reopens in the chat (append to the same
  // session); voice/camera can't resume a realtime stream, so they start a
  // fresh live session of that kind; avatar routes to StudyPal to keep studying.
  const continueSession = useCallback((s: ChatSession) => {
    useHistoryView.getState().close()
    if (s.kind === 'text') { goPal('ai'); sendAiCommand({ type: 'resume', sessionId: s.id }) }
    else if (s.kind === 'voice') { goPal('ai'); sendAiCommand({ type: 'live', camera: false }) }
    else if (s.kind === 'camera') { goPal('ai'); sendAiCommand({ type: 'live', camera: true }) }
    else goPal('studypal')
  }, [goPal])

  return (
    <PhoneCanvas pal={pal}>
      <PalRail
        onMenu={() => setDrawerOpen(true)}
        onProfile={() => setProfileOpen(true)}
        name={name}
        photo={photo}
      />

      {pal === 'ai' && <AIPal />}
      {pal === 'studypal' && <StudyPal />}

      <SwipeDrawer open={drawerOpen} onOpenChange={setDrawerOpen} ariaLabel="BrainPal menu">
        <DrawerContent
          name={name}
          photo={photo}
          role={role}
          onNewChat={onNewChat}
          onOpenHistory={onOpenHistory}
          onProfile={onProfile}
          onClose={() => setDrawerOpen(false)}
        />
      </SwipeDrawer>

      <CanvasHost />

      {reveal && <PalReveal reveal={reveal} />}
      {historyOpen && <SessionHistory onContinue={continueSession} />}
      {profileOpen && <Profile onClose={() => setProfileOpen(false)} />}
    </PhoneCanvas>
  )
}

/* ───────────────────────────────────────────────────────────────── Top bar */
function PalRail({ onMenu, onProfile, name, photo }: { onMenu: () => void; onProfile: () => void; name: string; photo?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="pv-press flex h-[38px] w-[38px] items-center justify-center rounded-full"
        style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)', border: '1px solid rgba(255,255,255,0.6)' }}
      >
        <Menu size={19} strokeWidth={2.4} />
      </button>

      <button
        onClick={onProfile}
        aria-label="Profile and settings"
        className="pv-press rounded-full"
        style={{ boxShadow: 'var(--pv-shadow-sm)', border: '2px solid rgba(255,255,255,0.7)' }}
      >
        {photo ? <Avatar name={name} src={photo} size={38} /> : (
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--pv-ink-2)' }}>
            <User size={18} strokeWidth={2.4} />
          </span>
        )}
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── Animated switch flood */
function PalReveal({ reveal }: { reveal: Reveal }) {
  const d = PAL_MAP[reveal.key]
  const Icon = d.Icon
  return (
    <div
      className="pv-reveal"
      data-leaving={reveal.leaving ? 'true' : undefined}
      style={{
        ['--px' as string]: `${reveal.x}%`,
        ['--py' as string]: `${reveal.y}%`,
        backgroundImage: d.gradient,
      }}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4" style={{ color: d.onAccent }}>
        <div className="pv-pal-badge flex h-24 w-24 items-center justify-center rounded-[30px]" style={{ background: 'rgba(255,255,255,0.18)' }}>
          <Icon size={50} strokeWidth={2} />
        </div>
        <div className="pv-pal-badge text-[1.7rem] font-extrabold tracking-tight">{d.name}</div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── Drawer body */
/**
 * The slim sidebar: a context card on top (who the chat is scoped to + Profile)
 * and conversation history below (New chat + recent sessions + All history).
 * No Pal-switcher list, no bottom profile row — those folded into the chat-first
 * model and the context card.
 */
const SESSION_ICON: Record<SessionKind, LucideIcon> = { text: MessageSquareText, voice: AudioLines, camera: Camera, avatar: Video }

function DrawerContent({
  name, photo, role, onNewChat, onOpenHistory, onProfile, onClose,
}: {
  name: string
  photo?: string
  role: string
  onNewChat: () => void
  onOpenHistory: (sessionId?: string) => void
  onProfile: () => void
  onClose: () => void
}) {
  void name; void photo // identity now lives in the context card
  let i = 0
  const next = () => i++
  const rawSessions = useSessionStore((s) => s.sessions)
  const sessions = sortedSessions(rawSessions)
  const [shown, setShown] = useState(5)
  const recent = sessions.slice(0, shown)

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      {/* Top row: space label + close */}
      <div className="pv-drawer-item flex items-center justify-between px-1 pb-2" style={{ ['--i' as string]: next() }}>
        <span className="pv-label" style={{ letterSpacing: '0.06em' }}>{role} space</span>
        <button
          onClick={onClose}
          aria-label="Close menu"
          data-drawer-autofocus
          className="pv-press flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}
        >
          <X size={17} strokeWidth={2.6} />
        </button>
      </div>

      {/* Context card — the chat scope anchor + Profile entry */}
      <div className="pv-drawer-item" style={{ ['--i' as string]: next() }}>
        <ContextCard onProfile={onProfile} onAfterSwitch={onClose} />
      </div>

      {/* Chats: a fresh chat + a live list of recent sessions (ChatGPT-style). */}
      <div className="pv-drawer-item flex items-center justify-between px-2 pb-1.5 pt-4" style={{ ['--i' as string]: next() }}>
        <span className="pv-label">Chats</span>
        {sessions.length > 0 && (
          <button onClick={() => onOpenHistory()} className="pv-press text-[0.6875rem] font-extrabold uppercase tracking-wider" style={{ color: 'var(--pv-ink-3)' }}>
            All history
          </button>
        )}
      </div>
      <div className="pv-no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        <DrawerAction i={next()} Icon={SquarePen} label="New chat" hint="Start a fresh conversation" onClick={onNewChat} />

        {recent.map((s) => {
          const Icon = SESSION_ICON[s.kind]
          const last = s.turns[s.turns.length - 1]
          const preview = last ? last.text : 'No messages'
          return (
            <button
              key={s.id}
              onClick={() => onOpenHistory(s.id)}
              className="pv-drawer-item pv-drawer-row flex items-center gap-3 rounded-2xl px-2 py-2 text-left"
              style={{ ['--i' as string]: next() }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                <Icon size={19} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="pv-title block truncate">{s.title}</span>
                <span className="block truncate text-[0.8125rem] font-medium" style={{ color: 'var(--pv-ink-3)' }}>{preview}</span>
              </span>
            </button>
          )
        })}

        {sessions.length > shown && (
          <button
            onClick={() => setShown((n) => n + 5)}
            className="pv-drawer-item pv-press mx-2 mt-0.5 rounded-2xl py-2 text-sm font-bold"
            style={{ ['--i' as string]: next(), background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}
          >
            Load more · {sessions.length - shown} older
          </button>
        )}
      </div>
    </div>
  )
}

function DrawerAction({ i, Icon, label, hint, onClick }: { i: number; Icon: LucideIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pv-drawer-item pv-drawer-row flex items-center gap-3 rounded-2xl px-2 py-2 text-left"
      style={{ ['--i' as string]: i }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
        <Icon size={20} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="pv-title block truncate">{label}</span>
        <span className="block truncate text-[0.8125rem] font-medium" style={{ color: 'var(--pv-ink-3)' }}>{hint}</span>
      </span>
    </button>
  )
}
