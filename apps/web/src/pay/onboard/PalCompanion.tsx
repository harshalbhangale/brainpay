/**
 * PalCompanion — a friendly, characterful animated mascot (bespoke SVG + Motion).
 * Idle-bobs, blinks, and a glowing antenna pulses. Reacts with a happy bounce
 * when `reactKey` changes (e.g. each persona answer) and does a celebration on
 * `celebrate`. The body color follows `hue`, so it becomes "the user's Pal".
 */
import { useEffect, useState } from 'react'
import { motion, useAnimationControls } from 'motion/react'

export function PalCompanion({
  hue = 156,
  size = 180,
  reactKey = 0,
  celebrate = false,
}: {
  hue?: number
  size?: number
  reactKey?: number
  celebrate?: boolean
}) {
  const controls = useAnimationControls()
  const [blink, setBlink] = useState(false)

  // Natural blinking.
  useEffect(() => {
    let t: number
    const loop = () => {
      setBlink(true)
      window.setTimeout(() => setBlink(false), 130)
      t = window.setTimeout(loop, 2200 + Math.random() * 2400)
    }
    t = window.setTimeout(loop, 1600)
    return () => window.clearTimeout(t)
  }, [])

  // Happy bounce on each new answer.
  useEffect(() => {
    if (reactKey > 0) controls.start({ y: [0, -16, 0], scale: [1, 1.06, 1], transition: { duration: 0.55, ease: [0.34, 1.56, 0.64, 1] } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactKey])

  useEffect(() => {
    if (celebrate) controls.start({ rotate: [0, -7, 6, -4, 0], y: [0, -22, 0], transition: { duration: 1 } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate])

  const body = `hsl(${hue} 82% 70%)`
  const bodyDark = `hsl(${hue} 70% 56%)`
  const ink = '#0b0c0f'

  return (
    <motion.div animate={controls} style={{ width: size, height: size }} className="relative grid place-items-center">
      {/* soft halo */}
      <motion.div
        className="absolute rounded-full"
        style={{ width: size * 0.92, height: size * 0.92, filter: 'blur(26px)', background: `radial-gradient(circle, hsl(${hue} 90% 70% / 0.5), transparent 68%)` }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        <defs>
          <linearGradient id="palBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={body} />
            <stop offset="100%" stopColor={bodyDark} />
          </linearGradient>
        </defs>

        {/* antenna */}
        <line x1="100" y1="44" x2="100" y2="22" stroke={ink} strokeWidth="5" strokeLinecap="round" />
        <motion.circle cx="100" cy="18" r="7" fill={`hsl(${hue} 95% 62%)`}
          animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />

        {/* body */}
        <rect x="42" y="48" width="116" height="112" rx="42" fill="url(#palBody)" stroke={ink} strokeWidth="5" />

        {/* face screen */}
        <rect x="60" y="70" width="80" height="60" rx="26" fill="#0b0c0f" />

        {/* eyes (blink by squashing) */}
        <motion.ellipse cx="84" cy="98" rx="8" animate={{ ry: blink ? 1.4 : 9 }} transition={{ duration: 0.1 }} fill="#fff" />
        <motion.ellipse cx="116" cy="98" rx="8" animate={{ ry: blink ? 1.4 : 9 }} transition={{ duration: 0.1 }} fill="#fff" />
        {/* eye sparkle */}
        {!blink && <>
          <circle cx="87" cy="95" r="2.4" fill={`hsl(${hue} 90% 75%)`} />
          <circle cx="119" cy="95" r="2.4" fill={`hsl(${hue} 90% 75%)`} />
        </>}

        {/* cheeks */}
        <circle cx="66" cy="118" r="6" fill="hsl(338 90% 72% / 0.85)" />
        <circle cx="134" cy="118" r="6" fill="hsl(338 90% 72% / 0.85)" />

        {/* little feet */}
        <rect x="74" y="158" width="20" height="12" rx="6" fill={bodyDark} stroke={ink} strokeWidth="4" />
        <rect x="106" y="158" width="20" height="12" rx="6" fill={bodyDark} stroke={ink} strokeWidth="4" />

        {/* waving hand */}
        <motion.g style={{ originX: '156px', originY: '120px' }} animate={{ rotate: [0, 18, -6, 14, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}>
          <circle cx="162" cy="112" r="11" fill={body} stroke={ink} strokeWidth="5" />
        </motion.g>
      </motion.svg>
    </motion.div>
  )
}
