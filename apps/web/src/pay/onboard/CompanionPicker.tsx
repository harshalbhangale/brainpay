/**
 * CompanionPicker — the "meet your BrainPal" step. Shows a live preview of the
 * selected companion (VRoid GLB or VRM, via <Companion>) with a row of all
 * characters to choose from, plus a voice chooser. Both selections persist
 * immediately (useAvatar / useVoicePrefs) so they flow to every screen.
 */
import { motion } from 'motion/react'
import { ChevronRight, Check } from 'lucide-react'
import { Companion } from '../../components/Companion'
import { AVATARS, useAvatar } from '../../lib/avatar'
import { VOICE_OPTIONS, useVoicePrefs } from '../../lib/voicePrefs'

export function CompanionPicker({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const { avatar, setAvatar } = useAvatar()
  const { voice, setVoice } = useVoicePrefs()
  const current = AVATARS.find((a) => a.id === avatar) ?? AVATARS[0]

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* soft accent wash from the selected companion */}
      <motion.div
        className="absolute inset-x-0 top-0 z-0 h-1/2"
        aria-hidden
        animate={{ background: `radial-gradient(80% 70% at 50% 0%, ${current.accent}33, transparent 75%)` }}
        transition={{ duration: 0.5 }}
      />

      {/* Header */}
      <div className="relative z-10 flex-none px-7 pt-6 text-center">
        <div className="pv-eyebrow" style={{ color: current.accent }}>Your companion</div>
        <h1 className="pv-h1 pv-tight mt-2">Pick your BrainPal</h1>
        <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>
          {role === 'kid' ? 'Choose a buddy and a voice — you can change them anytime.' : 'Choose the companion and voice your family will chat with.'}
        </p>
      </div>

      {/* Live preview */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="relative" style={{ width: 'min(72vw, 280px)', height: 'min(42vh, 360px)' }}>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[70px]"
            style={{ background: current.accent, opacity: 0.28 }}
          />
          <Companion key={current.id} avatar={current.id} mood="happy" className="relative h-full w-full" />
          <motion.div
            key={`name-${current.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pv-glass pv-hairline absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-center"
          >
            <span className="pv-title pv-tight">{current.name}</span>
            <span className="ml-2 text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>{current.blurb}</span>
          </motion.div>
        </div>
      </div>

      {/* Scrollable choices */}
      <div className="pv-no-scrollbar relative z-10 flex-none overflow-y-auto px-5" style={{ maxHeight: '40vh' }}>
        {/* Companion chips */}
        <div className="pv-no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 pt-1">
          {AVATARS.map((a) => {
            const active = a.id === avatar
            return (
              <button
                key={a.id}
                onClick={() => setAvatar(a.id)}
                className="pv-press relative flex w-[88px] flex-none flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center"
                style={active
                  ? { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-md)', outline: `2px solid ${a.accent}` }
                  : { background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: a.accent }}
                >
                  {a.name[0]}
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--pv-ink)' }}>{a.name}</span>
                {active && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: a.accent, color: '#fff' }}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Voice chooser */}
        <div className="mt-4">
          <div className="pv-label mb-2">Pick a voice</div>
          <div className="flex flex-wrap gap-2 pb-2">
            {VOICE_OPTIONS.map((v) => {
              const active = v.key === voice
              return (
                <button
                  key={v.key}
                  onClick={() => setVoice(v.key)}
                  className={`pv-press flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-bold ${active ? '' : 'pv-glass pv-hairline'}`}
                  style={active ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { color: 'var(--pv-ink)' }}
                  aria-pressed={active}
                >
                  <span className="text-base">{v.emoji}</span>
                  <span className="text-left leading-tight">
                    {v.label}
                    <span className="block text-[10px] font-medium opacity-70">{v.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="px-1 text-[11px]" style={{ color: 'var(--pv-ink-3)' }}>
            StudyPal interviews always use a warm tutor voice. Voices lean Australian.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 flex-none px-7 pb-[max(22px,env(safe-area-inset-bottom))] pt-3">
        <motion.button
          onClick={onDone}
          whileTap={{ scale: 0.96 }}
          className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
        >
          Meet {current.name}
          <ChevronRight size={20} strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  )
}
