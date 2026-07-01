/**
 * PAL chat (light) — the real multi-agent "money council", wired to the backend
 * (`/chat`, `/chat/execute`, `/chat/history`) with intent-confirmation cards.
 * Restyled to `.pv`. Camera/voice open the live session; history opens the viewer.
 * (Those two overlays are swapped to light versions in later phases.)
 */
import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react'
import { ChevronLeft, SquarePen, History as HistoryIcon, ArrowUp, ListChecks, Plus, Image as ImageIcon, Paperclip, X, Sparkles, ChevronDown, ScanLine, Check, Camera, Wallet, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { useAuthStore } from '../../stores/auth'
import { ChorePickerSheet } from '../chores/verify'
import { registerAiHandler } from '../pals/aiBus'
import { useSessionStore } from '../lib/sessions'
import { useHistoryView } from '../lib/historyStore'
import { useActiveChild } from '../lib/activeChild'
import { useFamilyKids, useWallet } from '../useMoneyPal'
import { AGENTS, SPECIALISTS, agentFor, type Agent, type AgentId } from '../../lib/agents'
import { PalHero } from '../pals/PalHero'
import { PAL_MAP, type PalKey } from '../pals/config'
import { palCharacter } from '../pals/palCharacters'

const LiveSession = lazy(() => import('./LiveSession').then((m) => ({ default: m.LiveSession })))

type Pal = { palId: string; line: string }
type Intent = { kind: 'add_chore' | 'topup' | 'set_goal' | 'contribute_goal' | 'send_note' | 'create_rule' | 'remember' | 'verify_chore' | 'issue_card' } & Record<string, unknown>
type SendResponse = { reply: string; pals?: Pal[]; intent?: Intent; requiresConfirmation?: boolean }
type ExecuteResponse = { ok: boolean; confirmationMessage?: string }
type Msg = { id: string; kind: 'user' | 'agent'; agentId?: AgentId; content: string; images?: string[] }

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
    case 'contribute_goal':
      return `Add ${aud((intent.brainsDelta as number) ?? 0)} toward ${kidName}'s ${(intent.goalName as string) || 'goal'}`
    case 'send_note':
      return `Send ${kidName}: “${intent.message as string}”`
    case 'create_rule':
      return `Add family rule: “${intent.ruleText as string}”`
    case 'remember':
      return intent.kidName
        ? `Remember about ${kidName}: “${intent.fact as string}”`
        : `Remember: “${intent.fact as string}”`
    case 'issue_card': {
      const limit = (intent.dailyLimit as number) ?? 20
      const blocks = Array.isArray(intent.blocks) ? (intent.blocks as string[]) : ['gambling', 'in_app']
      const blockLabel = blocks.map((b) => b.replace('in_app', 'in-app')).join(' + ')
      return `Issue ${kidName} a BrainPal card — $${limit}/day${blockLabel ? `, blocking ${blockLabel}` : ''}`
    }
    default:
      return 'Confirm this action?'
  }
}

const SUGGESTIONS = ['Add a dishes chore for $50', 'Put $5 toward Mia\u2019s bike goal', 'Tell Sam I\u2019m proud of him', 'Set a rule: no spending over $20']

