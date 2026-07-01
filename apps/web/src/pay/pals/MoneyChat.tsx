/**
 * MoneyChat — MoneyPal as a live avatar chat (camera off), hosted by Mika.
 * ───────────────────────────────────────────────────────────────────────────
 * Same language as StudyChat: Mika in the background, chat in front, mic =
 * dictation, camera = full live model, results inline. Onboarding is a set of
 * template cards ("Create a job", "Pocket money", "Savings goal", "Kid card").
 * Picking one runs an AGENTIC slot-filling flow — the avatar fills a form by
 * conversation, one small question at a time, drawing the matching component
 * (kid chips, day pills, amount stepper, account cards) and advancing a progress
 * bar per answered slot. A read-back confirm card gates creation (soft-confirm),
 * and each field is editable before create. Creation reuses the existing
 * /chat/execute intents (add_chore / topup / set_goal / issue_card).
 *
 * Tap-first + voice-ready: tapping a component and (later) speaking will emit
 * the same slot-fill, so wiring voice extraction in doesn't redo the UI.
 */
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Wallet, Sparkles, Mic, Camera, Send as SendIcon, Check, ChevronDown, ChevronRight, Minus, Plus, ListChecks, PiggyBank, CreditCard, Target, ArrowRight, ShieldCheck } from 'lucide-react'
import { Companion } from '../../components/Companion'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LiveLoading } from '../components/LiveLoading'
import { api } from '../../lib/api'
import { aud } from '../../lib/format'
import { useAuthStore } from '../../stores/auth'
import { useFamilyKids, useWallet } from '../useMoneyPal'
import { usePalCharacter } from './palCharacters'
import { useCanvas } from '../lib/canvasStore'
import { CardFace } from '../components/CardFace'
import { AttachButton, AttachTray } from '../components/AttachControls'
import { useAttachments, visionImages, chatDocuments, attachmentSummary } from '../lib/attachments'

const LiveSession = lazy(() => import('../screens/LiveSession').then((m) => ({ default: m.LiveSession })))

// Minimal Web Speech API typing (not in lib.dom) for mic dictation.
type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: SpeechResultList }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecCtor = new () => SpeechRec

type FlowKind = 'chore' | 'allowance' | 'goal' | 'card'
type Flow = {
  kind: FlowKind
  step: string
  kidId?: string
  kidName?: string
  // chore
  title?: string
  repeats?: boolean
  days?: string[]
  paid?: boolean
  amount?: number
  payTo?: 'card' | 'savings'
  // goal
  goalName?: string
  target?: number
  // card
  limit?: number
}

type ActionKind = 'chore' | 'allowance' | 'goal' | 'card' | 'pending' | 'showcard'
type Action = { label: string; kind: ActionKind }
type CMsg = { id: string; who: 'mika' | 'you'; text: string; actions?: Action[]; success?: string; images?: string[]; card?: boolean }

type Chore = { id: string; title: string; rewardBrains: number; status: string; assignedTo: string }

let mid = 1
const uid = () => `mc${mid++}`

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CHORE_SUGGESTIONS = ['Empty the dishwasher', 'Make the bed', 'Tidy room', 'Take out the bins', 'Walk the dog', 'Homework']

// "show me my card" style requests → surface the card inline (not the issue flow).
function isCardViewRequest(text: string): boolean {
  return /\bcard\b/i.test(text)
    && /\b(show|see|view|open|my|where|display|pull up|check)\b/i.test(text)
    && !/\b(issue|give|create|new|gift|report|score|credit|add|order|kid|kids|their|his|her)\b/i.test(text)
}

