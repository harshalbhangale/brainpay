/**
 * SessionHistory — the real "History" surface (light `.pv`).
 * ───────────────────────────────────────────────────────────────────────────
 * Replaces the old raw voice-transcript dump. Lists every recorded session
 * (text / voice / camera / avatar) newest-first, grouped by day, filterable by
 * kind, paginated with "Load more". Tapping a session opens its full transcript.
 *
 * Mounted once at the app shell and controlled by useHistoryView, so it can be
 * opened from the drawer (a specific session or the whole list) or the chat
 * header — from any Pal.
 */
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X, ChevronLeft, Trash2, MessagesSquare, MessageSquareText, AudioLines, Camera, Video, Clock, ArrowRight } from 'lucide-react'
import { useHistoryView } from '../lib/historyStore'
import { useSessionStore, sortedSessions, type ChatSession, type SessionKind } from '../lib/sessions'

const PAGE = 6

const KIND: Record<SessionKind, { label: string; Icon: LucideIcon; bg: string; ink: string }> = {
  text: { label: 'Text', Icon: MessageSquareText, bg: 'var(--pv-lilac)', ink: 'var(--pv-lilac-ink)' },
  voice: { label: 'Voice', Icon: AudioLines, bg: 'var(--pv-mint)', ink: 'var(--pv-mint-ink)' },
  camera: { label: 'Camera', Icon: Camera, bg: 'var(--pv-peach)', ink: 'var(--pv-peach-ink)' },
  avatar: { label: 'Avatar', Icon: Video, bg: 'var(--pv-sky)', ink: 'var(--pv-sky-ink)' },
}

const FILTERS: { key: SessionKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'text', label: 'Text' },
  { key: 'voice', label: 'Voice' },
  { key: 'camera', label: 'Camera' },
  { key: 'avatar', label: 'Avatar' },
]

