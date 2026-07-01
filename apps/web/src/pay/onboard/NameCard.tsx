/**
 * NameCard — the "make it yours" moment. The user types their name and watches
 * it print onto a premium BrainPal card in real time, then continues into the
 * companion interview. The captured name is handed up so the rest of onboarding
 * doesn't ask for it again.
 *
 * Card face mirrors pay/screens/Card.tsx (grad-ink, sheen, chip, 1.586 ratio)
 * so the onboarding card and the real card feel like the same object.
 */
import { useState } from 'react'
import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { useAvatar, avatarDef } from '../../lib/avatar'
import { OnboardBackdrop } from './OnboardBackdrop'

export function NameCard({ role, onDone }: { role: 'parent' | 'kid'; onDone: (name: string) => void }) {
  const avatar = useAvatar((s) => s.avatar)
  const companion = avatarDef(avatar)
  const [name, setName] = useState('')

  const prompt = role === 'kid' ? "What's your name?" : 'What should we call you?'
  const hint = role === 'kid' ? "It'll go right on your very own BrainPal card." : 'Mum, Dad, Sarah — whatever your kids call you.'
  const printed = name.trim() || (role === 'kid' ? 'YOUR NAME' : 'YOUR NAME')
  const placeholder = role === 'kid' ? 'Your name' : 'e.g. Mum'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OnboardBackdrop accent={companion.accent} />

      {/* Header */}
      <div className="relative z-10 flex-none px-7 pt-8 text-center">
        <div className="pv-eyebrow" style={{ color: companion.accent }}>Your card</div>
        <h1 className="pv-h1 pv-tight mt-2">{prompt}</h1>
        <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>{hint}</p>
      </div>

      {/* Live card */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-7">
        <motion.div
          initial={{ opacity: 0, y: 18, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          className="pv-sheen relative w-full max-w-[360px] overflow-hidden rounded-[var(--pv-r-xl)] p-6"
          style={{ backgroundImage: 'var(--pv-grad-ink)', color: '#fff', boxShadow: 'var(--pv-shadow-lg)', aspectRatio: '1.586' }}
        >
          {/* companion-accent glow */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-[60px]" style={{ background: companion.accent, opacity: 0.45 }} />

          <div className="relative flex items-start justify-between">
            <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ opacity: 0.7 }}>Debit</span>
          </div>

          <div className="relative mt-5 h-8 w-11 rounded-md" style={{ background: 'rgba(255,255,255,0.22)' }} />

          <div className="pv-amount relative mt-4 text-lg tracking-[0.18em]" style={{ opacity: 0.9 }}>
            •••• •••• •••• ••••
          </div>

          <div className="relative mt-3 flex items-end justify-between text-xs font-bold" style={{ opacity: 0.92 }}>
            <span className="min-w-0 flex-1 truncate uppercase tracking-wide transition-opacity" style={{ opacity: name.trim() ? 1 : 0.45 }}>
              {printed}
            </span>
            <span className="ml-3 shrink-0" style={{ opacity: 0.8 }}>VALID THRU ••/••</span>
          </div>
        </motion.div>
      </div>

      {/* Name input + CTA */}
      <form
        onSubmit={(e) => { e.preventDefault(); const v = name.trim(); if (v) onDone(v) }}
        className="relative z-10 flex-none px-7 pb-[max(22px,env(safe-area-inset-bottom))] pt-2"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          maxLength={24}
          aria-label={prompt}
          className="pv-glass pv-hairline mb-3 h-14 w-full rounded-2xl px-5 text-center text-lg font-bold outline-none"
          style={{ color: 'var(--pv-ink)' }}
        />
        <motion.button
          type="submit"
          disabled={!name.trim()}
          whileTap={{ scale: 0.96 }}
          className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold disabled:opacity-40"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: name.trim() ? 'var(--pv-shadow-md)' : undefined }}
        >
          That's me
          <ChevronRight size={20} strokeWidth={2.6} />
        </motion.button>
      </form>
    </div>
  )
}
