import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { api } from '../lib/api'
import { aud } from '../lib/format'
import { AGENTS, SPECIALISTS, agentFor, type Agent, type AgentId } from '../lib/agents'
import { BrandLogo } from './BrandLogo'
import { ConversationHistory } from './ConversationHistory'
import { PressButton, GradientButton } from './ui'
import { SquarePen, History as HistoryIcon } from 'lucide-react'

const LiveSession = lazy(() => import('./LiveSession').then((m) => ({ default: m.LiveSession })))

type Pal = { palId: string; line: string }
type Intent = { kind: 'add_chore' | 'topup' | 'set_goal' } & Record<string, unknown>

type SendResponse = {
  reply: string
  pals?: Pal[]
  intent?: Intent
  requiresConfirmation?: boolean
}
type ExecuteResponse = { ok: boolean; confirmationMessage?: string }

/** A single item in the chat timeline. */
type Msg = {
  id: string
  kind: 'user' | 'agent'
  agentId?: AgentId
  content: string
}

let tmpId = 1
const uid = () => `m${tmpId++}`

function describeIntent(intent: Intent): string {
  const kidName = (intent.kidName as string) || 'your kid'
  switch (intent.kind) {
    case 'add_chore':
      return `Add chore "${intent.title as string}" for ${kidName} — ${aud((intent.rewardBrains as number) ?? 50)}`
    case 'topup':
      return `Add ${aud((intent.brainsDelta as number) ?? 0)} to ${kidName}'s wallet`
    case 'set_goal':
      return `Set goal "${intent.goalName as string}" for ${kidName} — ${aud((intent.targetBrains as number) ?? 500)}`
    default:
      return 'Confirm this action?'
  }
}

const SUGGESTIONS = [
  'Add a dishes chore for $50',
  'How much has my kid saved?',
  'Add $20 to their wallet',
  'Set a savings goal for a bike',
]

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function newChat() {
    setMessages([])
    setPendingIntent(null)
    setInput('')
    try {
      await api('/chat/history', { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }

  // Initial history load (oldest → newest).
  useEffect(() => {
    let active = true
    api<{ messages: { id: string; role: string; content: string }[] }>('/chat/history')
      .then((res) => {
        if (!active) return
        const hist: Msg[] = (res.messages ?? []).map((m) => ({
          id: m.id,
          kind: m.role === 'user' ? 'user' : 'agent',
          agentId: m.role === 'user' ? undefined : 'pal',
          content: m.content,
        }))
        setMessages(hist)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingHistory(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Auto-scroll to newest.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, pendingIntent])

  async function sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setInput('')
    setPendingIntent(null)
    setMessages((m) => [...m, { id: uid(), kind: 'user', content: trimmed }])
    setSending(true)
    try {
      const res = await api<SendResponse>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed }),
      })
      const additions: Msg[] = [{ id: uid(), kind: 'agent', agentId: 'pal', content: res.reply }]
      for (const p of res.pals ?? []) {
        additions.push({ id: uid(), kind: 'agent', agentId: agentFor(p.palId).id, content: p.line })
      }
      setMessages((m) => [...m, ...additions])
      if (res.requiresConfirmation && res.intent) setPendingIntent(res.intent)
    } catch {
      setMessages((m) => [
        ...m,
        { id: uid(), kind: 'agent', agentId: 'pal', content: "I'm having trouble thinking right now. Try again?" },
      ])
    } finally {
      setSending(false)
    }
  }

  async function confirmIntent() {
    if (!pendingIntent) return
    const intent = pendingIntent
    setPendingIntent(null)
    setSending(true)
    try {
      const res = await api<ExecuteResponse>('/chat/execute', {
        method: 'POST',
        body: JSON.stringify({ intent }),
      })
      setMessages((m) => [
        ...m,
        { id: uid(), kind: 'agent', agentId: 'pal', content: res.confirmationMessage ?? 'Done.' },
      ])
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          kind: 'agent',
          agentId: 'pal',
          content: e instanceof Error ? `Couldn't do that: ${e.message}` : "Couldn't do that.",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const empty = !loadingHistory && messages.length === 0

  return (
    <>
      {live && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
          <LiveSession withCamera={live.camera} onClose={() => setLive(null)} />
        </Suspense>
      )}
      {showHistory && <ConversationHistory onClose={() => setShowHistory(false)} />}
      <div className="flex h-full flex-col bg-canvas">
        <ChatHeader onNewChat={newChat} onHistory={() => setShowHistory(true)} />

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {empty && <EmptyState onPick={sendText} />}

          {messages.map((m, i) =>
            m.kind === 'user' ? (
              <UserBubble key={m.id} content={m.content} />
            ) : (
              <AgentBubble key={m.id} agent={agentFor(m.agentId)} content={m.content} index={i} />
            ),
          )}

          {sending && <Conferring />}

          {pendingIntent && <IntentCard intent={pendingIntent} onConfirm={confirmIntent} onCancel={() => setPendingIntent(null)} />}
        </div>

        <Composer
          value={input}
          disabled={sending}
          onChange={setInput}
          onSend={() => sendText(input)}
          onCamera={() => setLive({ camera: true })}
          onVoice={() => setLive({ camera: false })}
        />
      </div>
    </>
  )
}

/* ── Header: orchestrator orb + specialist roster ────────────────────── */
function ChatHeader({ onNewChat, onHistory }: { onNewChat: () => void; onHistory: () => void }) {
  return (
    <div className="relative flex items-center gap-3 border-b border-border px-4 py-3">
      <div className="pointer-events-none absolute -top-10 left-6 h-24 w-40 rounded-full bg-grad-aurora opacity-15 blur-2xl" />
      <BrandLogo size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {SPECIALISTS.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted glass">
              <a.Icon size={12} style={{ color: a.color }} />
              {a.name.replace('PAL', '')}
            </span>
          ))}
        </div>
      </div>
      <PressButton
        onClick={onHistory}
        aria-label="Conversation history"
        title="History"
        className="flex h-9 w-9 items-center justify-center rounded-full glass text-muted"
      >
        <HistoryIcon size={19} />
      </PressButton>
      <PressButton
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
        className="flex h-9 w-9 items-center justify-center rounded-full glass text-muted"
      >
        <SquarePen size={19} />
      </PressButton>
    </div>
  )
}

