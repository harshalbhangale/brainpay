/**
 * PalHero — the avatar-first hero for a Pal surface.
 * ───────────────────────────────────────────────────────────────────────────
 * Renders the EXISTING companion (`<Companion>` from the live session) for a
 * given Pal, floating over a soft accent glow, with a glass identity chip and an
 * optional glass caption line. This is the "linear glass" treatment the whole
 * product is trending toward — calm dark canvas, feather-soft glow, a single
 * character in focus. It intentionally reuses `lib/avatar.ts` avatars (no new
 * avatar system) via `palCharacters`.
 *
 * It is purely presentational: it renders a character, a name, and whatever
 * caption you hand it. The realtime/voice pipeline stays in `LiveSession`.
 */
import { Sparkles } from 'lucide-react'
import { Companion, type CompanionMood } from '../../components/Companion'
import { palCharacter } from './palCharacters'
import type { PalKey } from './config'

export function PalHero({
  pal,
  size = 'md',
  mood = 'happy',
  caption,
  getLevel,
  className,
}: {
  pal: PalKey
  /** Visual footprint of the avatar stage. */
  size?: 'sm' | 'md' | 'lg'
  mood?: CompanionMood
  /** Optional glass caption shown under the character (e.g. a greeting). */
  caption?: string
  /** Audio level source (0..1) when the avatar is speaking; drives lip-sync. */
  getLevel?: () => number
  className?: string
}) {
  const ch = palCharacter(pal)

  const stage =
    size === 'lg'
      ? { width: 'min(78vw, 320px)', height: 'min(46vh, 380px)' }
      : size === 'sm'
        ? { width: 156, height: 190 }
        : { width: 'min(64vw, 236px)', height: 'min(34vh, 288px)' }

  return (
    <div className={`flex flex-col items-center ${className ?? ''}`}>
      {/* Avatar stage — reused Companion over a feather-soft accent glow. */}
      <div className="relative flex items-end justify-center" style={stage}>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px]"
          style={{ background: ch.gradient, opacity: 0.32 }}
          aria-hidden
        />
        <Companion
          avatar={ch.avatar}
          mood={mood}
          getLevel={getLevel}
          className="pv-rise relative h-full w-full"
        />
      </div>

      {/* Identity chip — glass, linear. */}
      <div
        className="pv-rise pv-glass pv-hairline -mt-2 flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5"
        style={{ animationDelay: '60ms' }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundImage: ch.gradient, color: ch.onAccent }}
        >
          <Sparkles size={13} strokeWidth={2.6} />
        </span>
        <span className="text-[13px] font-bold" style={{ color: 'var(--pv-ink)' }}>
          {ch.palName}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
          {ch.characterName}
        </span>
      </div>

      {/* Optional glass caption. */}
      {caption && (
        <p
          className="pv-rise pv-body mt-3 max-w-xs text-center"
          style={{ animationDelay: '120ms', color: 'var(--pv-ink-2)' }}
        >
          {caption}
        </p>
      )}
    </div>
  )
}
