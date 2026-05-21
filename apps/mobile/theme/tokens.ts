/**
 * BrainPal design tokens.
 * Single source of truth — Detailed Spec § 1.6.
 */
export const tokens = {
  color: {
    bg: '#0B0B0F',
    surface: '#16161D',
    surface2: '#1F1F2A',
    text: '#F5F5F7',
    textMuted: '#8E8E9A',
    accent: '#3DDC84', // earn green
    danger: '#FF5C5C', // spend red
    coin: '#FFB627', // gold coin
  },
  radius: { sm: 8, md: 14, lg: 20, pill: 999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 8: 48 },
  font: { display: 'InterDisplay', body: 'Inter' },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, '2xl': 40, hero: 56 },
} as const

export type Tokens = typeof tokens
