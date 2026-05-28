import { Tabs, useRouter } from 'expo-router'
import { View } from 'react-native'
import {
  Camera,
  Home,
  MessageCircle,
  ShoppingBag,
} from 'lucide-react-native'
import { tokens } from '@/theme/tokens'

/**
 * Kid app layout — custom bottom tab bar.
 *
 * Tabs: Home | Scan (raised green) | PAL | Cart
 *
 * The center Scan button is raised above the bar with a glow shadow.
 * Active tabs show a small accent dot below the icon.
 */
export default function KidLayout() {
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
              <Home
                size={22}
                color={color}
                strokeWidth={focused ? 2 : 1.5}
              />
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
        name="camera-tab"
        options={{
          title: '',
          href: '/(app)/camera',
          tabBarIcon: () => (
            <View style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: tokens.color.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              shadowColor: tokens.color.accent,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
              elevation: 10,
            }}>
              <Camera size={24} color="#000" strokeWidth={2} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'PAL',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center' }}>
              <MessageCircle
                size={22}
                color={color}
                strokeWidth={focused ? 2 : 1.5}
              />
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
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center' }}>
              <ShoppingBag
                size={22}
                color={color}
                strokeWidth={focused ? 2 : 1.5}
              />
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
      <Tabs.Screen name="chores"       options={{ href: null }} />
      <Tabs.Screen name="chore-verify" options={{ href: null }} />
      <Tabs.Screen name="checkout-nfc" options={{ href: null }} />
      <Tabs.Screen name="goals"        options={{ href: null }} />
    </Tabs>
  )
}
