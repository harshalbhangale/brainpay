/**
 * CardOrder — the "make your card real" moment before the voice interview.
 * ───────────────────────────────────────────────────────────────────────────
 * The user personalises their BrainPal Visa (pick a skin, see their name print
 * on it live) and "orders" it — we then play a delivery confirmation ("on its
 * way to your home"). The chosen skin + name persist to the account's card
 * settings (`design`/`label`) so the same card shows up everywhere afterwards.
 *
 * Presentational only — BrainPal has no card processor; the PAN/expiry/CVV are
 * deterministic per holder and never real credentials.
 */
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, ChevronRight, Nfc, PackageCheck, Truck, Home, Sparkles } from 'lucide-react'
import { useAvatar, avatarDef } from '../../lib/avatar'
import { useAuthStore } from '../../stores/auth'
import { useCardSettings } from '../../lib/card'
import { CARD_SKINS, cardSkin, type CardSkin } from '../lib/cardSkins'
import { OnboardBackdrop } from './OnboardBackdrop'

type Phase = 'design' | 'ordered'

/** A self-contained card face for onboarding (no data fetch) — mirrors CardFace. */
function PreviewCard({ skin, name }: { skin: CardSkin; name: string }) {
  const printed = (name.trim() || 'YOUR NAME').toUpperCase()
  return (
    <div
      className="pv-sheen relative overflow-hidden rounded-[var(--pv-r-xl)] p-5"
      style={{ backgroundImage: skin.gradient, color: skin.fg, boxShadow: 'var(--pv-shadow-lg)', aspectRatio: '1.586' }}
    >
      {skin.image && (
        <>
          <img src={skin.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.55))' }} />
        </>
      )}
      {!skin.image && (
        <span aria-hidden className="pointer-events-none absolute -bottom-6 -right-3 select-none" style={{ fontSize: 128, lineHeight: 1, opacity: 0.16 }}>{skin.mascot}</span>
      )}

      <div className="relative flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ opacity: 0.75 }}>Debit</span>
      </div>

      <div className="relative mt-4 flex items-center gap-3">
        <span className="h-8 w-11 rounded-md" style={{ background: skin.chip === 'gold' ? 'linear-gradient(135deg,#f7e08a,#b8860b)' : 'linear-gradient(135deg,#eef2f7,#9aa3af)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }} />
        <Nfc size={20} style={{ opacity: 0.85, transform: 'rotate(90deg)' }} />
        {skin.hero && <span className="ml-auto text-2xl leading-none">{skin.mascot}</span>}
      </div>

      <div className="pv-amount relative mt-3 text-lg tracking-[0.16em]" style={{ opacity: 0.92 }}>•••• •••• •••• ••••</div>

      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold tracking-wide transition-opacity" style={{ opacity: name.trim() ? 1 : 0.5 }}>{printed}</div>
          <div className="mt-0.5 text-[11px] font-bold" style={{ opacity: 0.85 }}>VALID THRU ••/••</div>
        </div>
        <span className="text-2xl font-black italic leading-none tracking-tight" style={{ color: skin.visa }}>VISA</span>
      </div>
    </div>
  )
}

export function CardOrder({ role, name, onDone }: { role: 'parent' | 'kid'; name?: string; onDone: () => void }) {
  const avatar = useAvatar((s) => s.avatar)
  const companion = avatarDef(avatar)
  const accountId = useAuthStore((s) => s.account?.id) ?? ''
  const [, updateCard] = useCardSettings(accountId)

  const [skinId, setSkinId] = useState<string>('ink')
  const [phase, setPhase] = useState<Phase>('design')
  const skin = useMemo(() => cardSkin(skinId), [skinId])
  const holder = name?.trim() || 'You'

  function order() {
    // Persist the chosen skin + printed name so the card is the same everywhere.
    updateCard({ design: skinId, label: name?.trim() || '' })
    setPhase('ordered')
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OnboardBackdrop accent={companion.accent} />

      <AnimatePresence mode="wait">
        {phase === 'design' ? (
          <motion.div key="design" className="relative z-10 flex min-h-0 flex-1 flex-col" exit={{ opacity: 0 }}>
            {/* Header */}
            <div className="flex-none px-7 pt-8 text-center">
              <div className="pv-eyebrow" style={{ color: companion.accent }}>Your card</div>
              <h1 className="pv-h1 pv-tight mt-2">Design your card</h1>
              <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>Pick a look — then we’ll ship it to your door.</p>
            </div>

            {/* Live preview */}
            <div className="flex min-h-0 flex-1 items-center justify-center px-7">
              <AnimatePresence mode="wait">
                <motion.div
                  key={skinId}
                  initial={{ opacity: 0, y: 14, rotateX: 8 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: 'spring', stiffness: 140, damping: 16 }}
                  className="w-full max-w-[360px]"
                >
                  <PreviewCard skin={skin} name={holder} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Skin gallery */}
            <div className="flex-none px-5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="pv-label">Choose a design</span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{skin.name}</span>
              </div>
              <div className="pv-no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
                {CARD_SKINS.map((s) => {
                  const active = s.id === skinId
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSkinId(s.id)}
                      aria-pressed={active}
                      aria-label={s.name}
                      className="pv-press relative h-16 w-24 shrink-0 overflow-hidden rounded-2xl"
                      style={{ backgroundImage: s.gradient, boxShadow: active ? `0 0 0 3px var(--pv-bg), 0 0 0 5px ${companion.accent}` : 'var(--pv-shadow-sm)' }}
                    >
                      {s.image && <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                      {!s.image && <span className="absolute bottom-1 right-1.5 text-lg" style={{ opacity: 0.9 }}>{s.mascot}</span>}
                      {active && (
                        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: companion.accent, color: '#fff' }}>
                          <Check size={12} strokeWidth={3.2} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* CTA */}
            <div className="flex-none px-7 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
              <motion.button
                onClick={order}
                whileTap={{ scale: 0.96 }}
                className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
                style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
              >
                <PackageCheck size={19} /> Order my card
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ordered" className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Card tucking into delivery */}
            <div className="relative mb-6 w-full max-w-[320px]">
              <motion.div
                initial={{ y: 0, scale: 1, rotate: 0 }}
                animate={{ y: [0, -8, 4], scale: [1, 1, 0.98], rotate: [0, -2, 1] }}
                transition={{ duration: 1.1, ease: 'easeInOut' }}
              >
                <PreviewCard skin={skin} name={holder} />
              </motion.div>
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 15 }}
                className="absolute -bottom-3 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full"
                style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}
              >
                <Check size={28} strokeWidth={3} />
              </motion.span>
            </div>

            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="pv-h1 pv-tight text-center">
              Your card is on its way!
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="pv-body mt-1.5 text-center" style={{ color: 'var(--pv-ink-2)' }}>
              We’re shipping the {skin.name} card to your home. In the meantime, it’s ready to use in the app.
            </motion.p>

            {/* Delivery details */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="pv-glass pv-hairline mt-5 w-full max-w-sm rounded-[var(--pv-r-lg)] px-4 py-3">
              <Row icon={<Truck size={16} />} label="Arriving in 3–5 business days" />
              <Row icon={<Home size={16} />} label={`Delivered to ${holder}’s home address`} />
              <Row icon={<Sparkles size={16} />} label="Free delivery • Instantly active in-app" last />
            </motion.div>

            {/* Continue */}
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              onClick={onDone}
              whileTap={{ scale: 0.96 }}
              className="pv-sheen mt-6 flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full text-base font-bold"
              style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
            >
              Meet {companion.name}
              <ChevronRight size={20} strokeWidth={2.6} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Row({ icon, label, last }: { icon: React.ReactNode; label: string; last?: boolean }) {
  return (
    <div className="flex items-center gap-3" style={last ? undefined : { marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--pv-line)' }}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>{icon}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
    </div>
  )
}
