import { Stack } from 'expo-router'

/**
 * Prototype layout: single fullscreen camera route.
 * Tabs come back when we re-introduce dashboard + profile.
 */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
  )
}
