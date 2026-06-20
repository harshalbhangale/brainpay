import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessagesSquare, Lock, Scale, Wind, Compass, Building2,
  Baby, User, Users, UsersRound, Sparkles,
  HandHelping, Target, Apple, Lightbulb, Heart, Flame,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
import { VoiceOnboarding } from '../components/VoiceOnboarding'

/**
 * Parent onboarding — 5 questions that build the PAL persona.
 * Persists via PATCH /me.
 */

const MONEY_UPBRINGING = [
  { id: 'open', Icon: MessagesSquare, label: 'We talked about it', sub: 'Money was dinner-table conversation' },
  { id: 'private', Icon: Lock, label: 'It was private', sub: "We didn't really discuss it" },
  { id: 'mixed', Icon: Scale, label: 'Somewhere in between', sub: 'Depended on the situation' },
] as const

const PARENTING_INSTINCT = [
  { id: 'autonomous', Icon: Wind, label: 'Let them figure it out', sub: 'Natural consequences teach best', style: 'chill' },
  { id: 'guided', Icon: Compass, label: 'Guide them through it', sub: 'I like to explain the why', style: 'balanced' },
  { id: 'structured', Icon: Building2, label: 'Set the structure', sub: 'Clear rules and limits work best', style: 'strict' },
] as const

const KID_SITUATIONS = [
  { id: 'one_young', Icon: Baby, label: 'One kid (under 10)' },
  { id: 'one_teen', Icon: User, label: 'One kid (10–14)' },
  { id: 'two', Icon: Users, label: 'Two kids' },
  { id: 'three_plus', Icon: UsersRound, label: 'Three or more' },
  { id: 'mixed', Icon: Sparkles, label: 'Mixed ages' },
] as const

const PRIMARY_GOALS = [
  { id: 'impulse', Icon: HandHelping, label: 'Stop impulse buying' },
  { id: 'save', Icon: Target, label: 'Learn to save for something real' },
  { id: 'food', Icon: Apple, label: 'Make better food choices' },
  { id: 'understand', Icon: Lightbulb, label: 'Understand where money comes from' },
  { id: 'responsible', Icon: Heart, label: 'Be more responsible generally' },
  { id: 'all', Icon: Flame, label: 'All of the above, honestly' },
] as const

const TOTAL_STEPS = 5

export function ParentOnboarding() {
  const navigate = useNavigate()
  const updateAccount = useAuthStore((s) => s.updateAccount)

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [upbringing, setUpbringing] = useState<string | null>(null)
  const [instinct, setInstinct] = useState<string | null>(null)
  const [kidSituation, setKidSituation] = useState<string | null>(null)
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flow, setFlow] = useState<'voice' | 'wizard'>('voice')

  if (flow === 'voice') {
    return <VoiceOnboarding role="parent" onDone={() => navigate('/', { replace: true })} onTypeInstead={() => setFlow('wizard')} />
  }

  const palStyle = PARENTING_INSTINCT.find((x) => x.id === instinct)?.style ?? 'balanced'

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && upbringing !== null) ||
    (step === 2 && instinct !== null) ||
    (step === 3 && kidSituation !== null) ||
    (step === 4 && primaryGoal !== null)

  async function complete() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const persona = {
      name: name.trim(),
      money_upbringing: upbringing,
      parenting_style: instinct,
      style: palStyle,
      kid_situation: kidSituation,
      primary_goal: primaryGoal,
      onboarded: true,
    }
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'parent', persona }),
      })
      updateAccount(res.account)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.')
      setSubmitting(false)
    }
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
    else complete()
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col p-6">
      {/* Progress */}
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-surface2)' }}
          />
        ))}
      </div>

      <div className="mt-8 flex-1">
        {step === 0 && (
          <div className="animate-rise">
            <h2 className="text-2xl font-extrabold leading-snug text-ink">What do your kids call you?</h2>
            <p className="mt-2 text-muted">Mum, Dad, Sarah, Big Boss — whatever works.</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mum"
              maxLength={20}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
              className="mt-6 h-14 w-full rounded-2xl bg-surface px-4 text-lg font-semibold text-ink outline-none ring-1 ring-border focus:ring-accent"
            />
          </div>
        )}

        {step === 1 && (
          <Question title="Growing up, was money talked about openly?" subtitle="This shapes how PAL communicates with you." options={MONEY_UPBRINGING} value={upbringing} onChange={setUpbringing} />
        )}
        {step === 2 && (
          <Question title="When your kid wants something they can't afford yet…" subtitle="What's your instinct?" options={PARENTING_INSTINCT} value={instinct} onChange={setInstinct} />
        )}
        {step === 3 && (
          <Question title="Tell me about your kid situation." subtitle="PAL calibrates its suggestions based on this." options={KID_SITUATIONS} value={kidSituation} onChange={setKidSituation} />
        )}
        {step === 4 && (
          <Question title="What do you actually want to change?" subtitle="PAL will celebrate wins that match this goal." options={PRIMARY_GOALS} value={primaryGoal} onChange={setPrimaryGoal} />
        )}
      </div>

      {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={submitting}
            className="h-14 rounded-full bg-surface2 px-6 font-bold text-ink active:scale-[0.98]"
          >
            Back
          </button>
        )}
        <button
          onClick={next}
          disabled={!canContinue || submitting}
          className="h-14 flex-1 rounded-full bg-accent font-bold text-on-accent transition active:scale-[0.98] disabled:opacity-40"
        >
          {submitting ? 'Setting up…' : step === TOTAL_STEPS - 1 ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

type Option = { id: string; Icon: LucideIcon; label: string; sub?: string }

function Question({
  title,
  subtitle,
  options,
  value,
  onChange,
}: {
  title: string
  subtitle: string
  options: readonly Option[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="animate-rise">
      <h2 className="text-2xl font-extrabold leading-snug text-ink">{title}</h2>
      <p className="mt-2 text-muted">{subtitle}</p>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((opt) => {
          const picked = value === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              style={{ borderColor: picked ? 'var(--color-accent)' : 'var(--color-border)' }}
              className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition active:scale-[0.99] ${
                picked ? 'bg-accent-soft' : 'bg-surface'
              }`}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: picked ? 'var(--color-accent)' : 'var(--color-surface2)' }}
              >
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
