import { Tabs } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { HotstarTabBar } from '@/components/TabBar'
import { tokens, kidTheme } from '@/theme/tokens'

export default function TabsLayout() {
  const accountType = useAuthStore((s) => s.accountType)
  const isKid = accountType === 'kid'
  const accent = isKid ? kidTheme.color.purple : tokens.color.purple

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <HotstarTabBar {...props} accent={accent} light={isKid} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="pal" options={{ title: 'PAL' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
    </Tabs>
  )
}
