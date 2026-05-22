import { Stack } from 'expo-router'

/**
 * Kid app layout. Bottom tabs come online in Task 8 (Home / Scan / Feed / Me).
 */
export default function KidLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
    />
  )
}
