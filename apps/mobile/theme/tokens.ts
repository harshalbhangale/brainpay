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
    coin: '#FFB627',   // gold coin
    // Kid accent palette
    purple: '#A855F7',
    blue: '#3B82F6',
    orange: '#FB923C',
    pink: '#EC4899',
    yellow: '#FACC15',
    // Traffic lights
    trafficGreen: '#3DDC84',
    trafficAmber: '#F59E0B',
    trafficRed: '#EF4444',
  },
  radius: { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 8: 48 },
  // Stacking order for the gesture-revealed home (chat → panels → scrim → drawer).
  z: { base: 0, chat: 1, grabber: 5, panel: 20, scrim: 30, sheet: 40, drawer: 50 },
  font: { display: 'InterDisplay', body: 'Inter' },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, '2xl': 40, hero: 56 },
  // Icon sizes — use with lucide-react-native
  iconSize: {
    xs:   16,  // badge / status indicators
    sm:   18,  // input field icons
    md:   20,  // list row icons
    lg:   22,  // action row buttons
    xl:   24,  // tab bar
    hero: 48,  // empty states / hero sections
  },
} as const

export type Tokens = typeof tokens

/**
 * Kid platform theme — light, cool, Snapchat-style.
 * Same shape as `tokens` so kid-only screens can flip by aliasing the import:
 *   import { kidTheme as tokens } from '@/theme/tokens'
 */
export const kidTheme = {
  ...tokens,
  color: {
    ...tokens.color,
    bg: '#F2F6F4',        // mint white
    surface: '#FFFFFF',
    surface2: '#E6EDEA',  // light teal-gray fill / hairline
    text: '#16201D',      // near-black
    textMuted: '#7C8B86', // muted slate-green
    primary: '#0E7C66',   // dark teal — filled buttons (use with white text)
    accent: '#23C08A',    // bright green (black-text-safe) — success / earn
    danger: '#FF5C5C',
    coin: '#FF9F1C',
    purple: '#7B61FF',
    blue: '#2D9CFF',
    orange: '#FF9F43',
    pink: '#FF5FA2',
    yellow: '#FFD60A',
    trafficGreen: '#23C08A',
    trafficAmber: '#F59E0B',
    trafficRed: '#EF4444',
    positive: '#23C08A',  // incoming / +amounts
    negative: '#FF7A3D',  // outgoing / -amounts
  },
} as const

/** Soft light-theme card shadows (spread into a style). */
export const shadow = {
  sm: { shadowColor: '#103A33', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  md: { shadowColor: '#103A33', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  lg: { shadowColor: '#103A33', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 22, elevation: 8 },
} as const
