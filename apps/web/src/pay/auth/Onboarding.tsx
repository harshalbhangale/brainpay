/**
 * Onboarding (light) — voice-first, with a tap-through wizard fallback.
 * Builds the parent or kid persona and persists via PATCH /me, then calls onDone.
 */
import { useState } from 'react'
import {
  MessagesSquare, Lock, Scale, Wind, Compass, Building2, Baby, User, Users, UsersRound,
  HandHelping, Target, Apple, Lightbulb, Heart, Flame,
  Gamepad2, Trophy, Palette, Music, BookOpen, Cat, FlaskConical,
  Gift, Smartphone, Shirt, Ticket, PiggyBank, Coins,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { Button } from '../components/primitives'
import { VoiceOnboarding } from './VoiceOnboarding'

type Opt = { id: string; Icon: LucideIcon; label: string; sub?: string }

const PARENT_UPBRINGING: Opt[] = [
  { id: 'open', Icon: MessagesSquare, label: 'We talked about it', sub: 'Money was dinner-table conversation' },
  { id: 'private', Icon: Lock, label: 'It was private', sub: "We didn't really discuss it" },
  { id: 'mixed', Icon: Scale, label: 'Somewhere in between', sub: 'Depended on the situation' },
]
const PARENT_INSTINCT: (Opt & { style: string })[] = [
  { id: 'autonomous', Icon: Wind, label: 'Let them figure it out', sub: 'Natural consequences teach best', style: 'chill' },
  { id: 'guided', Icon: Compass, label: 'Guide them through it', sub: 'I like to explain the why', style: 'balanced' },
  { id: 'structured', Icon: Building2, label: 'Set the structure', sub: 'Clear rules and limits work best', style: 'strict' },
]
const PARENT_KIDS: Opt[] = [
  { id: 'one_young', Icon: Baby, label: 'One kid (under 10)' },
  { id: 'one_teen', Icon: User, label: 'One kid (10–14)' },
  { id: 'two', Icon: Users, label: 'Two kids' },
  { id: 'three_plus', Icon: UsersRound, label: 'Three or more' },
  { id: 'mixed', Icon: Scale, label: 'Mixed ages' },
]
const PARENT_GOALS: Opt[] = [
  { id: 'impulse', Icon: HandHelping, label: 'Stop impulse buying' },
  { id: 'save', Icon: Target, label: 'Learn to save for something real' },
  { id: 'food', Icon: Apple, label: 'Make better food choices' },
  { id: 'understand', Icon: Lightbulb, label: 'Understand where money comes from' },
  { id: 'responsible', Icon: Heart, label: 'Be more responsible generally' },
  { id: 'all', Icon: Flame, label: 'All of the above, honestly' },
]

const KID_AGES = ['8–9', '10–11', '12–13', '14+']
const KID_INTERESTS: Opt[] = [
  { id: 'gaming', Icon: Gamepad2, label: 'Gaming' },
  { id: 'sports', Icon: Trophy, label: 'Sports' },
  { id: 'art', Icon: Palette, label: 'Art' },
  { id: 'music', Icon: Music, label: 'Music' },
  { id: 'reading', Icon: BookOpen, label: 'Reading' },
  { id: 'animals', Icon: Cat, label: 'Animals' },
  { id: 'science', Icon: FlaskConical, label: 'Science' },
]
const KID_GOALS: Opt[] = [
  { id: 'game', Icon: Gamepad2, label: 'A video game' },
  { id: 'gadget', Icon: Smartphone, label: 'A gadget' },
  { id: 'toy', Icon: Gift, label: 'A toy / Lego' },
  { id: 'clothes', Icon: Shirt, label: 'Clothes / shoes' },
  { id: 'experience', Icon: Ticket, label: 'An outing / experience' },
  { id: 'saving', Icon: PiggyBank, label: 'Just saving up!' },
]
const KID_SPEND: Opt[] = [
  { id: 'saver', Icon: PiggyBank, label: 'A saver', sub: 'I like watching it grow' },
  { id: 'mixed', Icon: Scale, label: 'A bit of both', sub: 'Depends on the day' },
  { id: 'impulse', Icon: Coins, label: 'A spender', sub: 'I love treating myself' },
]

const TOTAL = 5

export function Onboarding({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)
  const [flow, setFlow] = useState<'voice' | 'wizard'>('voice')

  const [step, setStep] = useState(0)
  const [name, setName] = useState((account?.persona?.name as string) || '')
  const [a1, setA1] = useState<string | null>(null) // upbringing / age
  const [a2, setA2] = useState<string | null>(null) // instinct / interests(multi handled separately)
  const [interests, setInterests] = useState<string[]>([])
  const [a3, setA3] = useState<string | null>(null) // kidSituation / goal
  const [a4, setA4] = useState<string | null>(null) // primaryGoal / spend
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (flow === 'voice') {
    return <VoiceOnboarding role={role} onDone={onDone} onTypeInstead={() => setFlow('wizard')} />
  }

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && a1 !== null) ||
    (step === 2 && (role === 'kid' ? interests.length > 0 : a2 !== null)) ||
    (step === 3 && a3 !== null) ||
    (step === 4 && a4 !== null)

  function toggleInterest(id: string) {
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function complete() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const persona =
      role === 'parent'
        ? {
            name: name.trim(),
            money_upbringing: a1,
            parenting_style: a2,
            style: PARENT_INSTINCT.find((x) => x.id === a2)?.style ?? 'balanced',
            kid_situation: a3,
            primary_goal: a4,
            onboarded: true,
          }
        : {
            ...(account?.persona ?? {}),
            name: name.trim(),
            age: a1,
            interests,
            savingGoal: a3,
            spend_style: a4,
            onboarded: true,
          }
    try {
      const res = await api<{ account: Account }>('/me', { method: 'PATCH', body: JSON.stringify({ accountType: role, persona }) })
      updateAccount(res.account)
      onDone()
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
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--pv-surface-3)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: i <= step ? '100%' : '0%', backgroundImage: 'var(--pv-grad-accent)' }} />
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-8">
        {step === 0 && (
          <div className="pv-rise">
            <h2 className="pv-h1 pv-tight">{role === 'parent' ? 'What do your kids call you?' : "Hey! What's your name?"}</h2>
            <p className="pv-body mt-2" style={{ color: 'var(--pv-ink-2)' }}>{role === 'parent' ? 'Mum, Dad, Sarah — whatever works.' : 'So your companion knows what to call you.'}</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={role === 'parent' ? 'e.g. Mum' : 'Your name'}
              maxLength={20}
              onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) next() }}
              className="pv-glass mt-6 h-14 w-full rounded-2xl px-4 text-lg font-semibold outline-none"
              style={{ color: 'var(--pv-ink)' }}
            />
          </div>
        )}

        {role === 'parent' ? (
          <>
            {step === 1 && <Single title="Growing up, was money talked about openly?" subtitle="This shapes how PAL communicates with you." options={PARENT_UPBRINGING} value={a1} onChange={setA1} />}
            {step === 2 && <Single title="When your kid wants something they can't afford yet…" subtitle="What's your instinct?" options={PARENT_INSTINCT} value={a2} onChange={setA2} />}
            {step === 3 && <Single title="Tell me about your kid situation." subtitle="PAL calibrates suggestions based on this." options={PARENT_KIDS} value={a3} onChange={setA3} />}
            {step === 4 && <Single title="What do you actually want to change?" subtitle="PAL will celebrate wins that match this." options={PARENT_GOALS} value={a4} onChange={setA4} />}
          </>
        ) : (
          <>
            {step === 1 && (
              <div className="pv-rise">
                <h2 className="pv-h1 pv-tight">How old are you?</h2>
                <p className="pv-body mt-2" style={{ color: 'var(--pv-ink-2)' }}>We'll keep things just right for your age.</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {KID_AGES.map((ag, i) => (
                    <button key={ag} onClick={() => setA1(ag)} className={`pv-press pv-pop pv-hairline rounded-2xl py-5 text-lg font-bold ${a1 === ag ? '' : 'pv-glass'}`}
                      style={a1 === ag ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 40}ms` } : { animationDelay: `${i * 40}ms` }}>
                      {ag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && <Multi title="What do you love doing?" subtitle="Pick as many as you like." options={KID_INTERESTS} selected={interests} onToggle={toggleInterest} />}
            {step === 3 && <Single title="Saving up for anything?" subtitle="Your companion will cheer you on." options={KID_GOALS} value={a3} onChange={setA3} />}
            {step === 4 && <Single title="Are you more of a…" subtitle="No wrong answer!" options={KID_SPEND} value={a4} onChange={setA4} />}
          </>
        )}
      </div>

      {error && <p className="pv-pop mb-3 text-center text-sm font-semibold" style={{ color: 'var(--pv-neg)' }}>{error}</p>}

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="soft" size="lg" onClick={() => setStep((s) => s - 1)} disabled={submitting}>Back</Button>
        )}
        <Button variant="accent" size="lg" full onClick={next} disabled={!canContinue || submitting}>
          {submitting ? 'Setting up…' : step === TOTAL - 1 ? 'Done' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

function Single({ title, subtitle, options, value, onChange }: { title: string; subtitle: string; options: Opt[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="pv-rise">
      <h2 className="pv-h1 pv-tight">{title}</h2>
      <p className="pv-body mt-2" style={{ color: 'var(--pv-ink-2)' }}>{subtitle}</p>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((opt, i) => {
          const picked = value === opt.id
          return (
            <button key={opt.id} onClick={() => onChange(opt.id)} className={`pv-press pv-pop pv-hairline flex items-center gap-3 rounded-2xl p-4 text-left ${picked ? '' : 'pv-glass'}`}
              style={picked ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 40}ms` } : { animationDelay: `${i * 40}ms` }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={picked ? { background: 'rgba(255,255,255,0.25)' } : { background: 'var(--pv-surface-2)' }}>
                <opt.Icon size={20} style={{ color: picked ? 'inherit' : 'var(--pv-ink-2)' }} />
              </span>
              <div className="flex-1">
                <div className="font-bold">{opt.label}</div>
                {opt.sub && <div className="mt-0.5 text-xs italic" style={{ color: picked ? 'inherit' : 'var(--pv-ink-3)', opacity: picked ? 0.85 : 1 }}>{opt.sub}</div>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Multi({ title, subtitle, options, selected, onToggle }: { title: string; subtitle: string; options: Opt[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="pv-rise">
      <h2 className="pv-h1 pv-tight">{title}</h2>
      <p className="pv-body mt-2" style={{ color: 'var(--pv-ink-2)' }}>{subtitle}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const picked = selected.includes(opt.id)
          return (
            <button key={opt.id} onClick={() => onToggle(opt.id)} className={`pv-press pv-pop pv-hairline flex flex-col items-center gap-2 rounded-2xl p-4 ${picked ? '' : 'pv-glass'}`}
              style={picked ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)', animationDelay: `${i * 35}ms` } : { animationDelay: `${i * 35}ms` }}>
              <opt.Icon size={24} style={{ color: picked ? 'inherit' : 'var(--pv-ink-2)' }} />
              <span className="text-sm font-bold">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
