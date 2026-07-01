/**
 * PalPicker — a radial "orbit" selector for choosing which Pal to talk to.
 * ───────────────────────────────────────────────────────────────────────────
 * The three Pals orbit a live central avatar (the real <Companion> character).
 * Tapping an orb springs the wheel so that Pal rotates to the top and the
 * centre avatar crossfades to its character; a soft accent aura spins behind.
 * Tapping the focused orb (or the CTA) commits with a circular colour flood
 * that fills the screen as the surface swaps underneath. Reduced-motion users
 * get an instant, static swap.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Check } from 'lucide-react'
import { PALS, type PalKey } from './config'
import { palCharacter } from './palCharacters'
import { Companion } from '../../components/Companion'

const FLOOD_MS = 560
const D = 290 // ring diameter
const ORBIT = 112 // orb centre distance from ring centre
const ORB = 62 // orb size
const CENTER = 156 // centre avatar box

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function PalPicker({
  current,
  onSelect,
  onClose,
  title = 'Who do you want to talk to?',
}: {
  current: PalKey
  onSelect: (pal: PalKey) => void
  onClose: () => void
  title?: string
}) {
  const reduce = prefersReducedMotion()
  const [focus, setFocus] = useState<PalKey>(current)
  const [flood, setFlood] = useState<{ gradient: string } | null>(null)
  const committed = useRef(false)

  const activeIndex = Math.max(0, PALS.findIndex((p) => p.key === focus))
  const ringRotate = reduce ? 0 : -activeIndex * 120 // spin the chosen orb to the top
  const ch = palCharacter(focus)

  function confirm(pal: PalKey) {
    if (committed.current) return
    committed.current = true
    if (reduce) { onSelect(pal); return }
    setFlood({ gradient: palCharacter(pal).gradient })
    window.setTimeout(() => onSelect(pal), FLOOD_MS - 60)
  }

  const onOrb = (pal: PalKey) => (pal === focus ? confirm(pal) : setFocus(pal))

  return (
    <div className="pv fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true" aria-label="Choose a Pal">
      <div
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--pv-bg) 80%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
        onClick={committed.current ? undefined : onClose}
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex flex-none items-start justify-between gap-3">
          <div>
            <div className="pv-label pv-text-accent">BrainPal</div>
            <h2 className="pv-h1 pv-tight mt-0.5">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="pv-press pv-glass flex h-10 w-10 flex-none items-center justify-center rounded-full">
            <X size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
        </div>

        {/* Orbit stage */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="relative" style={{ width: D, height: D }}>
            {/* spinning accent aura */}
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: CENTER + 60, height: CENTER + 60, marginLeft: -(CENTER + 60) / 2, marginTop: -(CENTER + 60) / 2, background: `conic-gradient(from 0deg, ${ch.accent}00, ${ch.accent}, ${ch.accent}00)`, filter: 'blur(14px)', opacity: 0.55 }}
              animate={reduce ? undefined : { rotate: 360 }}
              transition={reduce ? undefined : { duration: 8, ease: 'linear', repeat: Infinity }}
            />

            {/* dashed orbit guide */}
            <div className="absolute left-1/2 top-1/2 rounded-full" aria-hidden style={{ width: ORBIT * 2, height: ORBIT * 2, marginLeft: -ORBIT, marginTop: -ORBIT, border: '1.5px dashed var(--pv-line-strong)', opacity: 0.5 }} />

            {/* centre avatar — the live character */}
            <div
              className="absolute left-1/2 top-1/2 overflow-hidden rounded-full"
              style={{ width: CENTER, height: CENTER, marginLeft: -CENTER / 2, marginTop: -CENTER / 2, boxShadow: `0 0 0 4px var(--pv-surface), 0 0 0 7px ${ch.accent}, var(--pv-shadow-lg)`, background: 'var(--pv-surface-2)' }}
            >
              <AnimatePresence>
                <motion.div
                  key={focus}
                  className="absolute inset-0 h-full w-full"
                  initial={reduce ? false : { opacity: 0, scale: 1.08 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Companion avatar={ch.avatar} mood="happy" className="h-full w-full" />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* rotating orb ring */}
            <motion.div
              className="absolute inset-0"
              animate={{ rotate: ringRotate }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            >
              {PALS.map((p, i) => {
                const ang = ((-90 + i * 120) * Math.PI) / 180
                const x = Math.cos(ang) * ORBIT
                const y = Math.sin(ang) * ORBIT
                const c = palCharacter(p.key)
                const active = p.key === focus
                const Icon = p.Icon
                return (
                  <motion.button
                    key={p.key}
                    onClick={() => onOrb(p.key)}
                    aria-label={`${c.palName} — ${c.characterName}`}
                    aria-pressed={active}
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ left: '50%', top: '50%', width: ORB, height: ORB, marginLeft: -ORB / 2, marginTop: -ORB / 2, x, y, backgroundImage: c.gradient, color: c.onAccent, boxShadow: active ? `0 0 0 3px var(--pv-surface), 0 10px 26px -6px ${c.accent}` : 'var(--pv-shadow-md)' }}
                    animate={{ rotate: -ringRotate, scale: active ? 1.14 : 0.9, opacity: active ? 1 : 0.85 }}
                    transition={{ type: 'spring', stiffness: 140, damping: 16 }}
                    whileTap={{ scale: active ? 1.05 : 0.82 }}
                  >
                    <Icon size={26} strokeWidth={2.3} />
                    {active && (
                      <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', color: c.accent, boxShadow: 'var(--pv-shadow-sm)' }}>
                        <Check size={13} strokeWidth={3.2} />
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </motion.div>
          </div>
        </div>

        {/* Focused identity */}
        <div className="flex-none text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={focus}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="pv-eyebrow" style={{ color: ch.accent }}>{ch.palName}</div>
              <h3 className="pv-tight leading-none" style={{ fontFamily: 'var(--pv-font-display)', fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(2rem, 9vw, 2.8rem)', color: 'var(--pv-ink)' }}>
                {ch.characterName}
              </h3>
              <p className="mt-1.5 text-sm font-semibold" style={{ color: 'var(--pv-ink-2)' }}>{ch.tagline}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* CTA */}
        <div className="mt-5 flex-none">
          <motion.button
            onClick={() => confirm(focus)}
            whileTap={{ scale: 0.96 }}
            className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
            style={{ backgroundImage: ch.gradient, color: ch.onAccent, boxShadow: 'var(--pv-shadow-pop)' }}
          >
            Talk to {ch.characterName}
          </motion.button>
          <p className="mt-3 text-center text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>
            One home, many Pals — switch anytime.
          </p>
        </div>
      </div>

      {flood && <Flood gradient={flood.gradient} />}
    </div>
  )
}

/** Full-screen circular colour flood from the centre on confirm. */
function Flood({ gradient }: { gradient: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const size = (typeof window !== 'undefined' ? Math.hypot(window.innerWidth, window.innerHeight) : 1200) * 2.4
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-1/2 z-[70] rounded-full"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        backgroundImage: gradient,
        transform: on ? 'scale(1)' : 'scale(0)',
        opacity: on ? 1 : 0.9,
        transition: `transform ${FLOOD_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${FLOOD_MS}ms ease-out`,
      }}
    />
  )
}
