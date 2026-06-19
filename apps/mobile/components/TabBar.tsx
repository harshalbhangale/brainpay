import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { House, Camera, Sparkle, CreditCard, ClipboardText, ShieldCheck, MapPin } from 'phosphor-react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { haptic } from '@/lib/haptics'

export const TAB_BAR_TOTAL_HEIGHT = 96

type PhosphorIcon = React.ComponentType<{ size?: number; color?: string; weight?: 'regular' | 'fill' }>

type Props = BottomTabBarProps & {
  accent: string
  light?: boolean
}

export function HotstarTabBar({ state, navigation, accent, light }: Props) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const muted = '#8A8DA3'
  const kid = !!light

  const tabs: { key: string; label: string; Icon: PhosphorIcon; route?: string; push?: string }[] = kid
    ? [
        { key: 'home', label: 'Home', Icon: House, route: 'index' },
        { key: 'find', label: 'Find', Icon: MapPin, push: '/(app)/family-safety' },
        { key: 'pals', label: 'Pals', Icon: Sparkle, route: 'pal' },
        { key: 'missions', label: 'Missions', Icon: ClipboardText, push: '/(app)/chores' },
        { key: 'scan', label: 'Scan', Icon: Camera, push: '/(app)/camera' },
      ]
    : [
        { key: 'home', label: 'Home', Icon: House, route: 'index' },
        { key: 'accounts', label: 'Accounts', Icon: CreditCard, push: '/(app)/transactions' },
        { key: 'pals', label: 'Pals', Icon: Sparkle, route: 'pal' },
        { key: 'chores', label: 'Chores', Icon: ClipboardText, push: '/(app)/parent-chores' },
        { key: 'safety', label: 'Safety', Icon: ShieldCheck, push: '/(app)/family-safety' },
      ]

  const bottomOffset = Math.max(insets.bottom, 12)

  return (
    <View style={[s.wrapper, { bottom: bottomOffset }]}>
      <View style={s.pill}>
        {tabs.map((tab) => {
          const routeIndex = tab.route ? state.routes.findIndex((r) => r.name === tab.route) : -1
          const focused = routeIndex >= 0 && state.index === routeIndex
          const onPress = () => {
            haptic.select()
            if (tab.push) {
              router.push(tab.push as never)
              return
            }
            const route = state.routes[routeIndex]
            if (!route) return
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
          }
          return (
            <TabItem key={tab.key} Icon={tab.Icon} label={tab.label} focused={focused} accent={accent} muted={muted} onPress={onPress} />
          )
        })}
      </View>
    </View>
  )
}

function TabItem({
  Icon,
  label,
  focused,
  accent,
  muted,
  onPress,
}: {
  Icon: PhosphorIcon
  label: string
  focused: boolean
  accent: string
  muted: string
  onPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.spring(scale, { toValue: focused ? 1.12 : 1, friction: 6, tension: 220, useNativeDriver: true }).start()
  }, [focused, scale])

  const color = focused ? accent : muted

  return (
    <Pressable style={s.tab} onPress={onPress} hitSlop={6}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon size={24} color={color} weight={focused ? 'fill' : 'regular'} />
      </Animated.View>
      <Text style={[s.label, { color }]}>{label}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 6,
    shadowColor: '#103A33',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
})
