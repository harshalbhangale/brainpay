/**
 * AppShell building blocks — the full-size, responsive navigation.
 * ───────────────────────────────────────────────────────────────────────────
 *  SidebarBody     primary nav + context card + conversation history. Used by
 *                  the persistent desktop sidebar AND the mobile swipe drawer.
 *  MobileBottomNav the bottom switch on phones.
 * Both drive the same `useNav` section, so Chat ⇄ structured UI is one tap.
 */
import type { LucideIcon } from 'lucide-react'
import { X, SquarePen, MessageSquareText, AudioLines, Camera, Video } from 'lucide-react'
import { ContextCard } from './ContextCard'
import { useSessionStore, sortedSessions, type SessionKind } from '../lib/sessions'
import type { Section } from '../lib/useNav'
import { PAL_MAP } from '../pals/config'
import { useState } from 'react'

export type NavItem = { key: Section; label: string; Icon: LucideIcon }

const SESSION_ICON: Record<SessionKind, LucideIcon> = { text: MessageSquareText, voice: AudioLines, camera: Camera, avatar: Video }

/* ─────────────────────────────────────────────────────────── Sidebar body */
export function SidebarBody({
  items, active, onSelect, role, onNewChat, onOpenHistory, onProfile, onClose,
}: {
  items: NavItem[]
  active: Section
  onSelect: (s: Section) => void
  role: string
  onNewChat: () => void
  onOpenHistory: (sessionId?: string) => void
  onProfile: () => void
  onClose?: () => void
}) {
  const rawSessions = useSessionStore((s) => s.sessions)
  const sessions = sortedSessions(rawSessions)
  const [shown, setShown] = useState(6)
  const recent = sessions.slice(0, shown)

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pb-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1.5 pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
          <PAL_MAP.ai.Icon size={19} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="pv-title pv-tight leading-tight">BrainPal</div>
          <div className="pv-label" style={{ letterSpacing: '0.06em' }}>{role} space</div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close menu" data-drawer-autofocus className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
            <X size={17} strokeWidth={2.6} />
          </button>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        {items.map((it) => {
          const on = it.key === active
          return (
            <button
              key={it.key}
              onClick={() => onSelect(it.key)}
              aria-current={on ? 'page' : undefined}
              className="pv-press flex items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left"
              style={on ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-sm)' } : { color: 'var(--pv-ink-2)' }}
            >
              <it.Icon size={20} strokeWidth={on ? 2.6 : 2.2} />
              <span className="text-[0.95rem] font-bold tracking-tight">{it.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Context card */}
      <div className="pt-3">
        <ContextCard onProfile={onProfile} onAfterSwitch={onClose} />
      </div>

      {/* History */}
      <div className="flex items-center justify-between px-1.5 pb-1.5 pt-4">
        <span className="pv-label">Chats</span>
        {sessions.length > 0 && (
          <button onClick={() => onOpenHistory()} className="pv-press text-[0.6875rem] font-extrabold uppercase tracking-wider" style={{ color: 'var(--pv-ink-3)' }}>All history</button>
        )}
      </div>
      <div className="pv-no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <button onClick={onNewChat} className="pv-press flex items-center gap-3 rounded-2xl px-2 py-2 text-left" style={{ color: 'var(--pv-ink-2)' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}><SquarePen size={17} strokeWidth={2.3} /></span>
          <span className="text-sm font-bold">New chat</span>
        </button>
        {recent.map((s) => {
          const Icon = SESSION_ICON[s.kind]
          return (
            <button key={s.id} onClick={() => onOpenHistory(s.id)} className="pv-press flex items-center gap-3 rounded-2xl px-2 py-2 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}><Icon size={16} strokeWidth={2.3} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{s.title}</span>
              </span>
            </button>
          )
        })}
        {sessions.length > shown && (
          <button onClick={() => setShown((n) => n + 6)} className="pv-press mx-1 mt-0.5 rounded-2xl py-2 text-xs font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
            Load more · {sessions.length - shown} older
          </button>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────── Mobile bottom nav */
export function MobileBottomNav({ items, active, onSelect }: { items: NavItem[]; active: Section; onSelect: (s: Section) => void }) {
  return (
    <div className="pointer-events-none sticky bottom-0 z-30 flex justify-center px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 lg:hidden">
      <nav
        className="pointer-events-auto flex items-center gap-0.5 rounded-full p-1.5"
        style={{ background: 'rgba(255,255,255,0.84)', backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)', boxShadow: 'var(--pv-shadow-lg)', border: '1px solid rgba(255,255,255,0.6)' }}
      >
        {items.map((it) => {
          const on = it.key === active
          return (
            <button
              key={it.key}
              onClick={() => onSelect(it.key)}
              aria-label={it.label}
              aria-current={on ? 'page' : undefined}
              className="pv-press flex h-12 min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-full px-2"
              style={on ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)' } : { color: 'var(--pv-ink-3)' }}
            >
              <it.Icon size={20} strokeWidth={on ? 2.6 : 2.2} />
              <span className="text-[0.6rem] font-bold tracking-tight">{it.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
