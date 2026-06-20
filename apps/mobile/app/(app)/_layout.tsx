import { Stack } from 'expo-router'
import { useRealtimeWallet } from '@/hooks/useRealtimeWallet'
import { kidTheme as tokens } from '@/theme/tokens'

export default function AppLayout() {
  useRealtimeWallet()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color.bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="camera" />
      <Stack.Screen name="live" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="chores" />
      <Stack.Screen name="chore-verify" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="card-detail" />
      <Stack.Screen name="family-safety" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout-nfc" />
      <Stack.Screen name="topup" />
      <Stack.Screen name="kid-detail" />
      <Stack.Screen name="add-kid" />
      <Stack.Screen name="parent-chores" />
      <Stack.Screen name="invite-send" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="study-home" />
      <Stack.Screen name="study-topic" />
      <Stack.Screen name="study-new-topic" />
      <Stack.Screen name="study-review" />
    </Stack>
  )
}
