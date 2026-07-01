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

/** Per-section signature colour for the nav tiles (accent + readable text on it). */
const NAV_STYLE: Record<Section, { c: string; on: string }> = {
  chat: { c: '#19c37d', on: '#ffffff' },
  money: { c: '#c5f441', on: '#0b0c0f' },
  study: { c: '#8b7cff', on: '#ffffff' },
  family: { c: '#38bdf8', on: '#ffffff' },
  activity: { c: '#f59e0b', on: '#ffffff' },
  map: { c: '#fb923c', on: '#ffffff' },
  chores: { c: '#22c3a6', on: '#ffffff' },
}

/* ─────────────────────────────────────────────────────────── Sidebar body */
export function SidebarBody({
  items, active, onSelect, role, onNewChat, onOpenHistory, onProfile, onClose, showNav = true,
}: {
  items: NavItem[]
  active: Section
  onSelect: (s: Section) => void
  role: string
  onNewChat: () => void
  onOpenHistory: (sessionId?: string) => void
  onProfile: () => void
  onClose?: () => void
  /** Show the primary section nav. False in the mobile drawer (the bottom bar owns switching there). */
  showNav?: boolean
}) {
  const rawSessions = useSessionStore((s) => s.sessions)
  const sessions = sortedSessions(rawSessions)
  const [shown, setShown] = useState(6)
  const recent = sessions.slice(0, shown)

  return (
    <div className="relative flex h-full min-h-0 flex-col px-3 pb-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
      {/* decorative section-tinted glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48" style={{ background: `radial-gradient(72% 60% at 28% 0%, ${(NAV_STYLE[active]?.c ?? '#19c37d')}33, transparent 72%)` }} />

      {/* Brand */}
      <div className="relative flex items-center gap-2.5 px-1.5 pb-3">
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

      {/* Primary nav — 2-up grid of premium accent tiles */}
      {showNav && (
        <nav className="relative grid grid-cols-2 gap-2.5">
          {items.map((it, i) => {
            const on = it.key === active
            const s = NAV_STYLE[it.key] ?? { c: 'var(--pv-primary)', on: '#fff' }
            const wide = i === items.length - 1 && items.length % 2 === 1
            return (
              <button
                key={it.key}
                onClick={() => onSelect(it.key)}
                aria-current={on ? 'page' : undefined}
                className={`pv-press pv-pop group relative flex overflow-hidden rounded-[22px] p-3.5 text-left ${wide ? 'col-span-2 flex-row items-center gap-3' : 'flex-col justify-between'}`}
                style={{
                  minHeight: wide ? 64 : 96,
                  animationDelay: `${i * 55}ms`,
                  ...(on
                    ? {
                        backgroundImage: `linear-gradient(150deg, ${s.c} 0%, color-mix(in srgb, ${s.c} 66%, #0b0c0f) 100%)`,
                        color: s.on,
                        boxShadow: `0 14px 30px -12px ${s.c}, inset 0 1px 0 rgba(255,255,255,0.25)`,
                      }
                    : {
                        background: 'var(--pv-surface)',
                        color: 'var(--pv-ink)',
                        border: '1px solid var(--pv-line)',
                        boxShadow: 'var(--pv-shadow-xs)',
                      }),
                }}
              >
                {/* oversized watermark icon */}
                <it.Icon
                  aria-hidden
                  size={wide ? 56 : 84}
                  strokeWidth={1.6}
                  className="pointer-events-none absolute -bottom-3 -right-2"
                  style={{ color: on ? 'rgba(255,255,255,0.16)' : `color-mix(in srgb, ${s.c} 12%, transparent)` }}
                />
                <span
                  className="relative flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-transform duration-300 group-active:scale-95"
                  style={on
                    ? { background: 'rgba(255,255,255,0.24)', color: s.on }
                    : { background: `color-mix(in srgb, ${s.c} 15%, transparent)`, color: s.c }}
                >
                  <it.Icon size={19} strokeWidth={2.5} />
                </span>
                <span className={`relative text-[0.95rem] font-bold tracking-tight ${wide ? '' : 'mt-2'}`}>{it.label}</span>
              </button>
            )
          })}
        </nav>
      )}

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