/* ── Empty state with suggestions ────────────────────────────────────── */
function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center px-4 pt-10 text-center">
      <div className="animate-scale-in relative mb-4">
        <AgentOrb agent={AGENTS.pal} size={76} aura />
      </div>
      <div className="animate-rise text-xl font-extrabold tracking-tight text-grad-accent">Meet your money council</div>
      <p className="animate-rise mt-1.5 max-w-xs text-sm text-muted" style={{ animationDelay: '0.08s' }}>
        Ask PAL anything. MoneyPAL, HealthPAL &amp; StudyPAL jump in when it's their thing.
      </p>
      <div className="mt-5 flex w-full flex-col gap-2.5">
        {SUGGESTIONS.map((s, i) => (
          <PressButton
            key={s}
            onClick={() => onPick(s)}
            className="grad-border animate-pop-in rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-ink"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {s}
          </PressButton>
        ))}
      </div>
    </div>
  )
}

/* ── Bubbles ─────────────────────────────────────────────────────────── */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="animate-msg-in flex justify-end">
      <div
        className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium leading-relaxed text-on-accent glow-accent"
        style={{ backgroundImage: 'var(--grad-accent-bright)' }}
      >
        {content}
      </div>
    </div>
  )
}

function AgentBubble({ agent, content, index }: { agent: Agent; content: string; index: number }) {
  const isPal = agent.id === 'pal'
  return (
    <div className="animate-msg-in flex items-end gap-2" style={{ animationDelay: `${Math.min(index, 6) * 24}ms` }}>
      <AgentOrb agent={agent} size={30} />
      <div className="max-w-[82%]">
        {!isPal && (
          <div className="mb-1 ml-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: agent.color }}>
            <agent.Icon size={12} /> {agent.name}
          </div>
        )}
        <div
          className="grad-border whitespace-pre-wrap rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed text-ink"
          style={
            isPal
              ? { backgroundImage: 'var(--grad-card)' }
              : { background: `${agent.color}1a`, boxShadow: `inset 0 0 0 1px ${agent.color}33` }
          }
        >
          {content}
        </div>
      </div>
    </div>
  )
}

