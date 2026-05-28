import { ChatScreen } from '../kid/chat'

/**
 * Parent PAL chat — same component as kid, just role flag changes
 * suggestion chips. Server-side, the chat API auto-detects parent vs kid
 * from the JWT and provides appropriate context.
 */
export default function ParentChat() {
  return <ChatScreen role="parent" />
}
