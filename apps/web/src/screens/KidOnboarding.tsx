import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Gamepad2, Trophy, Palette, Music, BookOpen, Cat, FlaskConical,
  Gift, Smartphone, Shirt, Ticket, PiggyBank, Sparkles,
  Coins, Wallet, Scale, type LucideIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
import { VoiceOnboarding } from '../components/VoiceOnboarding'
import { PressButton, GradientButton } from '../components/ui'

/** Kid onboarding — builds a kid persona used to personalise every agent. */

const AGES = ['8–9', '10–11', '12–13', '14+'] as const

const INTERESTS: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: 'gaming', Icon: Gamepad2, label: 'Gaming' },
  { id: 'sports', Icon: Trophy, label: 'Sports' },
  { id: 'art', Icon: Palette, label: 'Art' },
  { id: 'music', Icon: Music, label: 'Music' },
  { id: 'reading', Icon: BookOpen, label: 'Reading' },
  { id: 'animals', Icon: Cat, label: 'Animals' },
  { id: 'science', Icon: FlaskConical, label: 'Science' },
]

const GOALS: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: 'game', Icon: Gamepad2, label: 'A video game' },
  { id: 'gadget', Icon: Smartphone, label: 'A gadget' },
  { id: 'toy', Icon: Gift, label: 'A toy / Lego' },
  { id: 'clothes', Icon: Shirt, label: 'Clothes / shoes' },
  { id: 'experience', Icon: Ticket, label: 'An outing / experience' },
  { id: 'saving', Icon: PiggyBank, label: 'Just saving up!' },
]

const SPEND: { id: string; Icon: LucideIcon; label: string; sub: string }[] = [
  { id: 'saver', Icon: PiggyBank, label: 'A saver', sub: 'I like watching it grow' },
  { id: 'mixed', Icon: Scale, label: 'A bit of both', sub: 'Depends on the day' },
  { id: 'impulse', Icon: Coins, label: 'A spender', sub: 'I love treating myself' },
]

const TOTAL = 5

export function KidOnboarding() {
  const navigate = useNavigate()
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)

  const [step, setStep] = useState(0)
  const [name, setName] = useState((account?.persona?.name as string) || '')
  const [age, setAge] = useState<string | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [goal, setGoal] = useState<string | null>(null)
  const [spend, setSpend] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flow, setFlow] = useState<'choose' | 'voice' | 'wizard'>('voice')

  if (flow === 'voice') {
    return <VoiceOnboarding role="kid" onDone={() => navigate('/', { replace: true })} onTypeInstead={() => setFlow('wizard')} />
  }

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && age !== null) ||
    (step === 2 && interests.length > 0) ||
    (step === 3 && goal !== null) ||
    (step === 4 && spend !== null)

  function toggleInterest(id: string) {
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function complete() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const persona = {
      ...(account?.persona ?? {}),
      name: name.trim(),
      age,
      interests,
      savingGoal: goal,
      spend_style: spend,
      onboarded: true,
    }
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'kid', persona }),
      })
      updateAccount(res.account)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.')
      setSubmitting(false)
    }
  }

  function next() {
    if (step < TOTAL - 1) setStep((s) => s + 1)
    else complete()
  }

  return (
    <div className="relative mx-auto flex min-h-full max-w-md flex-col overflow-hidden p-6">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-grad-aurora opacity-15 blur-[90px]" />
      <div className="relative mt-2 flex gap-1.5">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: i <= step ? '100%' : '0%', backgroundImage: 'var(--grad-accent-bright)', boxShadow: i <= step ? '0 0 8px rgba(43,217,138,0.6)' : undefined }} />
          </div>
        ))}
      </div>

      <div className="relative mt-8 flex-1">
        {step === 0 && (
          <div className="animate-rise">
            <h2 className="text-2xl font-extrabold leading-snug text-ink">Hey! What's your name?</h2>
            <p className="mt-2 text-muted">So your companion knows what to call you.</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={20}
              onKeyDown={(e) => e.key === 'Enter' && canContinue && next()}
              className="grad-border mt-6 h-14 w-full rounded-2xl bg-transparent px-4 text-lg font-semibold text-ink outline-none placeholder:text-faint"
            />
          </div>
        )}

        {step === 1 && (
          <div className="animate-rise">
            <h2 className="text-2xl font-extrabold leading-snug text-ink">How old are you?</h2>
            <p className="mt-2 text-muted">We'll keep things just right for your age.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {AGES.map((a, i) => (
                <PressButton
                  key={a}
                  onClick={() => setAge(a)}
                  className={`animate-pop-in rounded-2xl py-5 text-lg font-bold ${age === a ? 'glow-accent text-grad-accent' : 'grad-border text-ink'}`}
                  style={{ animationDelay: `${i * 40}ms`, backgroundImage: age === a ? 'var(--grad-card)' : undefined }}
                >
                  {a}
                </PressButton>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <MultiQuestion title="What do you love doing?" subtitle="Pick as many as you like." options={INTERESTS} selected={interests} onToggle={toggleInterest} />
        )}
        {step === 3 && (
          <SingleQuestion title="Saving up for anything?" subtitle="Your companion will cheer you on." options={GOALS} value={goal} onChange={setGoal} />
        )}
        {step === 4 && (
          <SingleQuestion title="Are you more of a…" subtitle="No wrong answer!" options={SPEND} value={spend} onChange={setSpend} />
        )}
      </div>

      {error && <p className="animate-pop-in relative mb-3 text-center text-sm text-danger">{error}</p>}

      <div className="relative flex gap-3">
        {step > 0 && (
          <PressButton onClick={() => setStep((s) => s - 1)} disabled={submitting} className="glass h-14 rounded-full px-6 font-bold text-ink">
            Back
          </PressButton>
        )}
        <GradientButton onClick={next} disabled={!canContinue || submitting} className="h-14 flex-1 rounded-full">
          {submitting ? 'Setting up…' : step === TOTAL - 1 ? 'Done' : 'Continue'}
        </GradientButton>
      </div>
    </div>
  )
}