/* ── Processing: "agents conferring" ─────────────────────────────────── */
function Conferring() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {[AGENTS.pal, AGENTS.moneypal, AGENTS.healthpal].map((a, i) => (
          <span key={a.id} className="animate-confer" style={{ animationDelay: `${i * 180}ms` }}>
            <AgentOrb agent={a} size={28} ring />
          </span>
        ))}
      </div>
      <div className="glass flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5">
        <span className="dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: '0ms' }} />
        <span className="dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: '160ms' }} />
        <span className="dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: '320ms' }} />
        <span className="ml-1 text-xs text-muted">the council is thinking…</span>
      </div>
    </div>
  )
}

/* ── Intent confirmation card ────────────────────────────────────────── */
function IntentCard({ intent, onConfirm, onCancel }: { intent: Intent; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="animate-pop-in grad-border rounded-2xl p-4 glow-accent" style={{ backgroundImage: 'var(--grad-card)' }}>
      <div className="text-xs font-bold uppercase tracking-widest text-grad-accent">PAL wants to</div>
      <div className="mt-1 font-semibold text-ink">{describeIntent(intent)}</div>
      <div className="mt-3 flex gap-2">
        <PressButton
          onClick={onCancel}
          className="glass flex-1 rounded-full py-2.5 text-sm font-bold text-ink"
        >
          Cancel
        </PressButton>
        <GradientButton onClick={onConfirm} className="flex-1 rounded-full py-2.5 text-sm">
          Confirm
        </GradientButton>
      </div>
    </div>
  )
}

/* ── Composer ────────────────────────────────────────────────────────── */
function Composer({
  value,
  disabled,
  onChange,
  onSend,
  onCamera,
  onVoice,
}: {
  value: string
  disabled: boolean
  onChange: (v: string) => void
  onSend: () => void
  onCamera: () => void
  onVoice: () => void
}) {
  const canSend = !disabled && !!value.trim()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSend()
      }}
      className="flex items-center gap-2 border-t border-surface2 p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <PressButton
        onClick={onCamera}
        aria-label="Point the camera and ask"
        title="Camera"
        className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-accent"
      >
        <CameraIcon />
      </PressButton>
      <PressButton
        onClick={onVoice}
        aria-label="Talk to PAL"
        title="Voice"
        className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-accent"
      >
        <WaveIcon />
      </PressButton>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Message the council…"
        className="grad-border h-12 flex-1 rounded-full bg-transparent px-4 text-ink outline-none placeholder:text-faint"
      />
      <PressButton
        type="submit"
        spring="lg"
        disabled={!canSend}
        aria-label="Send"
        className="sheen flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-black text-on-accent transition disabled:opacity-40 disabled:saturate-50"
        style={{ backgroundImage: 'var(--grad-accent-bright)', boxShadow: canSend ? 'var(--glow-accent)' : undefined }}
      >
        ↑
      </PressButton>
    </form>
  )
}

/* ── Agent avatar orb ────────────────────────────────────────────────── */
function AgentOrb({ agent, size, aura, ring }: { agent: Agent; size: number; aura?: boolean; ring?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {aura && (
        <span
          className="animate-spin-slow absolute inset-[-4px] rounded-full opacity-70 blur-[3px]"
          style={{ background: `conic-gradient(from 0deg, ${agent.gradient[0]}, ${agent.gradient[1]}, var(--violet), ${agent.gradient[0]})` }}
        />
      )}
      <span
        className="relative flex items-center justify-center rounded-full text-white"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${agent.gradient[0]}, ${agent.gradient[1]})`,
          boxShadow: ring ? '0 0 0 2px var(--color-canvas)' : `0 6px 18px -6px ${agent.color}88`,
        }}
      >
        <agent.Icon size={size * 0.5} strokeWidth={2.4} />
      </span>
    </span>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

function WaveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v2M7 7v10M12 4v16M17 7v10M21 11v2" />
    </svg>
  )
}
