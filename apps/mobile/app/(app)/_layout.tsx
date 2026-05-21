import { Tabs } from 'expo-router'
import { tokens } from '@/theme/tokens'

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: tokens.color.surface, borderTopColor: tokens.color.surface2 },
        tabBarActiveTintColor: tokens.color.accent,
        tabBarInactiveTintColor: tokens.color.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
      <Tabs.Screen name="camera" options={{ href: null }} />
      <Tabs.Screen name="topup" options={{ href: null }} />
    </Tabs>
  )
}
