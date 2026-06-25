/**
 * MoneyPal design tokens (TypeScript mirror of theme.css).
 *
 * Use these when you need brand values inside JS/TSX (e.g. dynamic styles,
 * chart colors, the pastel tile palette). The single source of truth for CSS
 * remains `theme.css`; keep these in sync.
 */

/** Pastel tile families used by ActionTile / category chips. */
export const PASTELS = {
  sky: { bg: 'var(--pv-sky)', ink: 'var(--pv-sky-ink)' },
  mint: { bg: 'var(--pv-mint)', ink: 'var(--pv-mint-ink)' },
  butter: { bg: 'var(--pv-butter)', ink: 'var(--pv-butter-ink)' },
  lilac: { bg: 'var(--pv-lilac)', ink: 'var(--pv-lilac-ink)' },
  peach: { bg: 'var(--pv-peach)', ink: 'var(--pv-peach-ink)' },
  blush: { bg: 'var(--pv-blush)', ink: 'var(--pv-blush-ink)' },
} as const

export type Pastel = keyof typeof PASTELS

/** Brand color references (CSS variable strings, resolved within `.pv`). */
export const COLOR = {
  ink: 'var(--pv-ink)',
  ink2: 'var(--pv-ink-2)',
  ink3: 'var(--pv-ink-3)',
  surface: 'var(--pv-surface)',
  surface2: 'var(--pv-surface-2)',
  primary: 'var(--pv-primary)',
  onPrimary: 'var(--pv-on-primary)',
  accent: 'var(--pv-accent)',
  pos: 'var(--pv-pos)',
  neg: 'var(--pv-neg)',
  line: 'var(--pv-line)',
} as const

export const RADIUS = {
  sm: 'var(--pv-r-sm)',
  md: 'var(--pv-r-md)',
  lg: 'var(--pv-r-lg)',
  xl: 'var(--pv-r-xl)',
  pill: 'var(--pv-r-pill)',
} as const
