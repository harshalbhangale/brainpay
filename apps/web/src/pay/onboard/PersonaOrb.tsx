/**
 * PersonaOrb — the evolving identity animation.
 * ───────────────────────────────────────────────────────────────────────────
 * A living orb that grows as the persona gains information. Every captured
 * trait adds an orbiting facet + advances the completeness ring; the core's
 * color blends toward the user's identity hue; when complete, it blooms.
 *
 * Built with Motion (Framer Motion) + SVG so it works with zero external
 * assets. SWAP SEAM: to drive a designed Rive animation instead, render
 * <RiveComponent/> here and push `completeness` / facet count into its state
 * machine inputs — the props below are exactly the data you'd feed it.
 */
import { motion, AnimatePresence } from 'motion/react'
import { Check } from 'lucide-react'

export type Facet = { id: string; label: string; hue: number }

export function PersonaOrb({
  facets,
  total,
  identityHue,
  thinking,
  done,
  size = 232,
}: {
  facets: Facet[]
  total: number
  identityHue: number
  thinking?: boolean
  done?: boolean
  size?: number
}) {
  const completeness = Math.min(1, facets.length / total)
  const coreSize = size * (0.34 + 0.16 * completeness) // grows as it learns
  const orbitR = size * 0.42
  const ringR = size * 0.5 - 4
  const circ = 2 * Math.PI * ringR
  const h = identityHue

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {/* Sonar rings while the assistant is thinking */}
      <AnimatePresence>
        {thinking &&
          [0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{ width: coreSize, height: coreSize, border: `2px solid hsl(${h} 80% 60% / 0.5)` }}
              initial={{ scale: 0.7, opacity: 0.5 }}
              animate={{ scale: 2.1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 1, ease: 'easeOut' }}
            />
          ))}
      </AnimatePresence>

      {/* Soft identity glow */}
      <motion.span
        className="absolute rounded-full"
        style={{ width: size * 0.92, height: size * 0.92, filter: 'blur(34px)' }}
        animate={{
          background: `radial-gradient(circle, hsl(${h} 90% 62% / 0.55), transparent 68%)`,
          scale: thinking ? [1, 1.08, 1] : 1,
        }}
        transition={{ duration: thinking ? 2.6 : 0.8, repeat: thinking ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* Completeness ring */}
      <svg width={size} height={size} className="absolute -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={ringR} fill="none" stroke="rgba(11,12,15,0.06)" strokeWidth={4} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={ringR}
          fill="none"
          stroke={`hsl(${h} 85% 55%)`}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={false}
          animate={{ strokeDashoffset: circ * (1 - completeness) }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        />
      </svg>

      {/* The core — breathes, grows, recolors toward the identity hue */}
      <motion.div
        className="relative grid place-items-center rounded-full"
        initial={{ scale: 0.6 }}
        animate={{
          width: coreSize,
          height: coreSize,
          scale: done ? [1, 1.18, 1] : thinking ? [1, 1.05, 1] : 1,
          background: `radial-gradient(circle at 32% 28%, hsl(${h} 95% 78%), hsl(${(h + 28) % 360} 78% 52%) 72%)`,
          boxShadow: `0 18px 50px -12px hsl(${h} 80% 50% / 0.6), inset 0 2px 10px rgba(255,255,255,0.6)`,
        }}
        transition={{
          width: { type: 'spring', stiffness: 120, damping: 16 },
          height: { type: 'spring', stiffness: 120, damping: 16 },
          scale: { duration: done ? 0.6 : 2.4, repeat: done ? 0 : thinking ? Infinity : 0, ease: 'easeInOut' },
          background: { duration: 0.6 },
        }}
      >
        {/* a glassy highlight bead */}
        <span className="absolute left-[22%] top-[18%] h-[26%] w-[26%] rounded-full" style={{ background: 'rgba(255,255,255,0.7)', filter: 'blur(2px)' }} />
        <AnimatePresence>
          {done && (
            <motion.span
              className="relative text-white"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14 }}
            >
              <Check size={coreSize * 0.42} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Orbiting facets — one per captured trait, evenly placed by slot index */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        <AnimatePresence>
          {facets.map((f, i) => {
            const angle = -90 + (i / total) * 360
            return (
              <motion.div
                key={f.id}
                className="absolute left-1/2 top-1/2"
                style={{ transform: `rotate(${angle}deg) translateX(${orbitR}px) rotate(${-angle}deg)` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              >
                {/* counter-rotate so the chip stays upright as the ring spins */}
                <motion.div
                  className="pv-glass -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                  style={{ color: 'var(--pv-ink)' }}
                >
                  <span className="mr-1 inline-block h-1.5 w-1.5 -translate-y-px rounded-full align-middle" style={{ background: `hsl(${f.hue} 80% 52%)` }} />
                  {f.label}
                </motion.div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
