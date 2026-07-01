/**
 * BrainChat — BrainPal as a live avatar chat (camera off), hosted by the AI
 * companion. Same language as MoneyChat/StudyChat: avatar in the background,
 * chat in front, mic = dictation, camera = full live model.
 *
 * BrainPal is the smart front door: it answers anything (money AND study, using
 * the real family snapshot on the backend) and can hand off to the right Pal —
 * "Set up a job" jumps to MoneyPal, "Start studying" jumps to StudyPal.
 */
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Sparkles, Mic, Camera, Send as SendIcon, ChevronDown, Wallet, GraduationCap, MessageSquareText } from 'lucide-react'
import { Companion } from '../../components/Companion'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LiveLoading } from '../components/LiveLoading'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { registerAiHandler } from './aiBus'
import { usePalCharacter } from './palCharacters'
import { usePalSelection } from './usePalSelection'
import { AttachButton, AttachTray } from '../components/AttachControls'
import { useAttachments, visionImages, chatDocuments, attachmentSummary } from '../lib/attachments'

const LiveSession = lazy(() => import('../screens/LiveSession').then((m) => ({ default: m.LiveSession })))

type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: SpeechResultList }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecCtor = new () => SpeechRec

type ActionKind = 'ask' | 'money' | 'study'
type Action = { label: string; kind: ActionKind; text?: string }
type CMsg = { id: string; who: 'pal' | 'you'; text: string; actions?: Action[]; images?: string[] }

let mid = 1
const uid = () => `bc${mid++}`

