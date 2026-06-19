import { Stack } from 'expo-router'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * The home group no longer hosts a bottom tab bar. The chat-first home
 * (`RevealHome`) is the single screen here; every other surface is reached
 * through its gesture-revealed Money panel / Surfaces drawer, or pushed onto
 * the parent (app) stack.
 */
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color.bg },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  )
}