type Opt = { id: string; Icon: LucideIcon; label: string; sub?: string }

function SingleQuestion({ title, subtitle, options, value, onChange }: { title: string; subtitle: string; options: readonly Opt[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="animate-rise">
      <h2 className="text-2xl font-extrabold leading-snug text-ink">{title}</h2>
      <p className="mt-2 text-muted">{subtitle}</p>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((opt, i) => {
          const picked = value === opt.id
          return (
            <PressButton key={opt.id} onClick={() => onChange(opt.id)} className={`animate-pop-in flex items-center gap-3 rounded-2xl p-4 text-left ${picked ? 'glow-accent' : 'grad-border'}`} style={{ animationDelay: `${i * 40}ms`, backgroundImage: picked ? 'var(--grad-card)' : undefined }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={picked ? { backgroundImage: 'var(--grad-accent-bright)' } : { backgroundColor: 'var(--surface-2)' }}>
                <opt.Icon size={20} style={{ color: picked ? 'var(--on-accent)' : 'var(--muted)' }} />
              </span>
              <div className="flex-1">
                <div className={`font-bold ${picked ? 'text-grad-accent' : 'text-ink'}`}>{opt.label}</div>
                {opt.sub && <div className="mt-0.5 text-xs italic text-muted">{opt.sub}</div>}
              </div>
            </PressButton>
          )
        })}
      </div>
    </div>
  )
}

function MultiQuestion({ title, subtitle, options, selected, onToggle }: { title: string; subtitle: string; options: readonly Opt[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="animate-rise">
      <h2 className="text-2xl font-extrabold leading-snug text-ink">{title}</h2>
      <p className="mt-2 text-muted">{subtitle}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const picked = selected.includes(opt.id)
          return (
            <PressButton key={opt.id} onClick={() => onToggle(opt.id)} className={`animate-pop-in flex flex-col items-center gap-2 rounded-2xl p-4 ${picked ? 'glow-accent' : 'grad-border'}`} style={{ animationDelay: `${i * 35}ms`, backgroundImage: picked ? 'var(--grad-card)' : undefined }}>
              <opt.Icon size={24} style={{ color: picked ? 'var(--accent)' : 'var(--muted)' }} />
              <span className={`text-sm font-bold ${picked ? 'text-grad-accent' : 'text-ink'}`}>{opt.label}</span>
            </PressButton>
          )
        })}
      </div>
    </div>
  )
}