// Fixed slot order per flow → drives the progress bar (answered slot count).
function flowSteps(kind: FlowKind): string[] {
  if (kind === 'chore') return ['kid', 'chore', 'repeats', 'days', 'paid', 'amount', 'payTo', 'confirm']
  if (kind === 'allowance') return ['kid', 'amount', 'confirm']
  if (kind === 'goal') return ['kid', 'goalName', 'target', 'confirm']
  return ['kid', 'limit', 'confirm']
}
// Next step, skipping slots made irrelevant by earlier answers.
function nextStep(f: Flow): string {
  const seq = flowSteps(f.kind)
  let i = seq.indexOf(f.step) + 1
  while (i < seq.length) {
    const s = seq[i]
    if (s === 'days' && !f.repeats) { i++; continue }
    if (s === 'amount' && f.paid === false) { i++; continue }
    break
  }
  return seq[Math.min(i, seq.length - 1)]
}

export function MoneyChat({ onSwitchPal }: { onSwitchPal?: () => void }) {
  const qc = useQueryClient()
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const name = ((account?.persona?.name as string) || '').trim().split(' ')[0] || ''
  const { kids } = useFamilyKids()
  const ch = usePalCharacter('moneypal')

  // The logged-in holder's own card details for the inline card preview.
  const wallet = useWallet()
  const myId = account?.id ?? 'preview'
  const myName = (((account?.persona?.name as string) || 'You').trim()) || 'You'

  // Live chores so MoneyPal can show what's on the go (both roles).
  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<{ chores: Chore[] }>('/chores'), enabled: !!account, staleTime: 10_000 })
  const allChores = choresQ.data?.chores ?? []
  const myChores = (isKid ? allChores.filter((c) => c.assignedTo === account?.id) : allChores)
    .filter((c) => c.status !== 'paid' && c.status !== 'parent_rejected')
  const reviewCount = isKid ? 0 : myChores.filter((c) => ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain'].includes(c.status)).length

  const [messages, setMessages] = useState<CMsg[]>([])
  const [flow, setFlow] = useState<Flow | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [live, setLive] = useState<{ camera: boolean } | null>(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bootRef = useRef(false)
  const att = useAttachments()

  const say = (text: string, actions?: Action[], success?: string) => setMessages((m) => [...m, { id: uid(), who: 'mika', text, actions, success }])
  const me = (text: string, images?: string[]) => setMessages((m) => [...m, { id: uid(), who: 'you', text, images }])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, flow, sending])
  useEffect(() => () => { try { recRef.current?.stop() } catch { /* ignore */ } }, [])

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    if (isKid) {
      say(`Hi${name ? ` ${name}` : ''}. I'm Mika. Ask me about your money, see your card, or check your jobs.`, [
        { label: 'Show my card', kind: 'showcard' },
      ])
    } else {
      say(`Hi${name ? ` ${name}` : ''}. I'm Mika, your family bank. What would you like to set up?`, [
        { label: 'Create a job', kind: 'chore' },
        { label: 'Pocket money', kind: 'allowance' },
        { label: 'Savings goal', kind: 'goal' },
        { label: 'Kid card', kind: 'card' },
        { label: 'My card', kind: 'showcard' },
        { label: 'Pending jobs', kind: 'pending' },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Progress on the avatar ──────────────────────────────────────────────
  const steps = flow ? flowSteps(flow.kind) : []
  const currentStep = flow ? Math.max(1, steps.indexOf(flow.step) + 1) : 0
  const totalSteps = steps.length

  // ── Start / drive a flow ────────────────────────────────────────────────
  function startFlow(kind: FlowKind) {
    if (kids.length === 0) { say('Add a child to your family first, then I can set that up.'); return }
    const labels: Record<FlowKind, string> = { chore: 'a job', allowance: 'pocket money', goal: 'a savings goal', card: 'a kid card' }
    me(`Set up ${labels[kind]}`)
    const f: Flow = { kind, step: 'kid' }
    setFlow(f)
    say(kind === 'card' ? "Who's the card for?" : "Who's this for?")
  }

  function advance(next: Flow) {
    const step = nextStep(next)
    const f = { ...next, step }
    setFlow(f)
    say(promptFor(f))
    if (step === 'confirm') { /* confirm card renders */ }
  }

  function promptFor(f: Flow): string {
    switch (f.step) {
      case 'chore': return "What's the job?"
      case 'repeats': return 'Should this repeat each week?'
      case 'days': return 'Which days?'
      case 'paid': return 'Is this a paid job?'
      case 'amount': return f.kind === 'allowance' ? 'How much pocket money?' : 'How much per job?'
      case 'payTo': return 'Where should the money go?'
      case 'goalName': return "What's the goal?"
      case 'target': return "What's the target amount?"
      case 'limit': return "What's the weekly limit?"
      case 'confirm': return 'Here’s the summary — check it over.'
      default: return ''
    }
  }

  // Slot setters (tap now; the same calls will back voice later).
  const pickKid = (id: string, nm: string) => { me(nm); advance({ ...(flow as Flow), kidId: id, kidName: nm }) }
  const pickChore = (t: string) => { me(t); advance({ ...(flow as Flow), title: t }) }
  const pickRepeats = (v: boolean) => { me(v ? 'Every week' : 'Just once'); advance({ ...(flow as Flow), repeats: v, days: v ? (flow?.days ?? []) : undefined }) }
  const pickDays = (d: string[]) => setFlow((f) => (f ? { ...f, days: d } : f))
  const confirmDays = () => { const f = flow as Flow; me((f.days && f.days.length) ? f.days.join(', ') : 'Any day'); advance(f) }
  const pickPaid = (v: boolean) => { me(v ? 'Paid' : 'Unpaid'); advance({ ...(flow as Flow), paid: v }) }
  const pickAmount = (n: number) => { me(aud(n)); advance({ ...(flow as Flow), amount: n }) }
  const pickPayTo = (v: 'card' | 'savings') => { me(v === 'card' ? 'Card' : 'Savings'); advance({ ...(flow as Flow), payTo: v }) }
  const pickGoalName = (t: string) => { me(t); advance({ ...(flow as Flow), goalName: t }) }
  const pickTarget = (n: number) => { me(aud(n)); advance({ ...(flow as Flow), target: n }) }
  const pickLimit = (n: number) => { me(aud(n)); advance({ ...(flow as Flow), limit: n }) }

  const editSlot = (step: string) => { setFlow((f) => (f ? { ...f, step } : f)); say(promptFor({ ...(flow as Flow), step })) }

  async function createFromFlow() {
    const f = flow
    if (!f || !f.kidId) return
    setFlow(null)
    setSending(true)
    try {
      if (f.kind === 'chore') {
        const title = f.repeats && f.days?.length ? `${f.title} · ${f.days.join(', ')}` : (f.title ?? 'Job')
        const intent = { kind: 'add_chore', kidAccountId: f.kidId, kidName: f.kidName, title, rewardBrains: f.paid === false ? undefined : (f.amount ?? 1) }
        await api('/chat/execute', { method: 'POST', body: JSON.stringify({ intent }) })
        say('', undefined, `Job created for ${f.kidName} — ${f.title}${f.paid === false ? '' : ` · ${aud(f.amount ?? 1)}`}.`)
      } else if (f.kind === 'allowance') {
        const intent = { kind: 'topup', kidAccountId: f.kidId, kidName: f.kidName, brainsDelta: f.amount ?? 1, note: 'Pocket money' }
        await api('/chat/execute', { method: 'POST', body: JSON.stringify({ intent }) })
        say('', undefined, `${aud(f.amount ?? 1)} sent to ${f.kidName}.`)
      } else if (f.kind === 'goal') {
        const intent = { kind: 'set_goal', kidAccountId: f.kidId, kidName: f.kidName, goalName: f.goalName ?? 'Goal', targetBrains: f.target ?? 10 }
        await api('/chat/execute', { method: 'POST', body: JSON.stringify({ intent }) })
        say('', undefined, `Goal "${f.goalName}" set for ${f.kidName} — ${aud(f.target ?? 10)}.`)
      } else {
        const intent = { kind: 'issue_card', kidAccountId: f.kidId, kidName: f.kidName, dailyLimit: f.limit ?? 20, blocks: ['gambling', 'in_app'] }
        await api('/chat/execute', { method: 'POST', body: JSON.stringify({ intent }) })
        say('', undefined, `Card issued for ${f.kidName} — ${aud(f.limit ?? 20)}/week.`)
      }
      qc.invalidateQueries({ queryKey: ['pay', 'family'] })
      say('Anything else?', parentActions())
    } catch {
      say('That didn’t go through — want to try again?', parentActions())
    } finally {
      setSending(false)
    }
  }

  function parentActions(): Action[] {
    return [
      { label: 'Create a job', kind: 'chore' },
      { label: 'Pocket money', kind: 'allowance' },
      { label: 'Savings goal', kind: 'goal' },
      { label: 'Kid card', kind: 'card' },
      { label: 'Pending jobs', kind: 'pending' },
    ]
  }

  async function showJobs() {
    me(isKid ? 'My jobs' : 'Pending jobs')
    setSending(true)
    try {
      const res = await api<{ chores: Chore[] }>('/chores')
      qc.setQueryData(['chores'], res)
      let list = res.chores ?? []
      if (isKid) list = list.filter((c) => c.assignedTo === account?.id)
      const active = list.filter((c) => c.status !== 'paid' && c.status !== 'parent_rejected')
      if (active.length === 0) {
        say(isKid ? 'No jobs right now — nice, you’re all caught up! 🎉' : 'No jobs on the go right now. Want to create one?', isKid ? undefined : [{ label: 'Create a job', kind: 'chore' }])
        return
      }
      const kidName = (id: string) => kids.find((k) => k.id === id)?.name ?? 'Kid'
      const lines = active.slice(0, 8).map((c) => isKid
        ? `• ${c.title} — ${aud(c.rewardBrains)} · ${c.status.replace(/_/g, ' ')}`
        : `• ${c.title} — ${kidName(c.assignedTo)} · ${aud(c.rewardBrains)} · ${c.status.replace(/_/g, ' ')}`,
      ).join('\n')
      say(`${active.length} job${active.length > 1 ? 's' : ''} on the go:\n${lines}`, isKid ? undefined : [{ label: 'Create a job', kind: 'chore' }])
    } catch {
      say('I couldn’t load the jobs just now — try again?')
    } finally {
      setSending(false)
    }
  }

  function runAction(a: Action) {
    if (a.kind === 'showcard') { me('Show my card'); showMyCard(); return }
    if (a.kind === 'pending') { void showJobs(); return }
    startFlow(a.kind)
  }

  // Surface the holder's card directly in the conversation (no dead-end button).
  function showMyCard() {
    setMessages((m) => [...m, { id: uid(), who: 'mika', text: 'Here’s your card 👇', card: true }])
  }

  // ── Mic dictation ─────────────────────────────────────────────────────────
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

  // ── Free chat → the money council ───────────────────────────────────────
  async function send() {
    const text = input.trim()
    const imgs = visionImages(att.items)
    const docs = chatDocuments(att.items)
    if ((!text && imgs.length === 0 && docs.length === 0) || sending || flow || att.busy) return
    // "Show me my card" → bring the card up right here, no round-trip.
    if (text && imgs.length === 0 && docs.length === 0 && isCardViewRequest(text)) {
      setInput('')
      me(text)
      showMyCard()
      return
    }
    const summary = attachmentSummary(att.items)
    const shown = text || (summary ? `Sent ${summary}` : 'Take a look at this')
    setInput('')
    me(shown, imgs.length ? imgs : undefined)
    att.clear()
    setSending(true)
    try {
      const res = await api<{ reply?: string; pals?: { palId: string; line: string }[] }>('/chat', { method: 'POST', body: JSON.stringify({ message: text || 'Take a look at the attached file.', pals: ['moneypal'], images: imgs, documents: docs }) })
      const parts = [res.reply, ...(res.pals?.map((p) => p.line) ?? [])].map((s) => (s ?? '').trim()).filter(Boolean)
      say(parts.join('\n\n') || "I couldn't think of an answer — try rephrasing?")
    } catch {
      say("I couldn't think just now — try again, or tap one of the options.")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {live && (
        <ErrorBoundary resetKey={live.camera ? 'cam' : 'voice'} label="the live session">
          <Suspense fallback={<LiveLoading />}>
            <LiveSession withCamera={live.camera} avatar={ch.avatar} speaker={ch.characterName} onClose={() => setLive(null)} />
          </Suspense>
        </ErrorBoundary>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="pv-mesh" aria-hidden />

        {/* Mika — in the BACKGROUND. */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-start justify-center pt-10" aria-hidden>
          <div className="absolute left-1/2 top-[34%] h-2/3 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]" style={{ background: ch.gradient, opacity: 0.24 }} />
          {!live && <Companion avatar={ch.avatar} mood="happy" className="h-full w-full max-w-sm" />}
        </div>
        <div className="pointer-events-none absolute inset-0 z-0" style={{ background: 'linear-gradient(180deg, transparent 0%, transparent 34%, color-mix(in srgb, var(--pv-bg) 62%, transparent) 60%, var(--pv-bg) 88%)' }} aria-hidden />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Identity / switcher */}
          <div className="flex flex-none items-center gap-2 px-4 pb-1 pt-2">
            <button type="button" onClick={onSwitchPal} disabled={!onSwitchPal} aria-label={onSwitchPal ? 'Switch Pal' : undefined} className="pv-press pv-glass flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-left disabled:cursor-default">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent }}>
                <Wallet size={16} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1"><span className="pv-title pv-tight truncate text-sm leading-tight">{ch.palName}</span>{onSwitchPal && <ChevronDown size={14} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />}</span>
              </span>
            </button>
          </div>

          {/* Live jobs banner — MoneyPal always shows what's on the go. */}
          {!flow && myChores.length > 0 && (
            <div className="flex-none px-4 pt-1.5">
              <button onClick={() => void showJobs()} className="pv-press pv-glass pv-hairline mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl px-3.5 py-2.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><ListChecks size={16} /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>
                    {isKid
                      ? `${myChores.length} job${myChores.length !== 1 ? 's' : ''} to do`
                      : reviewCount
                        ? `${reviewCount} job${reviewCount !== 1 ? 's' : ''} to review`
                        : `${myChores.length} job${myChores.length !== 1 ? 's' : ''} on the go`}
                  </span>
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{isKid ? 'Finish them to earn Brains' : 'Tap to see every job and its status'}</span>
                </span>
                <span className="pv-text-accent flex-none text-sm font-extrabold">View →</span>
              </button>
            </div>
          )}

          {/* Flow progress — advances per answered slot. */}
          {flow && (
            <div className="flex-none px-4 pt-1">
              <div className="mx-auto w-full max-w-xl">
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--pv-ink-3)' }}>
                  <span>Setup</span><span>Step {currentStep} of {totalSteps}</span>
                </div>
                <div className="pv-progress" role="progressbar" aria-valuenow={currentStep} aria-valuemin={0} aria-valuemax={totalSteps}>
                  <span style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Conversation */}
          <div ref={scrollRef} className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-end gap-3">
              {messages.map((m) => <Bubble key={m.id} m={m} onAction={runAction} self={{ accountId: myId, name: myName, balance: wallet.balance }} onManageCard={() => useCanvas.getState().open('card')} />)}
              {sending && (
                <div className="flex w-fit items-center gap-1.5 rounded-2xl px-3.5 py-2.5 pv-glass">
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '0ms' }} />
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '160ms' }} />
                  <span className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: '320ms' }} />
                </div>
              )}

              {/* Slot components */}
              {flow && !sending && (
                <div className="pv-rise pt-1">
                  <SlotView
                    flow={flow}
                    kids={kids.map((k) => ({ id: k.id, name: k.name, initials: k.initials, avatar: k.avatar }))}
                    onKid={pickKid}
                    onChore={pickChore}
                    onRepeats={pickRepeats}
                    onDays={pickDays}
                    onConfirmDays={confirmDays}
                    onPaid={pickPaid}
                    onAmount={pickAmount}
                    onPayTo={pickPayTo}
                    onGoalName={pickGoalName}
                    onTarget={pickTarget}
                    onLimit={pickLimit}
                    onEdit={editSlot}
                    onCreate={createFromFlow}
                    onCancel={() => { setFlow(null); say('No worries — cancelled.', parentActions()) }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Composer — free chat + mic (dictation) + camera (live). Hidden during a flow. */}
          {!flow && (
            <div className="mx-auto w-full max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
              <AttachTray items={att.items} onRemove={att.remove} />
              <form onSubmit={(e) => { e.preventDefault(); void send() }} className="pv-composer pv-glass pv-hairline flex items-center gap-2 rounded-full p-1.5 pl-1.5">
                <AttachButton onFiles={att.add} disabled={sending} />
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? 'Listening…' : 'Message Mika…'} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: 'var(--pv-ink)' }} />
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
                    <button type="button" onClick={() => setLive({ camera: true })} aria-label="Live camera with Mika" className="pv-press-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
                      <Camera size={18} />
                    </button>
                  </>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SLOT VIEW — renders the right component for the current step.
// ═══════════════════════════════════════════════════════════════════════

type KidLite = { id: string; name: string; initials: string; avatar?: string }

function SlotView({ flow, kids, onKid, onChore, onRepeats, onDays, onConfirmDays, onPaid, onAmount, onPayTo, onGoalName, onTarget, onLimit, onEdit, onCreate, onCancel }: {
  flow: Flow
  kids: KidLite[]
  onKid: (id: string, name: string) => void
  onChore: (t: string) => void
  onRepeats: (v: boolean) => void
  onDays: (d: string[]) => void
  onConfirmDays: () => void
  onPaid: (v: boolean) => void
  onAmount: (n: number) => void
  onPayTo: (v: 'card' | 'savings') => void
  onGoalName: (t: string) => void
  onTarget: (n: number) => void
  onLimit: (n: number) => void
  onEdit: (step: string) => void
  onCreate: () => void
  onCancel: () => void
}) {
  switch (flow.step) {
    case 'kid':
      return (
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <button key={k.id} onClick={() => onKid(k.id, k.name)} className="pv-press pv-glass flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ background: 'var(--pv-surface-2)' }}>{k.avatar ?? k.initials}</span>
              {k.name}
            </button>
          ))}
        </div>
      )
    case 'chore':
      return <ChipInput suggestions={CHORE_SUGGESTIONS} placeholder="Type a job…" onPick={onChore} />
    case 'goalName':
      return <ChipInput suggestions={['New bike', 'Games', 'Holiday', 'Headphones']} placeholder="Name the goal…" onPick={onGoalName} />
    case 'repeats':
      return <YesNo yes="Every week" no="Just once" onYes={() => onRepeats(true)} onNo={() => onRepeats(false)} />
    case 'paid':
      return <YesNo yes="Paid" no="Unpaid" onYes={() => onPaid(true)} onNo={() => onPaid(false)} />
    case 'days':
      return <DayPills days={flow.days ?? []} onChange={onDays} onConfirm={onConfirmDays} />
    case 'amount':
      return <AmountStepper quick={[1, 2, 5]} value={flow.amount ?? 1} onPick={onAmount} />
    case 'target':
      return <AmountStepper quick={[10, 25, 50]} value={flow.target ?? 25} step={5} onPick={onTarget} />
    case 'limit':
      return <AmountStepper quick={[10, 20, 50]} value={flow.limit ?? 20} step={5} onPick={onLimit} />
    case 'payTo':
      return (
        <div className="flex gap-2.5">
          <AccountCard icon={<CreditCard size={18} />} label="Card" hint="Spend now" onClick={() => onPayTo('card')} />
          <AccountCard icon={<PiggyBank size={18} />} label="Savings" hint="Set aside" onClick={() => onPayTo('savings')} />
        </div>
      )
    case 'confirm':
      return <ConfirmCard flow={flow} onEdit={onEdit} onCreate={onCreate} onCancel={onCancel} />
    default:
      return null
  }
}

