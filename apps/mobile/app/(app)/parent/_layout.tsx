import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { ClipboardList, Home, MessageCircle, ScanLine } from 'lucide-react-native'
import { tokens } from '@/theme/tokens'

/**
 * Parent app layout — bottom tab bar.
 * Tabs: Home | Scan (raised) | Chores | Chat
 */
export default function ParentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tokens.color.surface,
          borderTopColor: tokens.color.surface2,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarActiveTintColor: tokens.color.accent,
        tabBarInactiveTintColor: tokens.color.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Home size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          href: '/(app)/camera',
          tabBarIcon: ({ focused }) => (
            <View style={[s.scanBtn, focused && s.scanBtnActive]}>
              <ScanLine size={22} color="#000" strokeWidth={2} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: 'Chores',
          tabBarIcon: ({ color, size }) => (
            <ClipboardList size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'PAL',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen name="topup"       options={{ href: null }} />
      <Tabs.Screen name="kid-detail"  options={{ href: null }} />
      <Tabs.Screen name="add-kid"     options={{ href: null }} />
      <Tabs.Screen name="invite-send" options={{ href: null }} />
      <Tabs.Screen name="feed"        options={{ href: null }} />
    </Tabs>
  )
}

const s = StyleSheet.create({
  scanBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  scanBtnActive: {
    shadowOpacity: 0.6,
  },
})
