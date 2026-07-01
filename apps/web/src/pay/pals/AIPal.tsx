/**
 * AIPal — the conversational home of the app (a top-level Pal in the switcher).
 * ───────────────────────────────────────────────────────────────────────────
 * Renders the unified, avatar-first PalSurface: one screen fronted by the
 * chosen Pal's character (reused Companion avatar), wired to the real
 * multi-agent "money council" chat (`/chat`) plus live voice/camera
 * (LiveSession) from a single composer. Switching character is one tap.
 */
import { PalSurface } from './PalSurface'

export function AIPal() {
  return <PalSurface />
}
