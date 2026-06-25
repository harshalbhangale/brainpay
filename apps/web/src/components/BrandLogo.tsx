import { Sparkles } from 'lucide-react'

/**
 * BrainPal brand lockup — a rounded gradient mark + wordmark.
 * `markOnly` renders just the badge (for tight spaces / app icon).
 */
export function BrandLogo({ size = 28, markOnly = false }: { size?: number; markOnly?: boolean }) {
  const mark = (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-[30%] text-white glow-accent"
      style={{
        width: size,
        height: size,
        backgroundImage: 'var(--grad-accent-bright)',
      }}
    >
      <Sparkles size={size * 0.58} strokeWidth={2.4} fill="currentColor" />
    </span>
  )

  if (markOnly) return mark

  return (
    <span className="flex items-center gap-2">
      {mark}
      <span className="text-[17px] font-extrabold leading-none tracking-tight text-ink">
        Brain<span className="text-grad-accent">Pal</span>
      </span>
    </span>
  )
}
