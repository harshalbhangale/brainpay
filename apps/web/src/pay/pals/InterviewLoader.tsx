/**
 * InterviewLoader — the delightful "connecting" state for the AI interview.
 * ───────────────────────────────────────────────────────────────────────────
 * A living illustration (breathing tutor orb + radiating sonar rings + a halo
 * of orbiting sparkles) under a rotating set of status messages, so the wait
 * never reads as a dull spinner. Used both for the pre-flight "starting" phase
 * and the in-call "connecting to the tutor" overlay.
 *
 * Two visual modes via `variant`:
 *  - 'light' (default): sits on the app's light canvas (the starting screen).
 *  - 'dark':  sits on the full-bleed dark call surface (the connecting overlay).
 */
import { useEffect, useState } from 'react'
import { GraduationCap, Sparkles } from 'lucide-react'

const DEFAULT_MESSAGES = [
  'Connecting you to your tutor…',
  'Warming up the camera & mic…',
  'Skimming your lesson notes…',
  'Lining up your questions…',
  'Setting the room just right…',
  'Almost ready — sit up tall! ✨',
]

export function InterviewLoader({
  messages = DEFAULT_MESSAGES,
  variant = 'light',
  className = '',
}: {
  messages?: string[]
  variant?: 'light' | 'dark'
  className?: string
}) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 2200)
    return () => clearInterval(t)
  }, [messages.length])

  const dark = variant === 'dark'
  const titleColor = dark ? '#fff' : 'var(--pv-ink)'
  const subColor = dark ? 'rgba(255,255,255,0.66)' : 'var(--pv-ink-3)'

  return (
    <div className={`flex flex-1 flex-col items-center justify-center px-8 text-center ${className}`}>
      <CallOrb dark={dark} />

      {/* Rotating status — keyed so each message re-animates in. */}
      <div className="mt-9 flex h-7 items-center justify-center">
        <p key={idx} className="pv-msg-in text-base font-extrabold" style={{ color: titleColor }}>
          {messages[idx % messages.length]}
        </p>
      </div>

      {/* Progress dots */}
      <div className="mt-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="pv-dot-pulse h-1.5 w-1.5 rounded-full"
            style={{ background: dark ? 'rgba(255,255,255,0.7)' : 'var(--pv-accent)', animationDelay: `${i * 180}ms` }}
          />
        ))}
      </div>

      <p className="mt-5 max-w-[16rem] text-xs font-medium" style={{ color: subColor }}>
        Speak clearly and explain your thinking out loud — there are no wrong tries here.
      </p>
    </div>
  )
}

/** The animated centerpiece: orb + sonar rings + orbiting sparkles. */
function CallOrb({ dark }: { dark: boolean }) {
  const ringColor = dark ? 'rgba(255,255,255,0.45)' : 'var(--pv-accent)'
  // Six sparkles evenly spaced around the orbit ring.
  const sparkles = Array.from({ length: 6 })

  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      {/* Radiating sonar rings */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="pv-radiate absolute h-28 w-28 rounded-full"
          style={{ border: `2px solid ${ringColor}`, animationDelay: `${i * 0.9}s` }}
        />
      ))}

      {/* Orbiting halo of sparkles */}
      <div className="pv-orbit absolute inset-0">
        {sparkles.map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{ transform: `rotate(${i * 60}deg) translateY(-84px)` }}
          >
            <span
              className="pv-twinkle block h-2 w-2 rounded-full"
              style={{
                background: dark ? '#fff' : 'var(--pv-accent)',
                boxShadow: dark ? '0 0 10px rgba(255,255,255,0.7)' : '0 0 10px var(--pv-accent)',
                animationDelay: `${i * 0.3}s`,
              }}
            />
          </span>
        ))}
      </div>

      {/* The breathing tutor orb */}
      <div
        className="pv-breathe relative flex h-24 w-24 items-center justify-center rounded-[32px]"
        style={{ backgroundImage: 'var(--pv-grad-accent)', boxShadow: 'var(--pv-shadow-pop)', color: 'var(--pv-on-accent)' }}
      >
        <GraduationCap size={40} strokeWidth={2.1} />
        <span className="pv-bob absolute -right-1.5 -top-1.5">
          <Sparkles size={20} style={{ color: dark ? '#fff' : 'var(--pv-accent-2)' }} fill="currentColor" />
        </span>
      </div>
    </div>
  )
}
