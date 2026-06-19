import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { aud } from '../lib/format'
import { LiveSession } from './LiveSession'

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string }
type Pal = { palId: string; line: string }
type Intent = { kind: 'add_chore' | 'topup' | 'set_goal' } & Record<string, unknown>

type SendResponse = {
  reply: string
  pals?: Pal[]
  intent?: Intent
  requiresConfirmation?: boolean
}

type ExecuteResponse = { ok: boolean; confirmationMessage?: string }

const PAL_LABELS: Record<string, string> = {
  moneypal: '💰 MoneyPal',
  healthpal: '🥦 HealthPal',
  studypal: '📚 StudyPal',
}

let tmpId = 1
const uid = () => `tmp${tmpId++}`

function describeIntent(intent: Intent): string {
  const kidName = (intent.kidName as string) || 'your kid'
  switch (intent.kind) {
    case 'add_chore':
      return `Add chore "${intent.title as string}" for ${kidName} — ${aud((intent.rewardBrains as number) ?? 50)}`
    case 'topup':
      return `Send ${aud((intent.brainsDelta as number) ?? 0)} to ${kidName}`
    case 'set_goal':
      return `Set goal "${intent.goalName as string}" for ${kidName} — ${aud((intent.targetBrains as number) ?? 500)}`
    default:
      return 'Confirm this action?'
  }
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pals, setPals] = useState<Pal[]>([])
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initial history load.
  useEffect(() => {
    let active = true
    api<{ messages: ChatMsg[] }>('/chat/history')
      .then((res) => {
        if (active) setMessages(res.messages ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingHistory(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pals, pendingIntent])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setPals([])
    setPendingIntent(null)
    setMessages((m) => [...m, { id: uid(), role: 'user', content: text }])
    setSending(true)
    try {
      const res = await api<SendResponse>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      })
      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: res.reply }])
      setPals(res.pals ?? [])
      if (res.requiresConfirmation && res.intent) setPendingIntent(res.intent)
    } catch {
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', content: "I'm having trouble thinking right now. Try again?" },
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
        { id: uid(), role: 'assistant', content: res.confirmationMessage ?? 'Done ✅' },
      ])
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', content: e instanceof Error ? `Couldn't do that: ${e.message}` : "Couldn't do that." },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {live && <LiveSession withCamera={live.camera} onClose={() => setLive(null)} />}
      <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-surface2 px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-lg">🧠</div>
        <div>
          <div className="font-bold leading-tight">PAL</div>
          <div className="text-xs text-accent">online · just now</div>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!loadingHistory && messages.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted">
            Say hi to PAL 👋
            <br />
            Try: "Add a dishes chore for $50" or "How much has my kid saved?"
          </div>
        )}

        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}

        {pals.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-2">
            {pals.map((p, i) => (
              <div
                key={`${p.palId}-${i}`}
                className="rounded-2xl bg-surface2 px-3 py-2 text-xs text-ink"
              >
                <span className="font-bold text-accent">{PAL_LABELS[p.palId] ?? p.palId}</span>{' '}
                {p.line}
              </div>
            ))}
          </div>
        )}

        {pendingIntent && (
          <div className="rounded-2xl border border-accent/40 bg-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">PAL wants to</div>
            <div className="mt-1 font-semibold text-ink">{describeIntent(pendingIntent)}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setPendingIntent(null)}
                className="flex-1 rounded-full bg-surface2 py-2.5 text-sm font-bold text-ink active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={confirmIntent}
                className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-black active:scale-[0.98]"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {sending && <Bubble role="assistant" content="…" />}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-center gap-2 border-t border-surface2 p-3"
      >
        <button
          type="button"
          onClick={() => setLive({ camera: true })}
          aria-label="Point the camera and ask PAL"
          title="Camera"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface2 text-accent active:scale-95"
        >
          <CameraIcon />
        </button>
        <button
          type="button"
          onClick={() => setLive({ camera: false })}
          aria-label="Talk to PAL"
          title="Voice"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface2 text-accent active:scale-95"
        >
          <WaveIcon />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message PAL…"
          className="h-12 flex-1 rounded-full bg-surface px-4 text-ink outline-none ring-1 ring-transparent focus:ring-accent"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl font-black text-black disabled:opacity-40"
        >
          ↑
        </button>
      </form>
      </div>
    </>
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

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-accent text-black' : 'bg-surface2 text-ink'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
