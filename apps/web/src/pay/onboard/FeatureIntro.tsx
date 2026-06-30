/**
 * FeatureIntro — a clean, spacious "Meet BrainPal" deck. One big bespoke
 * animated illustration per moment, a confident Clash Display headline, and a
 * single subline. Swipe or tap; slim progress; per-card hue tints the canvas.
 */
import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { PalCompanion } from './PalCompanion'
import { SaveScene, LearnScene, HealthScene, ControlScene, FamilyScene } from './illustrations'

type Slide = { hue: number; eyebrow: string; title: string; body: string; visual: ReactNode }

const KID_SLIDES: Slide[] = [
  { hue: 156, eyebrow: 'Welcome', title: "Hi, I'm your BrainPal", body: 'Your buddy for money, learning, and feeling great — all in one place.', visual: <PalCompanion hue={156} size={210} /> },
  { hue: 96, eyebrow: 'MoneyPal', title: 'Save for what you love', body: 'Do chores, earn Brains, and watch your goal fill up.', visual: <SaveScene /> },
  { hue: 262, eyebrow: 'StudyPal', title: 'Homework? Just ask', body: 'Snap a photo and your Pal explains it your way.', visual: <LearnScene /> },
  { hue: 152, eyebrow: 'HealthPal', title: 'Build great habits', body: 'Tiny daily wins, streaks, and rewards that feel good.', visual: <HealthScene /> },
]

const PARENT_SLIDES: Slide[] = [
  { hue: 205, eyebrow: 'Welcome', title: 'One home for your family', body: "Grow your kids' money, mind, and health — together, with you in command.", visual: <FamilyScene /> },
  { hue: 205, eyebrow: 'ParentPal', title: "You're always in control", body: 'Allowances, limits, and approvals — all in one calm place.', visual: <ControlScene /> },
  { hue: 96, eyebrow: 'MoneyPal', title: 'Money that teaches', body: 'Turn chores into allowance and savings goals that actually stick.', visual: <SaveScene /> },
  { hue: 152, eyebrow: 'Learning + wellbeing', title: 'Built in, safe by design', body: 'AI tutoring and healthy habits — no dead-ends, every dollar accountable.', visual: <HealthScene /> },
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

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * 48 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -48 }),
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* very soft, clean per-card wash */}
      <motion.div
        className="absolute inset-x-0 top-0 z-0 h-1/2"
        aria-hidden
        animate={{ background: `radial-gradient(80% 70% at 50% 0%, hsl(${s.hue} 90% 92%), transparent 75%)` }}
        transition={{ duration: 0.6 }}
      />

      {/* progress + skip */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="flex gap-1.5">
          {slides.map((_, k) => (
            <button key={k} onClick={() => go(k)} aria-label={`Card ${k + 1}`} className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: k === i ? 24 : 7, background: k === i ? `hsl(${s.hue} 70% 45%)` : 'var(--pv-line-strong)' }} />
          ))}
        </div>
        <button onClick={onDone} className="pv-press text-sm font-bold" style={{ color: 'var(--pv-ink-3)' }}>Skip</button>
      </div>

      {/* stage */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-7 text-center">
        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={i}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={(_, info) => { if (info.offset.x < -64) go(i + 1); else if (info.offset.x > 64) go(i - 1) }}
            className="flex flex-col items-center"
          >
            <div className="grid h-[260px] place-items-center">{s.visual}</div>
            <div className="pv-eyebrow mt-6" style={{ color: `hsl(${s.hue} 55% 40%)` }}>{s.eyebrow}</div>
            <h1 className="pv-h1 pv-tight mt-2.5 max-w-[300px]">{s.title}</h1>
            <p className="pv-body mt-3 max-w-[290px]" style={{ color: 'var(--pv-ink-2)' }}>{s.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA */}
      <div className="relative z-10 flex-none px-7 pb-[max(22px,env(safe-area-inset-bottom))] pt-2">
        <motion.button
          onClick={() => (last ? onDone() : go(i + 1))}
          whileTap={{ scale: 0.96 }}
          className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
        >
          {last ? (role === 'kid' ? "Let's make it yours" : 'Set up your family') : 'Continue'}
          <ChevronRight size={20} strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  )
}
