import { Stack } from 'expo-router'
import { kidTheme } from '@/theme/tokens'

/**
 * Auth flow: every step a fullscreen card. Navigation is push-based so
 * users can swipe back where it makes sense.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: kidTheme.color.bg },
      }}
    />
  )
}
