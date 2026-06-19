import { RevealHome } from '@/components/home/RevealHome'

/**
 * Home — the chat-first agent surface. After onboarding, users land here.
 * The Pals chat is primary; Money panel (swipe down) and Surfaces drawer
 * (swipe left) reveal everything else.
 */
export default function HomeTab() {
  return <RevealHome />
}
