/**
 * Brains — the reward currency at the centre of BrainPal.
 * ───────────────────────────────────────────────────────────────────────────
 * One designed mark + a few reward components, used EVERYWHERE (StudyPal,
 * MoneyPal, shopping) so rewards feel consistent and motivating. Brains are a
 * warm gold token (Pal-agnostic on purpose — the reward looks the same no matter
 * which Pal you earned it in). 1 Brain = 1¢.
 *
 *   <BrainCoin />              the icon (replaces the 🧠 emoji)
 *   <Brains amount={12} />     inline coin + number
 *   <BrainsPill amount={12} /> a chip ("+12") for earn moments
 *   <RewardsHelp onClose />    animated, kid-friendly "how rewards work"
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { GraduationCap, ListChecks, ShoppingBag, Target, CreditCard, X, ChevronLeft } from 'lucide-react'

/** 1 Brain = 1 cent. */
export const BRAIN_TO_CENTS = 1
export function brainsToMoney(brains: number): string {
  return `$${(brains / 100).toFixed(2)}`
}

/** The Brains mark — a warm gold coin with a clean brain glyph. */
export function BrainCoin({ size = 20, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`bc-${id}`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD976" />
          <stop offset="1" stopColor="#F0A032" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#bc-${id})`} />
      <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 10.4c-1-1.1-3-.9-3.7.4-1.6-.4-3 1-2.5 2.6-1.3.5-1.4 2.4-.2 3.1-.5 1.5.8 3 2.4 2.8.4 1 1.7 1.4 2.6.7" />
        <path d="M16 10.4c1-1.1 3-.9 3.7.4 1.6-.4 3 1 2.5 2.6 1.3.5 1.4 2.4.2 3.1.5 1.5-.8 3-2.4 2.8-.4 1-1.7 1.4-2.6.7" />
        <path d="M16 10.2v11" />
      </g>
    </svg>
  )
}

