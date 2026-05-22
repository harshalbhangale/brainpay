import { Stack } from 'expo-router'

/**
 * Parent app layout. Bottom tabs come online in Task 11 once the per-kid
 * detail + PAL feed screens exist.
 */
export default function ParentLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
    />
  )
}
