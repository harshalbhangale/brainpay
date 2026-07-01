/**
 * cardSkins — the customizable BrainPal card designs.
 * ───────────────────────────────────────────────────────────────────────────
 * Each skin is a gradient + a mascot glyph + chip/text treatment. The chosen
 * skin id persists in the card settings (`design`) via /cards, so it follows
 * the holder everywhere. Purely presentational.
 */
export type CardSkin = {
  id: string
  name: string
  /** CSS background-image for the card face. */
  gradient: string
  /** Text/foreground colour on the face. */
  fg: string
  /** EMV chip finish. */
  chip: 'gold' | 'silver'
  /** Mascot emoji — shown as a badge + a big faint watermark. */
  mascot: string
  /** VISA wordmark colour. */
  visa: string
  hero?: boolean
}

export const CARD_SKINS: CardSkin[] = [
  // ── Heroes ──
  { id: 'cap', name: 'Captain', gradient: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 40%,#b91c1c 100%)', fg: '#fff', chip: 'gold', mascot: '🛡️', visa: '#fff', hero: true },
  { id: 'iron', name: 'Iron', gradient: 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 45%,#f59e0b 100%)', fg: '#fff', chip: 'gold', mascot: '🤖', visa: '#fff', hero: true },
  { id: 'spider', name: 'Spider', gradient: 'linear-gradient(135deg,#b91c1c 0%,#1d4ed8 100%)', fg: '#fff', chip: 'silver', mascot: '🕷️', visa: '#fff', hero: true },
  { id: 'hulk', name: 'Hulk', gradient: 'linear-gradient(135deg,#166534 0%,#4d7c0f 45%,#6b21a8 100%)', fg: '#fff', chip: 'gold', mascot: '💪', visa: '#fff', hero: true },
  { id: 'thor', name: 'Thunder', gradient: 'linear-gradient(135deg,#0f172a 0%,#334155 45%,#38bdf8 100%)', fg: '#fff', chip: 'silver', mascot: '⚡', visa: '#fff', hero: true },
  { id: 'panther', name: 'Panther', gradient: 'linear-gradient(135deg,#0b0b12 0%,#241a3a 60%,#7c3aed 100%)', fg: '#fff', chip: 'silver', mascot: '🐾', visa: '#fff', hero: true },
  // ── Themes ──
  { id: 'ink', name: 'Midnight', gradient: 'var(--pv-grad-ink)', fg: '#fff', chip: 'gold', mascot: '✦', visa: '#fff' },
  { id: 'galaxy', name: 'Galaxy', gradient: 'linear-gradient(135deg,#0f172a 0%,#4c1d95 60%,#db2777 100%)', fg: '#fff', chip: 'silver', mascot: '🌌', visa: '#fff' },
  { id: 'neon', name: 'Neon', gradient: 'linear-gradient(135deg,#022c22 0%,#059669 50%,#a3e635 100%)', fg: '#04130c', chip: 'silver', mascot: '⚡', visa: '#04130c' },
  { id: 'sunset', name: 'Sunset', gradient: 'linear-gradient(135deg,#7c2d12 0%,#ea580c 45%,#fbbf24 100%)', fg: '#fff', chip: 'gold', mascot: '🌅', visa: '#fff' },
]

export function cardSkin(id?: string): CardSkin {
  return CARD_SKINS.find((s) => s.id === id) ?? CARD_SKINS.find((s) => s.id === 'ink')!
}
