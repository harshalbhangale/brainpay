/**
 * PAL chat (light) — the real multi-agent "money council", wired to the backend
 * (`/chat`, `/chat/execute`, `/chat/history`) with intent-confirmation cards.
 * Restyled to `.pv`. Camera/voice open the live session; history opens the viewer.
 * (Those two overlays are swapped to light versions in later phases.)
 */
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { ChevronLeft, SquarePen, History as HistoryIcon, Camera, AudioLines, ArrowUp, ListChecks } from 'lucide-react'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { useAuthStore } from '../../stores/auth'
import { ChorePickerSheet } from '../chores/verify'
import { AGENTS, SPECIALISTS, agentFor, type Agent, type AgentId } from '../../lib/agents'

const LiveSession = lazy(() => import('./LiveSession').then((m) => ({ default: m.LiveSession })))
const ConversationHistory = lazy(() => import('../../components/ConversationHistory').then((m) => ({ default: m.ConversationHistory })))

type Pal = { palId: string; line: string }
type Intent = { kind: 'add_chore' | 'topup' | 'set_goal' } & Record<string, unknown>
type SendResponse = { reply: string; pals?: Pal[]; intent?: Intent; requiresConfirmation?: boolean }
type ExecuteResponse = { ok: boolean; confirmationMessage?: string }
type Msg = { id: string; kind: 'user' | 'agent'; agentId?: AgentId; content: string }

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

const SUGGESTIONS = ['Add a dishes chore for $50', 'How much has my kid saved?', 'Add $20 to their wallet', 'Set a savings goal for a bike']

export function Chat({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [pickChore, setPickChore] = useState(false)
  const isKid = useAuthStore((s) => s.account?.accountType === 'kid')
  const scrollRef = useRef<HTMLDivElement>(null)

  async function newChat() {
    setMessages([])
    setPendingIntent(null)
    setInput('')
    try { await api('/chat/history', { method: 'DELETE' }) } catch { /* ignore */ }
  }

  useEffect(() => {
    let active = true
    api<{ messages: { id: string; role: string; content: string }[] }>('/chat/history')
      .then((res) => {
        if (!active) return
        setMessages((res.messages ?? []).map((m) => ({ id: m.id, kind: m.role === 'user' ? 'user' : 'agent', agentId: m.role === 'user' ? undefined : 'pal', content: m.content })))
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingHistory(false) })
    return () => { active = false }
  }, [])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending, pendingIntent])

  async function sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setInput('')
    setPendingIntent(null)
    setMessages((m) => [...m, { id: uid(), kind: 'user', content: trimmed }])
    setSending(true)
    try {
      const res = await api<SendResponse>('/chat', { method: 'POST', body: JSON.stringify({ message: trimmed }) })
      const additions: Msg[] = [{ id: uid(), kind: 'agent', agentId: 'pal', content: res.reply }]
      for (const p of res.pals ?? []) additions.push({ id: uid(), kind: 'agent', agentId: agentFor(p.palId).id, content: p.line })
      setMessages((m) => [...m, ...additions])
      if (res.requiresConfirmation && res.intent) setPendingIntent(res.intent)
    } catch {
      setMessages((m) => [...m, { id: uid(), kind: 'agent', agentId: 'pal', content: "I'm having trouble thinking right now. Try again?" }])
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
      const res = await api<ExecuteResponse>('/chat/execute', { method: 'POST', body: JSON.stringify({ intent }) })
      setMessages((m) => [...m, { id: uid(), kind: 'agent', agentId: 'pal', content: res.confirmationMessage ?? 'Done.' }])
    } catch (e) {
      setMessages((m) => [...m, { id: uid(), kind: 'agent', agentId: 'pal', content: e instanceof Error ? `Couldn't do that: ${e.message}` : "Couldn't do that." }])
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
      {showHistory && (
        <Suspense fallback={null}>
          <ConversationHistory onClose={() => setShowHistory(false)} />
        </Suspense>
      )}
      {pickChore && <ChorePickerSheet onClose={() => setPickChore(false)} />}

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-2">
          {onClose && (
            <button onClick={onClose} aria-label="Back" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="pv-title leading-tight">The council</div>
            <div className="flex items-center gap-1.5 pt-0.5">
              {SPECIALISTS.map((a) => (
                <span key={a.id} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                  <a.Icon size={11} style={{ color: a.color }} />
                  {a.name.replace('PAL', '')}
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => setShowHistory(true)} aria-label="Voice history" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            <HistoryIcon size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
          <button onClick={newChat} aria-label="New chat" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
            <SquarePen size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className="pv-no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {empty && <EmptyState onPick={sendText} />}
          {messages.map((m, i) => (m.kind === 'user' ? <UserBubble key={m.id} content={m.content} /> : <AgentBubble key={m.id} agent={agentFor(m.agentId)} content={m.content} index={i} />))}
          {sending && <Conferring />}
          {pendingIntent && <IntentCard intent={pendingIntent} onConfirm={confirmIntent} onCancel={() => setPendingIntent(null)} />}
        </div>

        {/* Kid quick action: jump straight to camera chore verification */}
        {isKid && (
          <div className="flex flex-none px-3 pt-1">
            <button
              onClick={() => setPickChore(true)}
              className="pv-press pv-pop flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold"
              style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-accent)' }}
            >
              <ListChecks size={16} /> Verify a chore
            </button>
          </div>
        )}

        {/* Composer */}
        <Composer value={input} disabled={sending} onChange={setInput} onSend={() => sendText(input)} onCamera={() => setLive({ camera: true })} onVoice={() => setLive({ camera: false })} />
      </div>
    </>
  )
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center px-4 pt-8 text-center">
      <div className="pv-scale-in mb-4"><AgentOrb agent={AGENTS.pal} size={72} aura /></div>
      <div className="pv-h2 pv-rise">Meet your money council</div>
      <p className="pv-body pv-rise mt-1.5 max-w-xs" style={{ animationDelay: '0.08s', color: 'var(--pv-ink-2)' }}>
        Ask PAL anything. MoneyPAL, HealthPAL &amp; StudyPAL jump in when it's their thing.
      </p>
      <div className="mt-5 flex w-full flex-col gap-2.5">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} onClick={() => onPick(s)} className="pv-press pv-pop rounded-2xl px-4 py-3.5 text-left text-sm font-semibold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${i * 50}ms` }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 }}>
        {content}
      </div>
    </div>
  )
}

