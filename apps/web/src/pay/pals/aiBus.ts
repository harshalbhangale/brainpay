/**
 * aiBus — a tiny command channel from the app shell to the AI chat.
 * ───────────────────────────────────────────────────────────────────────────
 * The side drawer lives in PalShell, but "New chat" / "Open history" must act
 * on the <Chat> deep inside AIPal. Rather than prop-drill through AIPal, the
 * drawer dispatches a command here and Chat registers a handler.
 *
 * Commands sent while Chat is unmounted (e.g. the user is on MoneyPal and taps
 * "New chat") are queued and flushed the moment Chat mounts after the Pal
 * switch, so the action never silently no-ops.
 */
export type AiCommand =
  | { type: 'new-chat' }
  | { type: 'resume'; sessionId: string }
  | { type: 'live'; camera: boolean }

type Handler = (cmd: AiCommand) => void

let handler: Handler | null = null
const queue: AiCommand[] = []

/** Chat calls this on mount; returns an unsubscribe for cleanup. */
export function registerAiHandler(next: Handler): () => void {
  handler = next
  if (queue.length) {
    const pending = queue.splice(0, queue.length)
    for (const cmd of pending) next(cmd)
  }
  return () => {
    if (handler === next) handler = null
  }
}

/** The drawer (or any shell control) dispatches a command to the AI chat. */
export function sendAiCommand(cmd: AiCommand): void {
  if (handler) handler(cmd)
  else queue.push(cmd)
}
