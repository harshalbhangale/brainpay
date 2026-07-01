/**
 * Cute cartoon avatars for the family — offline, deterministic, zero hosted assets.
 * ───────────────────────────────────────────────────────────────────────────
 * Uses DiceBear (@dicebear/core + @dicebear/collection) entirely on-device to
 * turn a stable seed (an account id or name) into a friendly, consistent
 * cartoon face. Output is an SVG data-URI, which the existing `Avatar` primitive
 * already renders as an <img> — so these drop in with no primitive changes.
 *
 * Usage:
 *   familyFace(seed, photo, style)  → photo if it's a real image, else a cartoon
 *   cartoonAvatarUri(seed, style)   → always a cartoon data-URI (for pickers)
 */
import { createAvatar, type Style } from '@dicebear/core'
import { adventurer, bigSmile, funEmoji, micah, notionists, openPeeps } from '@dicebear/collection'

export type CartoonStyleId = 'bigSmile' | 'adventurer' | 'funEmoji' | 'micah' | 'openPeeps' | 'notionists'

// The styles we offer in the picker — a curated set of HAPPY, HUMAN-like faces
// so the family always feels like one cohesive, cheerful cast.
export const CARTOON_STYLES: { id: CartoonStyleId; label: string }[] = [
  { id: 'bigSmile', label: 'Big Smile' },
  { id: 'adventurer', label: 'Adventurer' },
  { id: 'openPeeps', label: 'Peeps' },
  { id: 'micah', label: 'Micah' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLE_MAP: Record<CartoonStyleId, Style<any>> = {
  bigSmile,
  adventurer,
  funEmoji,
  micah,
  openPeeps,
  notionists,
}

// Per-style options that bias the face toward a happy, smiling expression.
// Unknown/invalid options are guarded by a try/catch in cartoonAvatarUri.
const HAPPY_OPTS: Partial<Record<CartoonStyleId, Record<string, unknown>>> = {
  micah: { mouth: ['smile', 'laughing'] },
  openPeeps: { face: ['smile', 'smileBig', 'cheeky'] },
  bigSmile: { mouth: ['openedSmile', 'unimpressed', 'gapSmile'] },
}

// Soft pastel circle backgrounds (hex without the leading '#', as DiceBear wants)
// so every cartoon sits on a calm, premium-feeling tile that fits the .pv theme.
const PASTEL_BGS = ['ffd9e3', 'd6f5e3', 'fff0c9', 'e7ddff', 'ffe1cc', 'd9ecff', 'f6d9ff', 'd7f0f5']

/** Deterministic small hash of a seed → stable index. */
function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

/** A happy, human default face for a given seed (users can still pick others). */
export function defaultStyleFor(_seed: string): CartoonStyleId {
  // bigSmile is always a smiling, human-like face — the safest "happy" default.
  return 'bigSmile'
}

/**
 * True when `src` is a real picture (uploaded photo / hosted image / blob),
 * as opposed to an emoji glyph or being empty. Mirrors the Avatar primitive's
 * image test but excludes SVG data-URIs so our own cartoons never count as
 * "the user's photo".
 */
export function isPhoto(src?: string | null): boolean {
  if (!src) return false
  if (/^data:image\/svg\+xml/i.test(src)) return false // that's a cartoon, not a photo
  return /^(data:image\/|https?:|blob:|\/)/i.test(src)
}

// Memoize generated URIs — the SVG for a (style, seed) pair never changes.
const cache = new Map<string, string>()

/** Always returns a cute cartoon data-URI for the given seed + optional style. */
export function cartoonAvatarUri(seed: string, style?: CartoonStyleId): string {
  const styleId = style ?? defaultStyleFor(seed)
  const key = `${styleId}::${seed}`
  const hit = cache.get(key)
  if (hit) return hit

  const bg = PASTEL_BGS[hash(seed) % PASTEL_BGS.length]
  const base = { seed, radius: 50, scale: 88, backgroundColor: [bg], backgroundType: ['solid'] as const }
  let uri: string
  try {
    // Prefer a smiling, happy expression where the style supports it.
    uri = createAvatar(STYLE_MAP[styleId], { ...base, ...(HAPPY_OPTS[styleId] ?? {}) }).toDataUri()
  } catch {
    // Invalid option for this style → fall back to the style's defaults.
    uri = createAvatar(STYLE_MAP[styleId], base).toDataUri()
  }

  cache.set(key, uri)
  return uri
}

/**
 * The one helper family surfaces use: show the real photo when there is one,
 * otherwise fall back to a cute, consistent cartoon seeded by `seed`.
 */
export function familyFace(seed: string, photo?: string | null, style?: CartoonStyleId): string {
  return isPhoto(photo) ? (photo as string) : cartoonAvatarUri(seed, style)
}