export function Chat({ onClose, pal = 'ai', onSwitchPal }: { onClose?: () => void; pal?: PalKey; onSwitchPal?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [pickChore, setPickChore] = useState(false)
  // Which specialist Pals the user has chosen to talk to. Empty = Auto (PAL
  // answers + relevant Pals chime in). 1+ = only those Pals answer, in-voice.
  // On the MoneyPal surface we focus MoneyPal so replies come in its voice.
  const [selected, setSelected] = useState<Set<string>>(() => (pal === 'moneypal' ? new Set(['moneypal']) : new Set()))
  // A read-only balance card, shown on the money surface when the user asks
  // about their balance/wallet. Purely informational (no dead-ends).
  const [showBalance, setShowBalance] = useState(false)
  const isKid = useAuthStore((s) => s.account?.accountType === 'kid')
  const myId = useAuthStore((s) => s.account?.id)
  const childId = useActiveChild((s) => s.childId)
  const scopedChildId = isKid ? (myId ?? null) : childId
  const { kids } = useFamilyKids()
  const activeKidName = !isKid && childId ? (kids.find((k) => k.id === childId)?.name ?? null) : null
  const scrollRef = useRef<HTMLDivElement>(null)
  // The History session this typed conversation is being recorded into. Reset
  // by "New chat" so each fresh conversation becomes its own session.
  const textSessionRef = useRef<string | null>(null)
  // When we resume a session from History, skip the initial /chat/history load
  // so its (single-stream) result can't clobber the restored transcript.
  const skipInitialHistory = useRef(false)
  const openHistory = useHistoryView((s) => s.openHistory)

  function ensureTextSession(firstMessage: string): string {
    if (!textSessionRef.current) {
      const title = firstMessage.trim().slice(0, 48) || 'New chat'
      textSessionRef.current = useSessionStore.getState().start('text', title)
    }
    return textSessionRef.current
  }

  // Reopen a recorded text session in the chat view and keep appending to it.
  function resumeSession(sessionId: string) {
    const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
    if (!session) return
    skipInitialHistory.current = true
    setPendingIntent(null)
    setInput('')
    setLoadingHistory(false)
    textSessionRef.current = session.id
    setMessages(session.turns.map((t) => {
      const mine = t.role === 'you' || t.role === 'user'
      return { id: uid(), kind: mine ? 'user' : 'agent', agentId: mine ? undefined : 'pal', content: t.text }
    }))
  }

  async function newChat() {
    setMessages([])
    setPendingIntent(null)
    setInput('')
    textSessionRef.current = null
    skipInitialHistory.current = false
    try { await api('/chat/history', { method: 'DELETE' }) } catch { /* ignore */ }
  }

  useEffect(() => {
    let active = true
    api<{ messages: { id: string; role: string; content: string }[] }>('/chat/history')
      .then((res) => {
        if (!active || skipInitialHistory.current) return
        setMessages((res.messages ?? []).map((m) => ({ id: m.id, kind: m.role === 'user' ? 'user' : 'agent', agentId: m.role === 'user' ? undefined : 'pal', content: m.content })))
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingHistory(false) })
    return () => { active = false }
  }, [])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending, pendingIntent])

  // Let the app-shell drawer / history drive the chat. Commands sent while this
  // screen is unmounted are queued by the bus and flushed on mount.
  useEffect(() => registerAiHandler((cmd) => {
    if (cmd.type === 'new-chat') void newChat()
    else if (cmd.type === 'resume') resumeSession(cmd.sessionId)
    else if (cmd.type === 'live') setLive({ camera: cmd.camera })
    else if (cmd.type === 'ask') void sendText(cmd.text)
  }), [])

  async function sendText(text: string, images: string[] = []) {
    const trimmed = text.trim()
    const message = trimmed || (images.length ? 'Take a look at this.' : '')
    if (!message || sending) return
    setInput('')
    setPendingIntent(null)
    // Money surface: show a read-only balance card when they ask about money.
    setShowBalance(pal === 'moneypal' && /\b(balance|how much|wallet|pot|pots|my money|his money|her money)\b/i.test(message))
    setMessages((m) => [...m, { id: uid(), kind: 'user', content: trimmed, images: images.length ? images : undefined }])
    setSending(true)
    const sid = ensureTextSession(message)
    useSessionStore.getState().append(sid, [{ role: 'you', text: images.length ? `${trimmed} [${images.length} image${images.length > 1 ? 's' : ''}]`.trim() : trimmed }])
    try {
      const res = await api<SendResponse>('/chat', { method: 'POST', body: JSON.stringify({ message, pals: Array.from(selected), images, childId: scopedChildId ?? undefined }) })
      const additions: Msg[] = []
      if (res.reply) additions.push({ id: uid(), kind: 'agent', agentId: 'pal', content: res.reply })
      for (const p of res.pals ?? []) additions.push({ id: uid(), kind: 'agent', agentId: agentFor(p.palId).id, content: p.line })
      setMessages((m) => [...m, ...additions])
      useSessionStore.getState().append(sid, additions.map((a) => ({ role: 'pal', text: a.content })))
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
      const res = await api<ExecuteResponse>('/chat/execute', { method: 'POST', body: JSON.stringify({ intent, childId: scopedChildId ?? undefined }) })
      const msg = res.confirmationMessage ?? 'Done.'
      setMessages((m) => [...m, { id: uid(), kind: 'agent', agentId: 'pal', content: msg }])
      if (textSessionRef.current) useSessionStore.getState().append(textSessionRef.current, [{ role: 'pal', text: msg }])
    } catch (e) {
      setMessages((m) => [...m, { id: uid(), kind: 'agent', agentId: 'pal', content: e instanceof Error ? `Couldn't do that: ${e.message}` : "Couldn't do that." }])
    } finally {
      setSending(false)
    }
  }

  const empty = !loadingHistory && messages.length === 0

  // The character fronting this surface (reused Companion avatar + accent).
  const ch = palCharacter(pal)
  const PalIcon = PAL_MAP[pal].Icon

  // Pal selection: derived label + toggles.
  const selectedAgents = SPECIALISTS.filter((a) => selected.has(a.id))
  const palLabel = selectedAgents.length === 0
    ? 'your Pals'
    : selectedAgents.map((a) => a.name.replace('PAL', 'Pal')).join(' & ')
  const togglePal = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const setAuto = () => setSelected(new Set())

  return (
    <>
      {live && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
          <LiveSession withCamera={live.camera} onClose={() => setLive(null)} />
        </Suspense>
      )}
      {pickChore && <ChorePickerSheet onClose={() => setPickChore(false)} />}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="pv-mesh" aria-hidden />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-2">
          {onClose && (
            <button onClick={onClose} aria-label="Back" className="pv-press pv-glass flex h-10 w-10 items-center justify-center rounded-full">
              <ChevronLeft size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onSwitchPal}
            disabled={!onSwitchPal}
            aria-label={onSwitchPal ? 'Switch Pal' : undefined}
            className="pv-press flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-0.5 pl-0.5 pr-2 text-left disabled:cursor-default"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent, boxShadow: 'var(--pv-shadow-sm)' }}>
              <PalIcon size={17} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="pv-title pv-tight truncate leading-tight">{ch.palName}</span>
                {onSwitchPal && <ChevronDown size={15} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}
              </span>
              <span className="block truncate pt-0.5 text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                {selectedAgents.length === 0 ? `Talking to ${ch.characterName}` : `Talking to ${palLabel}`}
              </span>
            </span>
          </button>
          <button onClick={() => openHistory()} aria-label="History" className="pv-press pv-glass flex h-10 w-10 items-center justify-center rounded-full">
            <HistoryIcon size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
          <button onClick={newChat} aria-label="New chat" className="pv-press pv-glass flex h-10 w-10 items-center justify-center rounded-full">
            <SquarePen size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className="pv-no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="mx-auto w-full max-w-2xl space-y-4">
          {empty && <EmptyState onPick={sendText} isKid={isKid} childName={activeKidName} pal={pal} />}
          {messages.map((m, i) => (m.kind === 'user' ? <UserBubble key={m.id} content={m.content} images={m.images} /> : <AgentBubble key={m.id} agent={agentFor(m.agentId)} content={m.content} index={i} />))}
          {sending && <Conferring />}
          {pendingIntent && (pendingIntent.kind === 'verify_chore'
            ? <VerifyChoreCard title={typeof pendingIntent.title === 'string' ? pendingIntent.title : undefined} onShow={() => { setPickChore(true); setPendingIntent(null) }} onCancel={() => setPendingIntent(null)} />
            : <IntentCard intent={pendingIntent} onConfirm={confirmIntent} onCancel={() => setPendingIntent(null)} />)}
          {showBalance && <BalanceCard />}
          </div>
        </div>

        {/* Kid quick action + composer — centered on wide screens */}
        <div className="mx-auto w-full max-w-2xl">
        {isKid && (
          <div className="flex flex-none px-3 pt-1">
            <button
              onClick={() => setPickChore(true)}
              className="pv-press pv-pop pv-glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold"
              style={{ color: 'var(--pv-accent)' }}
            >
              <ListChecks size={16} /> Verify a chore
            </button>
          </div>
        )}

        {/* Composer — ChatGPT-style: + attachments, integrated Pal picker, scan + voice + send */}
        <Composer
          value={input}
          disabled={sending}
          placeholder={selectedAgents.length === 0 ? 'Message your Pals…' : `Ask ${palLabel}…`}
          onChange={setInput}
          onSend={(t, imgs) => sendText(t, imgs)}
          onScan={() => setLive({ camera: true })}
          selected={selected}
          selectedAgents={selectedAgents}
          onTogglePal={togglePal}
          onAuto={setAuto}
        />
        </div>
        </div>
      </div>
    </>
  )
}

