import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { Camera, Home, MessageCircle, ShoppingBag } from 'lucide-react-native'
import { tokens } from '@/theme/tokens'

/**
 * Kid app layout — bottom tab bar.
 * Tabs: Home | Scan (raised) | Chat | Cart
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
        name="camera"
        options={{
          title: 'Scan',
          href: '/(app)/camera',
          tabBarIcon: ({ focused }) => (
            <View style={[s.scanBtn, focused && s.scanBtnActive]}>
              <Camera size={22} color="#000" strokeWidth={2} />
            </View>
          ),
          tabBarLabel: () => null,
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
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, size }) => (
            <ShoppingBag size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      {/* Hidden screens — accessible via router.push but not in tab bar */}
      <Tabs.Screen name="chores"       options={{ href: null }} />
      <Tabs.Screen name="chore-verify" options={{ href: null }} />
      <Tabs.Screen name="checkout-nfc" options={{ href: null }} />
      <Tabs.Screen name="goals"        options={{ href: null }} />
    </Tabs>
  )
}

const s = StyleSheet.create({
  scanBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: tokens.color.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  scanBtnActive: {
    backgroundColor: tokens.color.accent,
    shadowOpacity: 0.6,
  },
})