function AgentBubble({ agent, content, index }: { agent: Agent; content: string; index: number }) {
  const isPal = agent.id === 'pal'
  return (
    <div className="flex items-end gap-2">
      <AgentOrb agent={agent} size={30} />
      <div className="max-w-[82%]">
        {!isPal && (
          <div className="mb-1 ml-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: agent.color }}>
            <agent.Icon size={12} /> {agent.name}
          </div>
        )}
        <div
          className="whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
          style={isPal ? { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', borderBottomLeftRadius: 6 } : { background: `${agent.color}1a`, boxShadow: `inset 0 0 0 1px ${agent.color}33`, borderBottomLeftRadius: 6 }}
          // index reserved for future stagger
          data-i={index}
        >
          {content}
        </div>
      </div>
    </div>
  )
}

function Conferring() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {[AGENTS.pal, AGENTS.moneypal, AGENTS.healthpal].map((a) => (
          <AgentOrb key={a.id} agent={a} size={28} ring />
        ))}
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>
        <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
        <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
        <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
        <span className="ml-1 text-xs" style={{ color: 'var(--pv-ink-3)' }}>the council is thinking…</span>
      </div>
    </div>
  )
}

function IntentCard({ intent, onConfirm, onCancel }: { intent: Intent; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="pv-pop rounded-2xl p-4" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-md)' }}>
      <div className="pv-label pv-text-accent">PAL wants to</div>
      <div className="mt-1 font-bold">{describeIntent(intent)}</div>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="pv-press flex-1 rounded-full py-2.5 text-sm font-bold" style={{ background: 'var(--pv-surface-2)' }}>Cancel</button>
        <button onClick={onConfirm} className="pv-press-lg pv-sheen flex-1 rounded-full py-2.5 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>Confirm</button>
      </div>
    </div>
  )
}

function Composer({ value, disabled, onChange, onSend, onCamera, onVoice }: {
  value: string; disabled: boolean; onChange: (v: string) => void; onSend: () => void; onCamera: () => void; onVoice: () => void
}) {
  const canSend = !disabled && !!value.trim()
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSend() }} className="flex items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
      <button type="button" onClick={onCamera} aria-label="Point the camera and ask" className="pv-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-accent)' }}>
        <Camera size={20} />
      </button>
      <button type="button" onClick={onVoice} aria-label="Talk to PAL" className="pv-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-accent)' }}>
        <AudioLines size={20} />
      </button>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Message the council…" className="h-12 flex-1 rounded-full px-4 outline-none" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink)' }} />
      <button type="submit" disabled={!canSend} aria-label="Send" className="pv-press-lg pv-sheen flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: canSend ? 'var(--pv-shadow-pop)' : undefined }}>
        <ArrowUp size={20} strokeWidth={2.8} />
      </button>
    </form>
  )
}

function AgentOrb({ agent, size, aura, ring }: { agent: Agent; size: number; aura?: boolean; ring?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {aura && (
        <span className="animate-spin-slow absolute inset-[-4px] rounded-full opacity-60 blur-[3px]" style={{ background: `conic-gradient(from 0deg, ${agent.gradient[0]}, ${agent.gradient[1]}, var(--pv-accent), ${agent.gradient[0]})` }} />
      )}
      <span className="relative flex items-center justify-center rounded-full text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, ${agent.gradient[0]}, ${agent.gradient[1]})`, boxShadow: ring ? '0 0 0 2px var(--pv-surface)' : `0 6px 18px -6px ${agent.color}88` }}>
        <agent.Icon size={size * 0.5} strokeWidth={2.4} />
      </span>
    </span>
  )
}