function ChipInput({ suggestions, placeholder, onPick }: { suggestions: string[]; placeholder: string; onPick: (t: string) => void }) {
  const [text, setText] = useState('')
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="pv-press pv-glass rounded-full px-3.5 py-2 text-sm font-bold">{s}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onPick(text.trim()) }} className="pv-glass pv-hairline flex items-center gap-2 rounded-full p-1.5 pl-4">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: 'var(--pv-ink)' }} />
        <button type="submit" disabled={!text.trim()} aria-label="Next" className="pv-press-lg flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  )
}

function YesNo({ yes, no, onYes, onNo }: { yes: string; no: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="flex gap-2.5">
      <button onClick={onYes} className="pv-press-lg pv-sheen flex-1 rounded-2xl py-3.5 text-sm font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>{yes}</button>
      <button onClick={onNo} className="pv-press flex-1 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>{no}</button>
    </div>
  )
}

function DayPills({ days, onChange, onConfirm }: { days: string[]; onChange: (d: string[]) => void; onConfirm: () => void }) {
  const toggle = (d: string) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {DAYS.map((d) => {
          const on = days.includes(d)
          return (
            <button key={d} onClick={() => toggle(d)} className="pv-press h-10 w-10 rounded-full text-xs font-bold" style={on ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>{d}</button>
          )
        })}
      </div>
      <button onClick={onConfirm} className="pv-press-lg pv-sheen w-full rounded-full py-3 text-sm font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
        {days.length ? `${days.length} day${days.length > 1 ? 's' : ''} · Next` : 'Any day · Next'}
      </button>
    </div>
  )
}

