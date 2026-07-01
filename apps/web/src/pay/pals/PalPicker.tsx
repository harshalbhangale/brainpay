/**
 * PalPicker — choose which character to talk to.
 * ───────────────────────────────────────────────────────────────────────────
 * A full-screen glass overlay with one card per Pal (name · character · role).
 * Selecting a card triggers a **circular color flood**: a disc painted with the
 * incoming Pal's gradient expands from the tapped card to fill the screen, then
 * the selection commits underneath — so switching characters feels tactile and
 * the accent visibly "floods" in. Reduced-motion users just get an instant swap.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, X, ChevronRight } from 'lucide-react'
import { PALS, type PalKey } from './config'
import { palCharacter } from './palCharacters'

const FLOOD_MS = 520

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
  const [flood, setFlood] = useState<{ x: number; y: number; gradient: string } | null>(null)
  const committed = useRef(false)

  const pick = (pal: PalKey, e: React.MouseEvent<HTMLButtonElement>) => {
    if (committed.current) return
    committed.current = true
    if (prefersReducedMotion()) { onSelect(pal); return }
    const r = e.currentTarget.getBoundingClientRect()
    setFlood({ x: r.left + r.width / 2, y: r.top + r.height / 2, gradient: palCharacter(pal).gradient })
    window.setTimeout(() => onSelect(pal), FLOOD_MS - 40)
  }

  return (
    <div className="pv fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true" aria-label="Choose a Pal">
      <div
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--pv-bg) 78%, transparent)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
        onClick={committed.current ? undefined : onClose}
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-8">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="pv-label pv-text-accent">BrainPal</div>
            <h2 className="pv-h1 pv-tight mt-0.5">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="pv-press pv-glass flex h-10 w-10 flex-none items-center justify-center rounded-full">
            <X size={18} style={{ color: 'var(--pv-ink-2)' }} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {PALS.map((p, i) => {
            const ch = palCharacter(p.key)
            const active = p.key === current
            const Icon = p.Icon
            return (
              <button
                key={p.key}
                onClick={(e) => pick(p.key, e)}
                data-pal={p.key}
                className="pv pv-press pv-pop pv-glass pv-hairline flex items-center gap-4 rounded-[26px] p-4 text-left"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span
                  className="relative flex h-14 w-14 flex-none items-center justify-center rounded-2xl"
                  style={{ backgroundImage: ch.gradient, color: ch.onAccent, boxShadow: 'var(--pv-shadow-pop)' }}
                >
                  <Icon size={26} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="pv-title pv-tight truncate">{ch.palName}</span>
                    <span className="truncate text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{ch.characterName}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-medium" style={{ color: 'var(--pv-ink-3)' }}>{ch.tagline}</span>
                </span>
                {active ? (
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full" style={{ backgroundImage: ch.gradient, color: ch.onAccent }}>
                    <Check size={16} strokeWidth={3} />
                  </span>
                ) : (
                  <ChevronRight size={18} className="flex-none" style={{ color: 'var(--pv-ink-3)' }} />
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-5 text-center text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>
          One home, many Pals — switch anytime.
        </p>
      </div>

      {flood && <Flood x={flood.x} y={flood.y} gradient={flood.gradient} />}
    </div>
  )
}

/** The expanding accent disc. Mounts at scale 0 and floods to fill the screen. */
function Flood({ x, y, gradient }: { x: number; y: number; gradient: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const size = (typeof window !== 'undefined' ? Math.hypot(window.innerWidth, window.innerHeight) : 1200) * 2.4
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[70] rounded-full"
      style={{
        left: x,
        top: y,
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
