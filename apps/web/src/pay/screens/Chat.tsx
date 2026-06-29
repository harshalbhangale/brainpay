/**
 * PAL chat (light) — the real multi-agent "money council", wired to the backend
 * (`/chat`, `/chat/execute`, `/chat/history`) with intent-confirmation cards.
 * Restyled to `.pv`. Camera/voice open the live session; history opens the viewer.
 * (Those two overlays are swapped to light versions in later phases.)
 */
import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react'
import { ChevronLeft, SquarePen, History as HistoryIcon, AudioLines, ArrowUp, ListChecks, Plus, Image as ImageIcon, Paperclip, X, Sparkles, ChevronDown, ScanLine, Check, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { useAuthStore } from '../../stores/auth'
import { ChorePickerSheet } from '../chores/verify'
import { registerAiHandler } from '../pals/aiBus'
import { useSessionStore } from '../lib/sessions'
import { useHistoryView } from '../lib/historyStore'
import { AGENTS, SPECIALISTS, agentFor, type Agent, type AgentId } from '../../lib/agents'

const LiveSession = lazy(() => import('./LiveSession').then((m) => ({ default: m.LiveSession })))

type Pal = { palId: string; line: string }
type Intent = { kind: 'add_chore' | 'topup' | 'set_goal' | 'contribute_goal' | 'send_note' | 'create_rule' | 'remember' } & Record<string, unknown>
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
    default:
      return 'Confirm this action?'
  }
}

const SUGGESTIONS = ['Add a dishes chore for $50', 'Put $5 toward Mia\u2019s bike goal', 'Tell Sam I\u2019m proud of him', 'Set a rule: no spending over $20']

export function Chat({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [pickChore, setPickChore] = useState(false)
  // Which specialist Pals the user has chosen to talk to. Empty = Auto (PAL
  // answers + relevant Pals chime in). 1+ = only those Pals answer, in-voice.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const isKid = useAuthStore((s) => s.account?.accountType === 'kid')
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
  }), [])

  async function sendText(text: string, images: string[] = []) {
    const trimmed = text.trim()
    const message = trimmed || (images.length ? 'Take a look at this.' : '')
    if (!message || sending) return
    setInput('')
    setPendingIntent(null)
    setMessages((m) => [...m, { id: uid(), kind: 'user', content: trimmed, images: images.length ? images : undefined }])
    setSending(true)
    const sid = ensureTextSession(message)
    useSessionStore.getState().append(sid, [{ role: 'you', text: images.length ? `${trimmed} [${images.length} image${images.length > 1 ? 's' : ''}]`.trim() : trimmed }])
    try {
      const res = await api<SendResponse>('/chat', { method: 'POST', body: JSON.stringify({ message, pals: Array.from(selected), images }) })
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
      const res = await api<ExecuteResponse>('/chat/execute', { method: 'POST', body: JSON.stringify({ intent }) })
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
          <div className="min-w-0 flex-1">
            <div className="pv-title pv-tight leading-tight">Your Pals</div>
            <div className="truncate pt-0.5 text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
              {selectedAgents.length === 0 ? 'Auto · your Pals chime in' : `Talking to ${palLabel}`}
            </div>
          </div>
          <button onClick={() => openHistory()} aria-label="History" className="pv-press pv-glass flex h-10 w-10 items-center justify-center rounded-full">
            <HistoryIcon size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
          <button onClick={newChat} aria-label="New chat" className="pv-press pv-glass flex h-10 w-10 items-center justify-center rounded-full">
            <SquarePen size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className="pv-no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {empty && <EmptyState onPick={sendText} />}
          {messages.map((m, i) => (m.kind === 'user' ? <UserBubble key={m.id} content={m.content} images={m.images} /> : <AgentBubble key={m.id} agent={agentFor(m.agentId)} content={m.content} index={i} />))}
          {sending && <Conferring />}
          {pendingIntent && <IntentCard intent={pendingIntent} onConfirm={confirmIntent} onCancel={() => setPendingIntent(null)} />}
        </div>

        {/* Kid quick action: jump straight to camera chore verification */}
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
          onVoice={() => setLive({ camera: false })}
          selected={selected}
          selectedAgents={selectedAgents}
          onTogglePal={togglePal}
          onAuto={setAuto}
        />
        </div>
      </div>
    </>
  )
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center px-4 pt-8 text-center">
      <div className="pv-scale-in mb-4"><AgentOrb agent={AGENTS.pal} size={72} aura /></div>
      <div className="pv-h2 pv-tight pv-rise">Ask your Pals</div>
      <p className="pv-body pv-rise mt-1.5 max-w-xs" style={{ animationDelay: '0.08s', color: 'var(--pv-ink-2)' }}>
        Ask anything, attach a photo, or scan something. Leave it on <b>Auto</b> and the right Pals jump in — or tap the Pals button to choose who answers.
      </p>
      <div className="mt-5 flex w-full flex-col gap-2.5">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} onClick={() => onPick(s)} className="pv-press pv-pop pv-glass pv-hairline rounded-2xl px-4 py-3.5 text-left text-sm font-semibold" style={{ animationDelay: `${i * 50}ms` }}>
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

function Composer({ value, disabled, placeholder, onChange, onSend, onScan, onVoice, selected, selectedAgents, onTogglePal, onAuto }: {
  value: string
  disabled: boolean
  placeholder: string
  onChange: (v: string) => void
  onSend: (text: string, images: string[]) => void
  onScan: () => void
  onVoice: () => void
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

      <div className="pv-glass pv-hairline relative z-20 rounded-[28px] p-2">
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

        {/* Toolbar: left = + & Pals · right = scan, voice, send */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="relative flex items-center gap-1.5">
            <ToolButton onClick={() => setAttachOpen((o) => !o)} active={attachOpen} label="Add photos & files">
              <Plus size={20} strokeWidth={2.4} />
            </ToolButton>

            <button
              type="button"
              onClick={() => setPalOpen((o) => !o)}
              className="pv-press pv-glass-soft flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-2 text-[13px] font-bold"
              style={{ color: 'var(--pv-ink-2)' }}
            >
              <Sparkles size={14} style={{ color: 'var(--pv-accent)' }} />
              {selectedAgents.length === 0 ? 'Auto' : (selectedAgents.length === 1 ? selectedAgents[0].name.replace('PAL', 'Pal') : `${selectedAgents.length} Pals`)}
              <ChevronDown size={13} />
            </button>

            {palOpen && (
              <div className="pv-pop pv-glass pv-hairline absolute bottom-12 left-0 z-30 w-56 rounded-2xl p-2">
                <div className="pv-label px-2 pb-1">Who answers</div>
                <PalRow label="Auto" hint="Best Pals chime in" active={selectedAgents.length === 0} onClick={onAuto} />
                {SPECIALISTS.map((a) => (
                  <PalRow key={a.id} label={a.name.replace('PAL', 'Pal')} Icon={a.Icon} color={a.color} active={selected.has(a.id)} onClick={() => onTogglePal(a.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Scan — the standout control */}
            <button type="button" onClick={onScan} aria-label="Scan something with the camera" className="pv-press-lg relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-white" style={{ backgroundImage: 'var(--pv-grad-ink)', boxShadow: 'var(--pv-shadow-md)' }}>
              <span className="pv-scan-ping absolute inset-0 rounded-full" style={{ border: '1.5px solid var(--pv-accent)' }} />
              <ScanLine size={20} />
            </button>
            <ToolButton onClick={onVoice} label="Talk to your Pals">
              <AudioLines size={20} />
            </ToolButton>
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