function EmptyState({ onPick, isKid, childName, pal }: { onPick: (t: string) => void; isKid: boolean; childName: string | null; pal: PalKey }) {
  const greeting = isKid
    ? "Here's your money at a glance. Ask me anything, or tap a card above."
    : childName
      ? `Here's ${childName}'s world. Ask me anything, or tap a card above.`
      : 'Here\u2019s your family at a glance. Ask me anything, or tap a card above.'
  return (
    <div className="flex flex-col items-center px-2 pt-3 text-center">
      <PalHero pal={pal} caption={greeting} />
      <div className="mt-6 flex w-full flex-col gap-2.5">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} onClick={() => onPick(s)} className="pv-press pv-pop pv-glass pv-hairline rounded-2xl px-4 py-3 text-left text-sm font-semibold" style={{ animationDelay: `${i * 50}ms` }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function UserBubble({ content, images }: { content: string; images?: string[] }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {images && images.length > 0 && (
        <div className="flex max-w-[82%] flex-wrap justify-end gap-1.5">
          {images.map((src, i) => (
            <img key={i} src={src} alt="" className="h-28 w-28 rounded-2xl object-cover" style={{ boxShadow: 'var(--pv-shadow-sm)' }} />
          ))}
        </div>
      )}
      {content && (
        <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 }}>
          {content}
        </div>
      )}
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
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isPal ? 'pv-glass' : ''}`}
          style={isPal ? { borderBottomLeftRadius: 6 } : { background: `${agent.color}1a`, boxShadow: `inset 0 0 0 1px ${agent.color}33`, borderBottomLeftRadius: 6 }}
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
      <div className="pv-glass flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5">
        <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
        <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
        <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
        <span className="ml-1 text-xs" style={{ color: 'var(--pv-ink-3)' }}>your Pals are thinking…</span>
      </div>
    </div>
  )
}

function IntentCard({ intent, onConfirm, onCancel }: { intent: Intent; onConfirm: () => void; onCancel: () => void }) {
  // Card-issue preview — name · limit · blocks → Adjust / Issue.
  if (intent.kind === 'issue_card') {
    const kidName = (intent.kidName as string) || 'your kid'
    const limit = (intent.dailyLimit as number) ?? 20
    const blocks = Array.isArray(intent.blocks) ? (intent.blocks as string[]) : ['gambling', 'in_app']
    return (
      <div className="pv-pop pv-glass pv-hairline rounded-2xl p-4">
        <div className="pv-label pv-text-accent">New card</div>
        <div className="mt-1 font-bold">{kidName}’s BrainPal card</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>${limit}/day limit</span>
          {blocks.map((b) => (
            <span key={b} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>blocks {b.replace('in_app', 'in-app')}</span>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="pv-press pv-glass-soft flex-1 rounded-full py-2.5 text-sm font-bold">Adjust</button>
          <button onClick={onConfirm} className="pv-press-lg pv-sheen flex-1 rounded-full py-2.5 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>Issue card</button>
        </div>
      </div>
    )
  }

  // Money movement — hold-to-send guards against accidental transfers.
  if (intent.kind === 'topup') {
    return (
      <div className="pv-pop pv-glass pv-hairline rounded-2xl p-4">
        <div className="pv-label pv-text-accent">MoneyPal wants to</div>
        <div className="mt-1 font-bold">{describeIntent(intent)}</div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onCancel} className="pv-press pv-glass-soft rounded-full px-5 py-2.5 text-sm font-bold">Cancel</button>
          <HoldButton onComplete={onConfirm} label="Hold to send" />
        </div>
      </div>
    )
  }

  return (
    <div className="pv-pop pv-glass pv-hairline rounded-2xl p-4">
      <div className="pv-label pv-text-accent">PAL wants to</div>
      <div className="mt-1 font-bold">{describeIntent(intent)}</div>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="pv-press pv-glass-soft flex-1 rounded-full py-2.5 text-sm font-bold">Cancel</button>
        <button onClick={onConfirm} className="pv-press-lg pv-sheen flex-1 rounded-full py-2.5 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>Confirm</button>
      </div>
    </div>
  )
}

// Press-and-hold to confirm a money transfer. Fills a progress bar; releasing
// early cancels. Fires once when the hold completes.
function HoldButton({ onComplete, label }: { onComplete: () => void; label: string }) {
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  const HOLD_MS = 750

  const stop = () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = null }
  useEffect(() => stop, [])

  function tick(now: number) {
    const p = Math.min(1, (now - startRef.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      if (!doneRef.current) { doneRef.current = true; onComplete() }
      return
    }
    raf.current = requestAnimationFrame(tick)
  }
  function start() {
    if (doneRef.current) return
    startRef.current = performance.now()
    stop()
    raf.current = requestAnimationFrame(tick)
  }
  function cancel() {
    stop()
    if (!doneRef.current) setProgress(0)
  }

  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className="pv-press-lg relative flex-1 overflow-hidden rounded-full py-2.5 text-sm font-bold"
      style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', touchAction: 'none' }}
    >
      <span className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: 'rgba(255,255,255,0.3)' }} aria-hidden />
      <span className="relative">{progress >= 1 ? 'Sending\u2026' : label}</span>
    </button>
  )
}

// Read-only snapshot of the relevant wallet, shown when the user asks about
// their balance. Reuses the live wallet/family hooks — no fake numbers.
function BalanceCard() {
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const childId = useActiveChild((s) => s.childId)
  const { kids } = useFamilyKids()
  const wallet = useWallet()
  const kid = !isKid && childId ? kids.find((k) => k.id === childId) ?? null : null
  const name = isKid ? (((account?.persona?.name as string) || 'You').split(' ')[0]) : (kid?.name ?? 'Family')
  const balance = isKid ? wallet.balance : (kid ? kid.balance : wallet.balance)
  return (
    <div className="pv-pop pv-glass pv-hairline rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="pv-label pv-text-accent">{isKid ? 'Your balance' : `${name}\u2019s balance`}</div>
        <Wallet size={16} style={{ color: 'var(--pv-ink-3)' }} />
      </div>
      <div className="pv-amount mt-1 text-3xl">{aud(balance)}</div>
      <div className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Available to spend</div>
    </div>
  )
}

function VerifyChoreCard({ title, onShow, onCancel }: { title?: string; onShow: () => void; onCancel: () => void }) {
  return (
    <div className="pv-pop pv-glass pv-hairline rounded-2xl p-4">
      <div className="pv-label pv-text-accent">Verify a chore</div>
      <div className="mt-1 font-bold">{title ? `Show me you did “${title}”` : 'Show me you did it'}</div>
      <p className="mt-1 text-sm" style={{ color: 'var(--pv-ink-3)' }}>Point your camera at the finished chore — I’ll check it and release your reward.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="pv-press pv-glass-soft flex-1 rounded-full py-2.5 text-sm font-bold">Not now</button>
        <button onClick={onShow} className="pv-press-lg pv-sheen flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
          <Camera size={16} /> Show me
        </button>
      </div>
    </div>
  )
}

// Downscale a picked image to a compact JPEG data URL — vision-ready, small payload.
async function fileToDataUrl(file: File, max = 1024, quality = 0.7): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  return await new Promise<string>((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(raw); return }
      ctx.drawImage(img, 0, 0, w, h)
      try { resolve(canvas.toDataURL('image/jpeg', quality)) } catch { resolve(raw) }
    }
    img.onerror = () => resolve(raw)
    img.src = raw
  })
}

const MAX_IMAGES = 4

function Composer({ value, disabled, placeholder, onChange, onSend, onScan, selected, selectedAgents, onTogglePal, onAuto }: {
  value: string
  disabled: boolean
  placeholder: string
  onChange: (v: string) => void
  onSend: (text: string, images: string[]) => void
  onScan: () => void
  selected: Set<string>
  selectedAgents: Agent[]
  onTogglePal: (id: string) => void
  onAuto: () => void
}) {
  const [attachOpen, setAttachOpen] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [palOpen, setPalOpen] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const canSend = !disabled && (!!value.trim() || images.length > 0)

  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`
  }, [value])

  async function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
    if (picked.length === 0) return
    setAttachOpen(true)
    setBusy(true)
    try {
      const room = Math.max(0, MAX_IMAGES - images.length)
      const urls = await Promise.all(picked.slice(0, room).map((f) => fileToDataUrl(f)))
      setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES))
    } finally {
      setBusy(false)
    }
  }

  function submit() {
    if (!canSend) return
    onSend(value, images)
    setImages([])
    setAttachOpen(false)
    setPalOpen(false)
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  return (
    <div className="relative px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
      {/* Tap-away layer for the Pals popover */}
      {palOpen && <button aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setPalOpen(false)} />}

      <div className="pv-composer pv-glass pv-hairline relative z-20 rounded-[28px] p-2">
        {/* Attachment tray — grows the box; sits ABOVE the input */}
        {(attachOpen || images.length > 0) && (
          <div className="pv-rise px-1 pb-2 pt-1">
            <div className="flex gap-2">
              <TrayButton icon={ImageIcon} label="Photos" onClick={() => photoInput.current?.click()} />
              <TrayButton icon={Paperclip} label="Files" onClick={() => fileInput.current?.click()} />
            </div>
            {(images.length > 0 || busy) && (
              <div className="pv-no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                {images.map((src, i) => (
                  <div key={i} className="relative h-16 w-16 flex-none overflow-hidden rounded-2xl" style={{ boxShadow: 'var(--pv-shadow-sm)' }}>
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))} aria-label="Remove image" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: 'rgba(11,12,15,0.6)', color: '#fff' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {busy && <div className="h-16 w-16 flex-none animate-pulse rounded-2xl" style={{ background: 'var(--pv-surface-2)' }} />}
              </div>
            )}
          </div>
        )}

        {/* Text input — auto-grows */}
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder={placeholder}
          className="pv-no-scrollbar block max-h-[132px] w-full resize-none bg-transparent px-3 pt-1.5 text-[15px] leading-relaxed outline-none"
          style={{ color: 'var(--pv-ink)' }}
        />

        {/* Toolbar: left = + & Pals · right = scan, send */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="relative flex min-w-0 items-center gap-1.5">
            <ToolButton onClick={() => setAttachOpen((o) => !o)} active={attachOpen} label="Add photos & files">
              <Plus size={20} strokeWidth={2.4} />
            </ToolButton>

            <button
              type="button"
              onClick={() => setPalOpen((o) => !o)}
              className="pv-press pv-glass-soft flex min-w-0 max-w-[42vw] items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-2 text-[13px] font-bold"
              style={{ color: 'var(--pv-ink-2)' }}
            >
              <Sparkles size={14} className="shrink-0" style={{ color: 'var(--pv-accent)' }} />
              <span className="truncate">{selectedAgents.length === 0 ? 'Auto' : (selectedAgents.length === 1 ? selectedAgents[0].name.replace('PAL', 'Pal') : `${selectedAgents.length} Pals`)}</span>
              <ChevronDown size={13} className="shrink-0" />
            </button>

            {palOpen && (
              <div className="pv-menu pv-hairline absolute bottom-12 left-0 z-30 w-56 rounded-2xl p-2">
                <div className="pv-label px-2 pb-1">Who answers</div>
                <PalRow label="Auto" hint="Best Pals chime in" active={selectedAgents.length === 0} onClick={onAuto} />
                {SPECIALISTS.map((a) => (
                  <PalRow key={a.id} label={a.name.replace('PAL', 'Pal')} Icon={a.Icon} color={a.color} active={selected.has(a.id)} onClick={() => onTogglePal(a.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Scan — opens the live camera; you can close the camera in there to just talk */}
            <button type="button" onClick={onScan} aria-label="Scan, or talk to your Pals" className="pv-press-lg relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-white" style={{ backgroundImage: 'var(--pv-grad-ink)', boxShadow: 'var(--pv-shadow-md)' }}>
              <span className="pv-scan-ping absolute inset-0 rounded-full" style={{ border: '1.5px solid var(--pv-accent)' }} />
              <ScanLine size={20} />
            </button>
            <button type="button" onClick={submit} disabled={!canSend} aria-label="Send" className="pv-press-lg pv-sheen flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: canSend ? 'var(--pv-shadow-pop)' : undefined }}>
              <ArrowUp size={20} strokeWidth={2.8} />
            </button>
          </div>
        </div>
      </div>

      {/* Hidden pickers. Both target images (vision). On mobile these surface the
          phone's recent photos / file browser natively. */}
      <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}

function TrayButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pv-press pv-glass-soft flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>
      <Icon size={18} style={{ color: 'var(--pv-accent)' }} /> {label}
    </button>
  )
}

function ToolButton({ children, onClick, active, label }: { children: ReactNode; onClick: () => void; active?: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={`pv-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${active ? '' : 'pv-glass-soft'}`} style={active ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { color: 'var(--pv-ink-2)' }}>
      {children}
    </button>
  )
}

function PalRow({ label, hint, Icon, color, active, onClick }: { label: string; hint?: string; Icon?: LucideIcon; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pv-press flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full" style={{ background: active ? 'var(--pv-accent)' : 'var(--pv-surface-2)', color: active ? 'var(--pv-on-accent)' : (color ?? 'var(--pv-ink-2)') }}>
        {Icon ? <Icon size={16} /> : <Sparkles size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
        {hint && <span className="block truncate text-[11px] font-medium" style={{ color: 'var(--pv-ink-3)' }}>{hint}</span>}
      </span>
      {active && <Check size={16} style={{ color: 'var(--pv-accent)' }} />}
    </button>
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