/** Inline coin + amount (e.g. in a stat row). */
export function Brains({ amount, size = 18, prefix, className, style }: { amount: number; size?: number; prefix?: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold tabular-nums ${className ?? ''}`} style={style}>
      <BrainCoin size={size} />
      {prefix}{amount.toLocaleString()}
    </span>
  )
}

/** A reward chip for earn moments ("+12"). `pop` springs it in. */
export function BrainsPill({ amount, prefix = '+', size = 18, pop, onClick, className }: { amount: number; prefix?: string; size?: number; pop?: boolean; onClick?: () => void; className?: string }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      onClick={onClick}
      className={`${pop ? 'pv-pop' : ''} ${onClick ? 'pv-press' : ''} inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold tabular-nums ${className ?? ''}`}
      style={{ background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}
    >
      <BrainCoin size={size} />
      {prefix}{amount.toLocaleString()}
      <span style={{ color: 'var(--pv-ink-3)', fontWeight: 600 }}>Brains</span>
    </Tag>
  )
}

// ─────────────────────────────────────────────────────── Rewards explainer

function useCountUp(target: number, on: boolean, durationMs = 1400) {
  const [v, setV] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (!on) { setV(target); return }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setV(Math.round(eased * target))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, on, durationMs])
  return v
}

function EarnRow({ icon, tile, title, sub, amount, delay }: { icon: React.ReactNode; tile: string; title: string; sub: string; amount: number; delay: number }) {
  return (
    <div className="pv-rise flex items-center gap-3 rounded-2xl p-3.5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: `${delay}ms` }}>
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl" style={{ background: tile }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="pv-title text-sm">{title}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>{sub}</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-extrabold" style={{ background: 'var(--pv-accent-soft)', color: 'var(--pv-accent)' }}>
        <BrainCoin size={15} /> +{amount}
      </span>
    </div>
  )
}

/** Animated, kid-friendly explainer of how Brains work. Renders as an overlay. */
export function RewardsHelp({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t) }, [])
  const brains = useCountUp(100, mounted)
  const money = (brains / 100).toFixed(2)

  return (
    <div className="pv-pal-enter absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--pv-bg, var(--pv-surface-2))' }}>
      <div className="flex flex-none items-center gap-3 px-4 pb-2 pt-2">
        <button onClick={onClose} aria-label="Back" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><ChevronLeft size={20} /></button>
        <h2 className="pv-title flex-1 truncate text-center">How Brains work</h2>
        <button onClick={onClose} aria-label="Close" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}><X size={18} /></button>
      </div>

      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        {/* Hero */}
        <div className="pv-pop mb-6 flex flex-col items-center text-center">
          <BrainCoin size={84} className="animate-float" style={{ filter: 'drop-shadow(0 10px 20px rgba(240,160,50,0.35))' }} />
          <h1 className="pv-h1 mt-4">Brains</h1>
          <p className="pv-body mt-1.5 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>Your reward for smart choices. Earn them, watch them grow, then spend or save.</p>
        </div>

        {/* Value converter */}
        <div className="pv-rise mb-6 overflow-hidden rounded-[24px] p-5" style={{ background: 'var(--pv-grad-ink)', ['--i' as string]: 0 }}>
          <p className="pv-label" style={{ color: 'rgba(255,255,255,0.55)' }}>What's a Brain worth?</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="pv-amount text-4xl" style={{ color: 'var(--pv-on-dark)' }}>1</span>
            <BrainCoin size={26} />
            <span className="pv-amount text-2xl" style={{ color: 'rgba(255,255,255,0.7)' }}>=</span>
            <span className="pv-amount text-4xl" style={{ color: '#FFD976' }}>1¢</span>
          </div>
          <div className="mt-4 h-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
          <div className="mt-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 pv-amount text-xl" style={{ color: 'var(--pv-on-dark)' }}><BrainCoin size={20} /> {brains}</span>
            <span className="pv-amount text-xl" style={{ color: 'rgba(255,255,255,0.6)' }}>→</span>
            <span className="pv-amount text-2xl" style={{ color: '#FFD976' }}>${money}</span>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>100 Brains = $1.00 — real money in your BrainPal.</p>
        </div>

        {/* Earn */}
        <p className="pv-label mb-3">How you earn Brains</p>
        <div className="mb-6 flex flex-col gap-2.5">
          <EarnRow delay={40} tile="rgba(139,124,255,0.16)" icon={<GraduationCap size={20} style={{ color: '#7c6cff' }} />} title="Learn & ace interviews" sub="Study lessons and explain them to the tutor" amount={25} />
          <EarnRow delay={100} tile="rgba(52,211,153,0.16)" icon={<ListChecks size={20} style={{ color: '#10b981' }} />} title="Finish your chores" sub="Get things done around the house" amount={50} />
          <EarnRow delay={160} tile="rgba(56,189,248,0.16)" icon={<ShoppingBag size={20} style={{ color: '#0ea5e9' }} />} title="Make smart choices" sub="Pick the healthier, wiser option when you shop" amount={10} />
        </div>

        {/* Spend / save */}
        <p className="pv-label mb-3">What you can do with them</p>
        <div className="flex flex-col gap-2.5">
          <EarnRow delay={40} tile="rgba(255,178,74,0.18)" icon={<Target size={20} style={{ color: '#e8902a' }} />} title="Save toward a goal" sub="Watch your Brains grow into something real" amount={0} />
          <div className="pv-rise flex items-center gap-3 rounded-2xl p-3.5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', animationDelay: '100ms' }}>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl" style={{ background: 'rgba(168,85,247,0.16)' }}><CreditCard size={20} style={{ color: '#a855f7' }} /></span>
            <div className="min-w-0 flex-1">
              <p className="pv-title text-sm">Spend with your card</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--pv-ink-3)' }}>Brains become money you can actually use</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
