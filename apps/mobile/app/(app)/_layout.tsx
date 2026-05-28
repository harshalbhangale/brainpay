import { Stack } from 'expo-router'
import { useRealtimeWallet } from '@/hooks/useRealtimeWallet'

/**
 * Authed app layout. Subscribes to realtime updates so balance, ledger,
 * and chore changes propagate live across screens.
 */
export default function AppLayout() {
  // Live updates for ledger + chores → invalidates React Query caches.
  useRealtimeWallet()

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
  )
}