function AmountStepper({ quick, value, step = 1, onPick }: { quick: number[]; value: number; step?: number; onPick: (n: number) => void }) {
  const [v, setV] = useState(value)
  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-4">
        <button onClick={() => setV((x) => Math.max(step, x - step))} aria-label="Less" className="pv-press flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><Minus size={18} /></button>
        <span className="pv-amount min-w-[96px] text-center text-3xl">{aud(v)}</span>
        <button onClick={() => setV((x) => x + step)} aria-label="More" className="pv-press flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><Plus size={18} /></button>
      </div>
      <div className="mb-3 flex justify-center gap-2">
        {quick.map((q) => (
          <button key={q} onClick={() => setV(q)} className="pv-press rounded-full px-3.5 py-1.5 text-sm font-bold" style={v === q ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}>{aud(q)}</button>
        ))}
      </div>
      <button onClick={() => onPick(v)} className="pv-press-lg pv-sheen w-full rounded-full py-3 text-sm font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>Next</button>
    </div>
  )
}

function AccountCard({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pv-press-lg pv-glass pv-hairline flex flex-1 flex-col items-start gap-2 rounded-2xl p-4 text-left">
      <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}>{icon}</span>
      <span><span className="pv-title block text-sm">{label}</span><span className="text-xs" style={{ color: 'var(--pv-ink-3)' }}>{hint}</span></span>
    </button>
  )
}

