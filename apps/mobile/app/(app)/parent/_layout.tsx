import { Tabs } from 'expo-router'
import { View } from 'react-native'
import {
  ClipboardList,
  Home,
  MessageCircle,
  ScanLine,
} from 'lucide-react-native'
import { tokens } from '@/theme/tokens'

/**
 * Parent app layout — custom bottom tab bar.
 *
 * Tabs: Home | Scan (raised purple) | Chores | PAL
 *
 * The center Scan button is raised above the bar with a purple glow.
 * Active tabs show a small accent dot below the icon.
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
          height: 72,
          paddingBottom: 10,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: tokens.color.accent,
        tabBarInactiveTintColor: tokens.color.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center' }}>
              <Home size={22} color={color} strokeWidth={focused ? 2 : 1.5} />
              {focused && (
                <View style={{
                  position: 'absolute',
                  bottom: -6,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tokens.color.accent,
                }} />
              )}
            </View>
          ),
        }}
      />

      {/* Raised scan button */}
      <Tabs.Screen
        name="scan-tab"
        options={{
          title: '',
          href: '/(app)/camera',
          tabBarIcon: () => (
            <View style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: tokens.color.purple,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              shadowColor: tokens.color.purple,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
              elevation: 10,
            }}>
              <ScanLine size={24} color="#fff" strokeWidth={2} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />

      <Tabs.Screen
        name="chores"
        options={{
          title: 'Chores',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center' }}>
              <ClipboardList size={22} color={color} strokeWidth={focused ? 2 : 1.5} />
              {focused && (
                <View style={{
                  position: 'absolute',
                  bottom: -6,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tokens.color.accent,
                }} />
              )}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'PAL',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center' }}>
              <MessageCircle size={22} color={color} strokeWidth={focused ? 2 : 1.5} />
              {focused && (
                <View style={{
                  position: 'absolute',
                  bottom: -6,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tokens.color.accent,
                }} />
              )}
            </View>
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
