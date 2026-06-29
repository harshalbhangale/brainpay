/**
 * FeatureIntro — first-run "Meet BrainPal" card deck. Role-specific copy, a
 * swipeable/animated deck with progress dots, and per-card accent so the ambient
 * mesh recolors to the Pal each card is about. Last card flows into the persona
 * builder.
 *
 * ART SEAM: each card renders a built-in animated SVG glyph. To use designed
 * motion (Lottie / Rive) instead, drop a player into <CardArt/> keyed on `art`.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Sparkles, Wallet, Camera, HeartPulse, ShieldCheck, GraduationCap, Coins, Users,
  ChevronRight, type LucideIcon,
} from 'lucide-react'

type Slide = {
  art: LucideIcon
  hue: number
  eyebrow: string
  title: string
  body: string
}

const KID_SLIDES: Slide[] = [
  { art: Sparkles, hue: 150, eyebrow: 'Welcome', title: 'Meet your Pals', body: "Say hi to your Pals. They help you save, learn, and feel awesome — and they're all yours." },
  { art: Wallet, hue: 78, eyebrow: 'MoneyPal', title: 'Earn, save, glow up', body: 'Do chores, earn Brains, and watch your savings grow toward the thing you really want.' },
  { art: Camera, hue: 262, eyebrow: 'StudyPal', title: 'Homework buddy', body: 'Stuck on homework? Point your camera and ask. StudyPal explains it your way.' },
  { art: HeartPulse, hue: 152, eyebrow: 'HealthPal', title: 'Feel good, level up', body: 'Build healthy habits, hit streaks, and earn rewards. Small wins, every day.' },
]

const PARENT_SLIDES: Slide[] = [
  { art: Sparkles, hue: 205, eyebrow: 'Welcome', title: 'One home for the family', body: "BrainPal is an AI bank that grows your kids' money, mind, and health — with you in command." },
  { art: ShieldCheck, hue: 205, eyebrow: 'ParentPal', title: "You're always in control", body: 'Set allowances and limits, approve spending, and see everything in one place.' },
  { art: Coins, hue: 248, eyebrow: 'MoneyPal', title: 'Money that teaches', body: 'Turn chores into allowance and savings goals that actually stick.' },
  { art: GraduationCap, hue: 152, eyebrow: 'Learning + wellbeing', title: 'Built in, safe by design', body: 'AI tutoring and healthy habits — no dead-ends, every dollar accountable.' },
]

export function FeatureIntro({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const slides = role === 'kid' ? KID_SLIDES : PARENT_SLIDES
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const last = i === slides.length - 1
  const s = slides[i]

  function go(n: number) {
    if (n < 0 || n >= slides.length) return
    setDir(n > i ? 1 : -1)
    setI(n)
  }

  const cardVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * 60, scale: 0.96 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (d: number) => ({ opacity: 0, x: d * -60, scale: 0.96 }),
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Ambient mesh, recolored to the active card's Pal hue. */}
      <motion.div
        className="absolute inset-0 z-0"
        aria-hidden
        animate={{
          background: `radial-gradient(46% 38% at 22% 14%, hsl(${s.hue} 90% 70% / 0.34), transparent 70%),`
            + `radial-gradient(42% 36% at 84% 88%, hsl(${(s.hue + 60) % 360} 85% 70% / 0.26), transparent 72%)`,
        }}
        transition={{ duration: 0.6 }}
        style={{ filter: 'blur(30px)' }}
      />

      {/* Top bar: progress dots + skip */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5">
        <div className="flex gap-1.5">
          {slides.map((_, k) => (
            <button key={k} onClick={() => go(k)} aria-label={`Go to card ${k + 1}`} className="pv-press h-1.5 rounded-full transition-all duration-300" style={{ width: k === i ? 26 : 8, background: k === i ? `hsl(${s.hue} 80% 50%)` : 'var(--pv-line-strong)' }} />
          ))}
        </div>
        <button onClick={onDone} className="pv-press text-sm font-bold" style={{ color: 'var(--pv-ink-3)' }}>Skip</button>
      </div>

      {/* Card stage */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={i}
            custom={dir}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => { if (info.offset.x < -70) go(i + 1); else if (info.offset.x > 70) go(i - 1) }}
            className="pv-glass pv-hairline w-full max-w-[380px] rounded-[34px] p-7"
          >
            <CardArt Icon={s.art} hue={s.hue} />
            <div className="pv-eyebrow mt-7" style={{ color: `hsl(${s.hue} 60% 42%)` }}>{s.eyebrow}</div>
            <h2 className="pv-h1 pv-tight mt-2">{s.title}</h2>
            <p className="pv-body mt-3" style={{ color: 'var(--pv-ink-2)' }}>{s.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA */}
      <div className="relative z-10 flex-none px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <motion.button
          onClick={() => (last ? onDone() : go(i + 1))}
          whileTap={{ scale: 0.95 }}
          className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
        >
          {last ? (role === 'kid' ? "Let's make it yours" : 'Set up your family') : 'Next'}
          <ChevronRight size={20} strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  )
}

/** Built-in animated glyph — a breathing tinted disc with a floating icon and
 *  orbiting sparks. Replace with a Lottie/Rive player via the ART SEAM above. */
function CardArt({ Icon, hue }: { Icon: LucideIcon; hue: number }) {
  return (
    <div className="relative grid h-40 place-items-center">
      <motion.div
        className="absolute rounded-full"
        style={{ width: 150, height: 150, filter: 'blur(26px)' }}
        animate={{ background: `radial-gradient(circle, hsl(${hue} 90% 65% / 0.55), transparent 70%)`, scale: [1, 1.07, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative grid h-24 w-24 place-items-center rounded-[28px]"
        style={{ background: `linear-gradient(150deg, hsl(${hue} 90% 72%), hsl(${(hue + 30) % 360} 78% 52%))`, boxShadow: `0 18px 44px -12px hsl(${hue} 80% 50% / 0.6)`, color: '#fff' }}
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon size={42} strokeWidth={2.2} />
      </motion.div>
      {[Users, Coins, Camera].map((Spark, k) => (
        <motion.span
          key={k}
          className="pv-glass absolute grid h-8 w-8 place-items-center rounded-full"
          style={{ color: `hsl(${(hue + k * 40) % 360} 70% 45%)`, top: `${[10, 70, 22][k]}%`, left: `${[12, 80, 86][k]}%` }}
          animate={{ y: [0, -6, 0], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4 + k * 0.5, repeat: Infinity, ease: 'easeInOut', delay: k * 0.4 }}
        >
          <Spark size={15} strokeWidth={2.4} />
        </motion.span>
      ))}
    </div>
  )
}
