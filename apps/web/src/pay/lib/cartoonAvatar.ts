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

// The styles we offer in the picker. Kept to a curated, kid-friendly set so the
// family always feels like one cohesive, cute cast.
export const CARTOON_STYLES: { id: CartoonStyleId; label: string }[] = [
  { id: 'bigSmile', label: 'Big Smile' },
  { id: 'adventurer', label: 'Adventurer' },
  { id: 'funEmoji', label: 'Fun Emoji' },
  { id: 'micah', label: 'Micah' },
  { id: 'openPeeps', label: 'Peeps' },
  { id: 'notionists', label: 'Doodle' },
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

// Soft pastel circle backgrounds (hex without the leading '#', as DiceBear wants)
// so every cartoon sits on a calm, premium-feeling tile that fits the .pv theme.
const PASTEL_BGS = ['ffd9e3', 'd6f5e3', 'fff0c9', 'e7ddff', 'ffe1cc', 'd9ecff', 'f6d9ff', 'd7f0f5']

/** Deterministic small hash of a seed → stable index. */
function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

/** A stable, unique-feeling default style for a given seed. */
export function defaultStyleFor(seed: string): CartoonStyleId {
  return CARTOON_STYLES[hash(seed) % CARTOON_STYLES.length].id
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
  const uri = createAvatar(STYLE_MAP[styleId], {
    seed,
    radius: 50, // circular crop to match the round Avatar frame
    scale: 88,
    backgroundColor: [bg],
    backgroundType: ['solid'],
  }).toDataUri()

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
