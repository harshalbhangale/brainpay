/**
 * CompanionPicker — the "meet your BrainPal" moment, designed as an experience:
 * a big live portrait of the selected companion with a soft accent aura, an
 * oversized display-type name, and a refined voice gallery where each voice can
 * be heard ("Hi, I'm Archie…") before you choose. Selections persist instantly
 * (useAvatar / useVoicePrefs) so they flow to every screen.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronLeft, ChevronRight, Check, Volume2, Loader2 } from 'lucide-react'
import { Companion } from '../../components/Companion'
import { AVATARS, useAvatar, type AvatarId } from '../../lib/avatar'
import { VOICE_OPTIONS, useVoicePrefs, type VoiceKey } from '../../lib/voicePrefs'
import { env } from '../../lib/env'
import { OnboardBackdrop } from './OnboardBackdrop'

export function CompanionPicker({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const { avatar, setAvatar } = useAvatar()
  const { voice, setVoice } = useVoicePrefs()
  const idx = Math.max(0, AVATARS.findIndex((a) => a.id === avatar))
  const current = AVATARS[idx] ?? AVATARS[0]

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<VoiceKey | null>(null)
  const [loading, setLoading] = useState<VoiceKey | null>(null)

  useEffect(() => () => { try { audioRef.current?.pause() } catch { /* ignore */ } }, [])

  function step(delta: number) {
    const next = AVATARS[(idx + delta + AVATARS.length) % AVATARS.length]
    setAvatar(next.id as AvatarId)
  }

  function previewVoice(key: VoiceKey) {
    setVoice(key)
    try { audioRef.current?.pause() } catch { /* ignore */ }
    const url = `${env.apiBaseUrl}/voice/sample?voice=${encodeURIComponent(key)}&name=${encodeURIComponent(current.name)}`
    const a = new Audio(url)
    audioRef.current = a
    setLoading(key)
    setPlaying(null)
    a.onplaying = () => { setLoading(null); setPlaying(key) }
    a.onended = () => setPlaying((p) => (p === key ? null : p))
    a.onerror = () => { setLoading((l) => (l === key ? null : l)); setPlaying((p) => (p === key ? null : p)) }
    a.play().catch(() => { setLoading(null); setPlaying(null) })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OnboardBackdrop accent={current.accent} />

      {/* Header */}
      <div className="relative z-10 flex-none px-7 pt-6 text-center">
        <div className="pv-eyebrow" style={{ color: current.accent }}>Meet your BrainPal</div>
      </div>

      {/* Stage: chevrons + live portrait */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center gap-1 px-3">
        <button onClick={() => step(-1)} aria-label="Previous companion" className="pv-press pv-glass pv-hairline flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ color: 'var(--pv-ink-2)' }}>
          <ChevronLeft size={22} />
        </button>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3/5 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[64px]"
            style={{ background: current.accent, opacity: 0.3 }}
          />
          <div className="relative h-full w-full" style={{ maxHeight: 'min(46vh, 380px)' }}>
            <Companion key={current.id} avatar={current.id} mood="happy" className="relative h-full w-full" />
          </div>
        </div>

        <button onClick={() => step(1)} aria-label="Next companion" className="pv-press pv-glass pv-hairline flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ color: 'var(--pv-ink-2)' }}>
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Name + blurb on a floating glass plate (oversized display type) */}
      <div className="relative z-10 flex-none px-6">
        <div className="pv-glass pv-hairline mx-auto max-w-[360px] rounded-[var(--pv-r-lg)] px-6 py-4 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1
                className="pv-tight leading-none"
                style={{ fontFamily: 'var(--pv-font-display)', fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(2.3rem, 10vw, 3.2rem)', color: 'var(--pv-ink)' }}
              >
                {current.name}
              </h1>
              <p className="mt-1.5 text-sm font-semibold" style={{ color: 'var(--pv-ink-2)' }}>{current.blurb}</p>
            </motion.div>
          </AnimatePresence>

          {/* position dots */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {AVATARS.map((a, k) => (
              <button
                key={a.id}
                onClick={() => setAvatar(a.id)}
                aria-label={a.name}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: k === idx ? 22 : 7, background: k === idx ? current.accent : 'var(--pv-line-strong)' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Voice gallery */}
      <div className="pv-no-scrollbar relative z-10 mt-4 flex-none overflow-y-auto px-5" style={{ maxHeight: '26vh' }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="pv-label">Pick a voice</span>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Tap to hear</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pb-1">
          {VOICE_OPTIONS.map((v) => {
            const active = v.key === voice
            const isPlaying = playing === v.key
            const isLoading = loading === v.key
            return (
              <button
                key={v.key}
                onClick={() => previewVoice(v.key)}
                aria-pressed={active}
                className={`pv-press flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left ${active ? '' : 'pv-glass pv-hairline'}`}
                style={active ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { color: 'var(--pv-ink)' }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base" style={active ? { background: 'rgba(255,255,255,0.22)' } : { background: 'var(--pv-surface-2)' }}>
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : isPlaying ? <Volume2 size={14} className="animate-pulse" /> : <span>{v.emoji}</span>}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-bold">{v.label}</span>
                  <span className="block truncate text-[10px] font-medium opacity-70">{v.desc}</span>
                </span>
                {active && <Check size={15} strokeWidth={3} className="shrink-0" />}
              </button>
            )
          })}
        </div>
        <p className="px-1 pt-1.5 text-[11px]" style={{ color: 'var(--pv-ink-3)' }}>
          StudyPal interviews always use a warm tutor voice.
        </p>
      </div>

      {/* CTA */}
      <div className="relative z-10 flex-none px-7 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <motion.button
          onClick={() => { try { audioRef.current?.pause() } catch { /* ignore */ } onDone() }}
          whileTap={{ scale: 0.96 }}
          className="pv-sheen flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
        >
          Choose {current.name}
          <ChevronRight size={20} strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  )
}
