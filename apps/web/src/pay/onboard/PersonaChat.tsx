/**
 * PersonaChat — builds the user's persona inside a chat window while the
 * PersonaOrb evolves with every answer. Assistant asks one thing at a time;
 * the user replies with tappable chips or free text. On completion the orb
 * blooms into a persona card and we persist via PATCH /me.
 *
 * VOICE SEAM: to let a voice agent (ElevenLabs / Tavus / OpenAI Realtime) drive
 * this instead of taps, feed its tool-call results into `commit(question, value)`
 * — the orb + transcript update identically. Default is taps so it works with
 * no API key.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowUp, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { planFor, type Choice, type Question } from './personaPlan'
import { PersonaNebula, type Facet } from './PersonaNebula'

type Turn = { id: number; who: 'pal' | 'you'; text: string }
let tid = 1

const STYLE_MAP: Record<string, string> = { autonomous: 'chill', guided: 'balanced', structured: 'strict' }

export function PersonaChat({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const plan = planFor(role)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const account = useAuthStore((s) => s.account)

  const [turns, setTurns] = useState<Turn[]>([])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [draft, setDraft] = useState('')
  const [multi, setMulti] = useState<string[]>([])
  const [thinking, setThinking] = useState(false)
  const [phase, setPhase] = useState<'asking' | 'saving' | 'done'>('asking')
  const scrollRef = useRef<HTMLDivElement>(null)

  const q: Question | undefined = plan[step]

  // Greet with the first question on mount.
  useEffect(() => {
    setTurns([{ id: tid++, who: 'pal', text: plan[0].prompt }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, thinking])

  // Derived orb data — one facet per answered question.
  const facets: Facet[] = plan
    .slice(0, step)
    .map((pq) => {
      const v = answers[pq.key]
      if (v === undefined || (Array.isArray(v) && v.length === 0)) return null
      return { id: pq.key, label: pq.summarise(v), hue: pq.hueOf ? pq.hueOf(v) : 150 }
    })
    .filter(Boolean) as Facet[]

  const identityHue = facets.length
    ? Math.round(facets.reduce((s, f) => s + f.hue, 0) / facets.length)
    : 150
  const pct = Math.round((facets.length / plan.length) * 100)

  function commit(question: Question, value: string | string[], label: string) {
    setAnswers((a) => ({ ...a, [question.key]: value }))
    setTurns((t) => [...t, { id: tid++, who: 'you', text: label }])
    setDraft('')
    setMulti([])

    const nextStep = step + 1
    setThinking(true)
    window.setTimeout(() => {
      setStep(nextStep)
      if (nextStep < plan.length) {
        setThinking(false)
        setTurns((t) => [...t, { id: tid++, who: 'pal', text: plan[nextStep].prompt }])
      } else {
        finish({ ...answers, [question.key]: value })
      }
    }, 720)
  }

  async function finish(all: Record<string, string | string[]>) {
    setThinking(false)
    setPhase('saving')
    const name = String(all.name ?? '').trim()
    const persona =
      role === 'parent'
        ? {
            name,
            money_upbringing: all.money_upbringing,
            parenting_style: all.parenting_style,
            style: STYLE_MAP[String(all.parenting_style)] ?? 'balanced',
            kid_situation: all.kid_situation,
            primary_goal: all.primary_goal,
            onboarded: true,
          }
        : {
            ...(account?.persona ?? {}),
            name,
            age: all.age,
            interests: all.interests ?? [],
            savingGoal: all.savingGoal,
            spend_style: all.spend_style,
            onboarded: true,
          }
    try {
      const res = await api<{ account: Account }>('/me', { method: 'PATCH', body: JSON.stringify({ accountType: role, persona }) })
      updateAccount(res.account)
    } catch {
      /* still let them through — the gate re-syncs on next load */
    }
    setPhase('done')
    setTurns((t) => [...t, { id: tid++, who: 'pal', text: role === 'kid' ? `All set, ${name}! Your BrainPal is ready 🎉` : `Perfect — your family's all set up, ${name} 🎉` }])
    window.setTimeout(onDone, 2000)
  }

  const personaName = String(answers.name ?? '').trim()

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pv-mesh" aria-hidden />

      {/* Orb header — pinned, the centerpiece */}
      <div className="relative z-10 flex flex-none flex-col items-center pt-5">
        <PersonaNebula facets={facets} total={plan.length} identityHue={identityHue} thinking={thinking} done={phase === 'done'} />
        <div className="mt-2 flex items-center gap-2">
          <span className="pv-eyebrow">{phase === 'done' ? 'Persona ready' : phase === 'saving' ? 'Saving' : 'Building your BrainPal'}</span>
          <span className="pv-amount text-xs" style={{ color: 'var(--pv-ink-3)' }}>{pct}%</span>
        </div>

        {/* Captured traits — pop in as they're learned. */}
        <div className="mt-2 flex max-w-[340px] flex-wrap justify-center gap-1.5 px-4">
          <AnimatePresence>
            {facets.map((f) => (
              <motion.span
                key={f.id}
                layout
                initial={{ opacity: 0, scale: 0.6, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="pv-glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ color: 'var(--pv-ink)' }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${f.hue} 80% 52%)` }} />
                {f.label}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {phase === 'done' && personaName && (
          <motion.div
            className="pv-glass pv-hairline mt-3 flex items-center gap-2 rounded-full px-4 py-2"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 16 }}
          >
            <Sparkles size={15} style={{ color: `hsl(${identityHue} 80% 50%)` }} />
            <span className="pv-title pv-tight">Meet {personaName}</span>
          </motion.div>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="pv-no-scrollbar relative z-10 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pt-4">
        <AnimatePresence initial={false}>
          {turns.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              className={t.who === 'you' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={t.who === 'you' ? 'max-w-[82%] rounded-2xl px-4 py-2.5 text-sm font-medium' : 'pv-glass max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed'}
                style={t.who === 'you' ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }}
              >
                {t.text}
              </div>
            </motion.div>
          ))}
          {thinking && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
              <div className="pv-glass flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pv-ink-3)', animationDelay: `${i * 160}ms` }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Answer area */}
      {phase === 'asking' && q && !thinking && (
        <div className="relative z-10 flex-none px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-2">
          {q.hint && <p className="mb-2 text-center text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{q.hint}</p>}

          {q.kind === 'text' && (
            <form onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) commit(q, v, v) }} className="flex items-center gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={q.placeholder ?? 'Type your answer…'}
                maxLength={24}
                className="pv-glass h-12 flex-1 rounded-full px-4 text-[0.95rem] font-semibold outline-none"
                style={{ color: 'var(--pv-ink)' }}
              />
              <button type="submit" disabled={!draft.trim()} aria-label="Send" className="pv-press-lg pv-sheen flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: draft.trim() ? 'var(--pv-shadow-pop)' : undefined }}>
                <ArrowUp size={20} strokeWidth={2.8} />
              </button>
            </form>
          )}

          {q.kind === 'single' && (
            <ChipGrid
              options={q.options ?? []}
              onPick={(opt) => commit(q, opt.id, opt.label)}
            />
          )}

          {q.kind === 'multi' && (
            <div>
              <ChipGrid
                options={q.options ?? []}
                selected={multi}
                onPick={(opt) => setMulti((m) => (m.includes(opt.id) ? m.filter((x) => x !== opt.id) : [...m, opt.id]))}
              />
              <button
                onClick={() => { if (multi.length) { const labels = (q.options ?? []).filter((o) => multi.includes(o.id)).map((o) => o.label).join(', '); commit(q, multi, labels) } }}
                disabled={multi.length === 0}
                className="pv-press-lg pv-sheen mt-3 h-12 w-full rounded-full text-[0.95rem] font-bold disabled:opacity-40"
                style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: multi.length ? 'var(--pv-shadow-pop)' : undefined }}
              >
                Continue{multi.length ? ` · ${multi.length}` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChipGrid({ options, selected, onPick }: { options: Choice[]; selected?: string[]; onPick: (o: Choice) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {options.map((o, i) => {
        const picked = selected?.includes(o.id)
        return (
          <motion.button
            key={o.id}
            onClick={() => onPick(o)}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 18, delay: i * 0.04 }}
            whileTap={{ scale: 0.94 }}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-bold ${picked ? '' : 'pv-glass pv-hairline'}`}
            style={picked ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { color: 'var(--pv-ink)' }}
          >
            <o.Icon size={16} strokeWidth={2.2} style={{ color: picked ? 'var(--pv-on-accent)' : 'var(--pv-ink-2)' }} />
            <span className="text-left">
              {o.label}
              {o.sub && <span className="block text-[10px] font-medium opacity-70">{o.sub}</span>}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