function ConfirmCard({ flow, onEdit, onCreate, onCancel }: { flow: Flow; onEdit: (step: string) => void; onCreate: () => void; onCancel: () => void }) {
  const rows: { step: string; label: string; value: string }[] = []
  rows.push({ step: 'kid', label: 'For', value: flow.kidName ?? '—' })
  if (flow.kind === 'chore') {
    rows.push({ step: 'chore', label: 'Job', value: flow.title ?? '—' })
    rows.push({ step: 'repeats', label: 'Repeats', value: flow.repeats ? 'Every week' : 'Just once' })
    if (flow.repeats) rows.push({ step: 'days', label: 'Days', value: flow.days?.length ? flow.days.join(', ') : 'Any day' })
    rows.push({ step: 'paid', label: 'Paid', value: flow.paid === false ? 'Unpaid' : 'Paid' })
    if (flow.paid !== false) rows.push({ step: 'amount', label: 'Amount', value: aud(flow.amount ?? 1) })
    rows.push({ step: 'payTo', label: 'Pay to', value: flow.payTo === 'savings' ? 'Savings' : 'Card' })
  } else if (flow.kind === 'allowance') {
    rows.push({ step: 'amount', label: 'Amount', value: aud(flow.amount ?? 1) })
  } else if (flow.kind === 'goal') {
    rows.push({ step: 'goalName', label: 'Goal', value: flow.goalName ?? '—' })
    rows.push({ step: 'target', label: 'Target', value: aud(flow.target ?? 10) })
  } else {
    rows.push({ step: 'limit', label: 'Weekly limit', value: aud(flow.limit ?? 20) })
    rows.push({ step: 'payTo', label: 'Blocks', value: 'Gambling · in-app' })
  }
  const cta = flow.kind === 'chore' ? 'Create job' : flow.kind === 'allowance' ? 'Send money' : flow.kind === 'goal' ? 'Set goal' : 'Issue card'
  return (
    <div className="pv-pop pv-glass pv-hairline rounded-2xl p-4">
      <div className="pv-label pv-text-accent mb-1">Confirm</div>
      <div className="flex flex-col divide-y" style={{ ['--tw-divide-opacity' as string]: '1' }}>
        {rows.map((r) => (
          <button key={r.step} onClick={() => onEdit(r.step)} className="pv-press flex items-center justify-between gap-3 py-2.5 text-left" style={{ borderColor: 'var(--pv-line)' }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--pv-ink-3)' }}>{r.label}</span>
            <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>{r.value}<ChevronRight size={14} style={{ color: 'var(--pv-ink-3)' }} /></span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--pv-ink-3)' }}>Tap any row to change it.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="pv-press pv-glass-soft flex-1 rounded-full py-2.5 text-sm font-bold">Cancel</button>
        <button onClick={onCreate} className="pv-press-lg pv-sheen flex-1 rounded-full py-2.5 text-sm font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>{cta}</button>
      </div>
    </div>
  )
}

function Bubble({ m, onAction, self, onManageCard }: { m: CMsg; onAction: (a: Action) => void; self: { accountId: string; name: string; balance: number }; onManageCard: () => void }) {
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
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' }}><Wallet size={14} strokeWidth={2.4} /></span>
      <div className="min-w-0 max-w-[86%]">
        {m.success ? (
          <div className="pv-pop pv-glass pv-hairline flex items-center gap-3 rounded-2xl p-3.5">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}><Check size={22} strokeWidth={3} /></span>
            <span className="text-sm font-bold" style={{ color: 'var(--pv-ink)' }}>{m.success}</span>
          </div>
        ) : m.text ? (
          <div className="pv-glass whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed" style={{ borderBottomLeftRadius: 6 }}>{m.text}</div>
        ) : null}

        {/* Inline card — the real card comes up right here. */}
        {m.card && (
          <div className="pv-pop mt-2 w-full max-w-[300px]">
            <CardFace accountId={self.accountId} name={self.name} balance={self.balance} />
            <div className="mt-2.5 flex items-start gap-2 rounded-2xl px-3 py-2.5" style={{ background: 'var(--pv-surface-2)' }}>
              <ShieldCheck size={15} className="mt-0.5 flex-none" style={{ color: 'var(--pv-pos)' }} />
              <p className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--pv-ink-2)' }}>
                I never see your full card number, CVV or PIN — they stay encrypted with your bank. You’re fully privacy-protected.
              </p>
            </div>
            <button onClick={onManageCard} className="pv-press mt-2 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold" style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
              <CreditCard size={15} /> Manage &amp; customize
            </button>
          </div>
        )}

        {m.actions && m.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.actions.map((a) => {
              const Icon = a.kind === 'chore' ? ListChecks : a.kind === 'allowance' ? Wallet : a.kind === 'goal' ? Target : a.kind === 'card' || a.kind === 'showcard' ? CreditCard : Sparkles
              const primary = a.kind === 'chore'
              return (
                <button key={a.kind} onClick={() => onAction(a)} className={`pv-press ${primary ? 'pv-press-lg pv-sheen' : ''} inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold`} style={primary ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}>
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