export function SessionHistory({ onContinue }: { onContinue: (session: ChatSession) => void }) {
  const close = useHistoryView((s) => s.close)
  const initialId = useHistoryView((s) => s.sessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const remove = useSessionStore((s) => s.remove)
  const clearAll = useSessionStore((s) => s.clear)

  const sorted = useMemo(() => sortedSessions(sessions), [sessions])
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId)
  const [filter, setFilter] = useState<SessionKind | 'all'>('all')
  const [limit, setLimit] = useState(PAGE)
  const [confirmClear, setConfirmClear] = useState(false)

  const selected = selectedId ? sorted.find((s) => s.id === selectedId) : undefined

  if (selected) {
    return (
      <div className="pv fixed inset-0 z-[70] flex flex-col" style={{ background: 'var(--pv-bg)' }} role="dialog" aria-modal="true" aria-label="Session transcript">
        <SessionDetail
          session={selected}
          onBack={() => setSelectedId(undefined)}
          onContinue={() => onContinue(selected)}
          onDelete={() => { remove(selected.id); setSelectedId(undefined) }}
        />
      </div>
    )
  }

  const filtered = filter === 'all' ? sorted : sorted.filter((s) => s.kind === filter)
  const visible = filtered.slice(0, limit)
  const groups = groupByDay(visible)

  return (
    <div className="pv fixed inset-0 z-[70] flex flex-col" style={{ background: 'var(--pv-bg)' }} role="dialog" aria-modal="true" aria-label="History">
      {/* Header */}
      <div className="flex flex-none items-center gap-2 px-4 pb-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={close} aria-label="Close" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
          <X size={20} />
        </button>
        <h1 className="pv-title flex-1">History</h1>
        {sorted.length > 0 && (
          confirmClear ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setConfirmClear(false)} className="pv-press rounded-full px-3 py-2 text-sm font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>Cancel</button>
              <button onClick={() => { clearAll(); setConfirmClear(false) }} className="pv-press rounded-full px-3 py-2 text-sm font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>Clear all</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} aria-label="Clear all history" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink-2)' }}>
              <Trash2 size={17} />
            </button>
          )
        )}
      </div>

      {/* Filters */}
      {sorted.length > 0 && (
        <div className="pv-no-scrollbar flex flex-none gap-1.5 overflow-x-auto px-4 pb-2 pt-1">
          {FILTERS.map((f) => {
            const on = f.key === filter
            const count = f.key === 'all' ? sorted.length : sorted.filter((s) => s.kind === f.key).length
            return (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setLimit(PAGE) }}
                className="pv-press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold"
                style={on ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-xs)' }}
              >
                {f.label}
                <span className="text-xs font-extrabold" style={{ opacity: 0.7 }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* List */}
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1">
        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {groups.map((g) => (
              <div key={g.label} className="mb-4">
                <div className="pv-label sticky top-0 z-[1] py-2" style={{ background: 'var(--pv-bg)' }}>{g.label}</div>
                <div className="flex flex-col gap-2">
                  {g.items.map((s, i) => (
                    <SessionRow key={s.id} session={s} i={i} onOpen={() => setSelectedId(s.id)} />
                  ))}
                </div>
              </div>
            ))}
            {filtered.length > limit && (
              <button
                onClick={() => setLimit((n) => n + PAGE)}
                className="pv-press mx-auto mt-1 flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold"
                style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink)' }}
              >
                Load more · {filtered.length - limit} older
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── Session row */
function SessionRow({ session, i, onOpen }: { session: ChatSession; i: number; onOpen: () => void }) {
  const meta = KIND[session.kind]
  const last = session.turns[session.turns.length - 1]
  const preview = last ? `${last.role === 'you' || last.role === 'user' ? 'You: ' : ''}${last.text}` : 'No messages'
  return (
    <button
      onClick={onOpen}
      className="pv-pop flex w-full items-center gap-3 rounded-2xl p-3 text-left"
      style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${Math.min(i, 8) * 40}ms` }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: meta.bg, color: meta.ink }}>
        <meta.Icon size={20} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="pv-title truncate">{session.title}</span>
        </span>
        <span className="mt-0.5 block truncate text-[0.8125rem] font-medium" style={{ color: 'var(--pv-ink-3)' }}>{preview}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--pv-ink-3)' }}>{whenLabel(session.updatedAt)}</span>
        <span className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-extrabold" style={{ background: meta.bg, color: meta.ink }}>{meta.label}</span>
      </span>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────── Detail view */
function SessionDetail({ session, onBack, onContinue, onDelete }: { session: ChatSession; onBack: () => void; onContinue: () => void; onDelete: () => void }) {
  const meta = KIND[session.kind]
  const continueLabel: Record<SessionKind, string> = {
    text: 'Continue chat',
    voice: 'Start a voice chat',
    camera: 'Open camera',
    avatar: 'Practise in StudyPal',
  }
  return (
    <>
      <div className="flex flex-none items-center gap-2 px-4 pb-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={onBack} aria-label="Back" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="pv-title truncate leading-tight">{session.title}</div>
          <div className="flex items-center gap-1.5 pt-0.5 text-[0.6875rem] font-bold" style={{ color: 'var(--pv-ink-3)' }}>
            <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ background: meta.bg, color: meta.ink }}><meta.Icon size={11} /> {meta.label}</span>
            <Clock size={11} /> {fullWhen(session.createdAt)} · {session.turns.length} messages
          </div>
        </div>
        <button onClick={onDelete} aria-label="Delete session" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-neg)' }}>
          <Trash2 size={17} />
        </button>
      </div>

      <div className="pv-no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {session.turns.length === 0 ? (
          <div className="mt-16 text-center pv-body" style={{ color: 'var(--pv-ink-3)' }}>This session has no transcript.</div>
        ) : (
          session.turns.map((t, i) => {
            const mine = t.role === 'you' || t.role === 'user'
            return (
              <div key={i} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                  style={mine
                    ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 }
                    : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', borderBottomLeftRadius: 6 }}
                >
                  {t.text}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Continue — reopen this conversation (kind-aware). */}
      <div className="flex-none px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2">
        <button
          onClick={onContinue}
          className="pv-press-lg pv-sheen flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[0.95rem] font-bold"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
        >
          {continueLabel[session.kind]} <ArrowRight size={18} strokeWidth={2.6} />
        </button>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────── Empty state */
function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 pt-24 text-center">
      <span className="pv-scale-in mb-4 flex h-20 w-20 items-center justify-center rounded-[28px]" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-md)', color: 'var(--pv-ink-3)' }}>
        <MessagesSquare size={34} strokeWidth={2} />
      </span>
      <div className="pv-h2 pv-rise">No sessions yet</div>
      <p className="pv-body pv-rise mt-1.5 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>
        Your chats with PAL — typed, voice, camera, and tutor interviews — will show up here so you can revisit them anytime.
      </p>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────── Helpers */
function groupByDay(items: ChatSession[]): { label: string; items: ChatSession[] }[] {
  const out: { label: string; items: ChatSession[] }[] = []
  for (const s of items) {
    const label = dayLabel(s.updatedAt)
    const last = out[out.length - 1]
    if (last && last.label === label) last.items.push(s)
    else out.push({ label, items: [s] })
  }
  return out
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  if (ts >= startOfToday) return 'Today'
  if (ts >= startOfToday - day) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function whenLabel(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
