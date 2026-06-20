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
    <div className="mx-auto flex min-h-full max-w-md flex-col p-6">
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-surface2)' }} />
        ))}
      </div>

      <div className="mt-8 flex-1">
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
              className="mt-6 h-14 w-full rounded-2xl bg-surface px-4 text-lg font-semibold text-ink outline-none ring-1 ring-border focus:ring-accent"
            />
          </div>
        )}

        {step === 1 && (
          <div className="animate-rise">
            <h2 className="text-2xl font-extrabold leading-snug text-ink">How old are you?</h2>
            <p className="mt-2 text-muted">We'll keep things just right for your age.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {AGES.map((a) => (
                <button
                  key={a}
                  onClick={() => setAge(a)}
                  style={{ borderColor: age === a ? 'var(--color-accent)' : 'var(--color-border)' }}
                  className={`rounded-2xl border-2 py-5 text-lg font-bold transition active:scale-[0.98] ${age === a ? 'bg-accent-soft text-accent' : 'bg-surface text-ink'}`}
                >
                  {a}
                </button>
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

      {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} disabled={submitting} className="h-14 rounded-full bg-surface2 px-6 font-bold text-ink active:scale-[0.98]">
            Back
          </button>
        )}
        <button onClick={next} disabled={!canContinue || submitting} className="h-14 flex-1 rounded-full bg-accent font-bold text-on-accent transition active:scale-[0.98] disabled:opacity-40">
          {submitting ? 'Setting up…' : step === TOTAL - 1 ? 'Done' : 'Continue'}
        </button>
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
        {options.map((opt) => {
          const picked = value === opt.id
          return (
            <button key={opt.id} onClick={() => onChange(opt.id)} style={{ borderColor: picked ? 'var(--color-accent)' : 'var(--color-border)' }} className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition active:scale-[0.99] ${picked ? 'bg-accent-soft' : 'bg-surface'}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: picked ? 'var(--color-accent)' : 'var(--color-surface2)' }}>
                <opt.Icon size={20} style={{ color: picked ? 'var(--color-on-accent)' : 'var(--color-muted)' }} />
              </span>
              <div className="flex-1">
                <div className={`font-bold ${picked ? 'text-accent' : 'text-ink'}`}>{opt.label}</div>
                {opt.sub && <div className="mt-0.5 text-xs italic text-muted">{opt.sub}</div>}
              </div>
            </button>
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
        {options.map((opt) => {
          const picked = selected.includes(opt.id)
          return (
            <button key={opt.id} onClick={() => onToggle(opt.id)} style={{ borderColor: picked ? 'var(--color-accent)' : 'var(--color-border)' }} className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition active:scale-[0.98] ${picked ? 'bg-accent-soft' : 'bg-surface'}`}>
              <opt.Icon size={24} style={{ color: picked ? 'var(--color-accent)' : 'var(--color-muted)' }} />
              <span className={`text-sm font-bold ${picked ? 'text-accent' : 'text-ink'}`}>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