export function BrainChat({ onSwitchPal }: { onSwitchPal?: () => void }) {
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const name = ((account?.persona?.name as string) || '').trim().split(' ')[0] || ''
  const ch = usePalCharacter('ai')
  const setPal = usePalSelection((s) => s.setPal)

  const [messages, setMessages] = useState<CMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bootRef = useRef(false)
  const att = useAttachments()

  const say = (text: string, actions?: Action[]) => setMessages((m) => [...m, { id: uid(), who: 'pal', text, actions }])
  const me = (text: string, images?: string[]) => setMessages((m) => [...m, { id: uid(), who: 'you', text, images }])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending])
  useEffect(() => () => { try { recRef.current?.stop() } catch { /* ignore */ } }, [])

  function greet() {
    setMessages([])
    const starters: Action[] = isKid
      ? [
        { label: 'What can I afford?', kind: 'ask', text: "What's my balance and what can I afford?" },
        { label: 'What should I study?', kind: 'study' },
        { label: 'Talk to MoneyPal', kind: 'money' },
      ]
      : [
        { label: 'How are the kids doing?', kind: 'ask', text: 'How are the kids doing — money and study?' },
        { label: 'Set up a job', kind: 'money' },
        { label: 'Start a study session', kind: 'study' },
      ]
    say(`Hi${name ? ` ${name}` : ''}. I'm ${ch.characterName}. Ask me anything about money or study — or pick a quick start.`, starters)
  }

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    greet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Let the app-shell drawer / history drive BrainChat.
  useEffect(() => registerAiHandler((cmd) => {
    if (cmd.type === 'new-chat') greet()
    else if (cmd.type === 'live') setLive({ camera: cmd.camera })
    else if (cmd.type === 'ask') void send(cmd.text)
  }), [])

  function runAction(a: Action) {
    if (a.kind === 'money') { me('Take me to MoneyPal'); setPal('moneypal'); return }
    if (a.kind === 'study') { me('Take me to StudyPal'); setPal('studypal'); return }
    if (a.text) void send(a.text)
  }

  function toggleDictation() {
    if (listening) { try { recRef.current?.stop() } catch { /* ignore */ } return }
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) { setLive({ camera: false }); return }
    const rec = new Ctor()
    rec.lang = 'en-AU'; rec.interimResults = true; rec.continuous = false
    rec.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t) }
    rec.onend = () => { setListening(false); recRef.current = null }
    rec.onerror = () => { setListening(false); recRef.current = null }
    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false); recRef.current = null }
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim()
    const imgs = visionImages(att.items)
    const docs = chatDocuments(att.items)
    if ((!text && imgs.length === 0 && docs.length === 0) || sending || att.busy) return
    const summary = attachmentSummary(att.items)
    const shown = text || (summary ? `Sent ${summary}` : 'Take a look at this')
    setInput('')
    me(shown, imgs.length ? imgs : undefined)
    att.clear()
    setSending(true)
    try {
      const res = await api<{ reply?: string; pals?: { palId: string; line: string }[] }>('/chat', { method: 'POST', body: JSON.stringify({ message: text || 'Take a look at the attached file.', images: imgs, documents: docs }) })
      const parts = [res.reply, ...(res.pals?.map((p) => p.line) ?? [])].map((s) => (s ?? '').trim()).filter(Boolean)
      say(parts.join('\n\n') || "I couldn't think of an answer — try rephrasing?")
    } catch {
      say("I couldn't think just now — try again in a moment.")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {live && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
          <LiveSession withCamera={live.camera} avatar={ch.avatar} speaker={ch.characterName} onClose={() => setLive(null)} />
        </Suspense>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="pv-mesh" aria-hidden />

        {/* Companion — in the BACKGROUND. */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-start justify-center pt-10" aria-hidden>
          <div className="absolute left-1/2 top-[34%] h-2/3 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]" style={{ background: ch.gradient, opacity: 0.24 }} />
          <Companion avatar={ch.avatar} mood="happy" className="h-full w-full max-w-sm" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0" style={{ background: 'linear-gradient(180deg, transparent 0%, transparent 34%, color-mix(in srgb, var(--pv-bg) 62%, transparent) 60%, var(--pv-bg) 88%)' }} aria-hidden />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Identity / switcher */}
          <div className="flex flex-none items-center gap-2 px-4 pb-1 pt-2">
            <button type="button" onClick={onSwitchPal} disabled={!onSwitchPal} aria-label={onSwitchPal ? 'Switch Pal' : undefined} className="pv-press pv-glass flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-left disabled:cursor-default">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent }}>
                <Sparkles size={16} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1"><span className="pv-title pv-tight truncate text-sm leading-tight">{ch.palName}</span>{onSwitchPal && <ChevronDown size={14} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}</span>
              </span>
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-end gap-3">
              {messages.map((m) => <Bubble key={m.id} m={m} onAction={runAction} />)}
              {sending && (
                <div className="flex w-fit items-center gap-1.5 rounded-2xl px-3.5 py-2.5 pv-glass">
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="mx-auto w-full max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
            <AttachTray items={att.items} onRemove={att.remove} />
            <form onSubmit={(e) => { e.preventDefault(); void send() }} className="pv-composer pv-glass pv-hairline flex items-center gap-2 rounded-full p-1.5 pl-1.5">
              <AttachButton onFiles={att.add} disabled={sending} />
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? 'Listening…' : `Ask ${ch.characterName}…`} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: 'var(--pv-ink)' }} />
              {listening ? (
                <button type="button" onClick={toggleDictation} aria-label="Stop dictation" className="pv-press-lg pv-live-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg)', color: '#fff', boxShadow: 'var(--pv-shadow-md)' }}>
                  <Mic size={18} />
                </button>
              ) : (input.trim() || att.hasReady) ? (
                <button type="submit" disabled={sending || att.busy} aria-label="Send" className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                  <SendIcon size={17} />
                </button>
              ) : (
                <>
                  <button type="button" onClick={toggleDictation} aria-label="Dictate — speak to type" className="pv-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
                    <Mic size={18} />
                  </button>
                  <button type="button" onClick={() => setLive({ camera: true })} aria-label={`Live camera with ${ch.characterName}`} className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                    <Camera size={18} />
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

function Bubble({ m, onAction }: { m: CMsg; onAction: (a: Action) => void }) {
  if (m.who === 'you') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {m.images && m.images.length > 0 && (
          <div className="flex max-w-[82%] flex-wrap justify-end gap-1.5">
            {m.images.map((src, i) => <img key={i} src={src} alt="" className="h-24 w-24 rounded-2xl object-cover" style={{ boxShadow: 'var(--pv-shadow-sm)' }} />)}
          </div>
        )}
        {m.text && <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 }}>{m.text}</div>}
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><Sparkles size={14} strokeWidth={2.4} /></span>
      <div className="min-w-0 max-w-[86%]">
        {m.text && (
          <div className="pv-glass whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed" style={{ borderBottomLeftRadius: 6 }}>{m.text}</div>
        )}
        {m.actions && m.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.actions.map((a, i) => {
              const Icon = a.kind === 'money' ? Wallet : a.kind === 'study' ? GraduationCap : MessageSquareText
              const primary = a.kind !== 'ask'
              return (
                <button key={`${a.kind}-${i}`} onClick={() => onAction(a)} className={`pv-press ${primary ? 'pv-press-lg pv-sheen' : ''} inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold`} style={primary ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
                  <Icon size={15} /> {a.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
