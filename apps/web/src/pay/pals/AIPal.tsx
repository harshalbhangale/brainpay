/**
 * AIPal — the AI section of the app (a top-level Pal in the switcher).
 * ───────────────────────────────────────────────────────────────────────────
 * Renders the real multi-agent "money council" chat (wired to /chat) standalone,
 * i.e. with no back button — the Pal rail handles navigation. The camera
 * (point & ask) and voice (talk to Mika) live inside the chat composer and open
 * the real-time LiveSession, exactly like the original app.
 */
import { Chat } from '../screens/Chat'

export function AIPal() {
  return (
    <div className="pv-pal-enter flex min-h-0 flex-1 flex-col">
      <Chat />
    </div>
  )
}
