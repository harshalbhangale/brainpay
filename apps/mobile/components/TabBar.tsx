import { useEffect, useRef } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { House, Camera, Sparkle, CreditCard, ClipboardText, ShieldCheck, TrendUp } from 'phosphor-react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { haptic } from '@/lib/haptics'
import { tokens } from '@/theme/tokens'

export const TAB_BAR_TOTAL_HEIGHT = 100

type Props = BottomTabBarProps & {
  accent: string
  light?: boolean
}

export function HotstarTabBar({ state, navigation, accent, light }: Props) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const muted = light ? '#8A8DA3' : tokens.color.textMuted
  const kid = !!light

  const tabs = kid
    ? [
        { key: 'home', label: 'Home', icon: House, route: 'index' },
        { key: 'grow', label: 'Grow', icon: TrendUp, push: '/(app)/grow' },
        { key: 'pals', label: 'Pals', icon: Sparkle, route: 'pal', isCenter: true },
        { key: 'missions', label: 'Missions', icon: ClipboardText, push: '/(app)/chores' },
        { key: 'scan', label: 'Scan', icon: Camera, push: '/(app)/camera' },
      ]
    : [
        { key: 'home', label: 'Home', icon: House, route: 'index' },
        { key: 'accounts', label: 'Accounts', icon: CreditCard, push: '/(app)/transactions' },
        { key: 'pals', label: 'Pals', icon: Sparkle, route: 'pal', isCenter: true },
        { key: 'chores', label: 'Chores', icon: ClipboardText, push: '/(app)/parent-chores' },
        { key: 'safety', label: 'Safety', icon: ShieldCheck, push: '/(app)/family-safety' },
      ]

  const bottomOffset = Math.max(insets.bottom, 12)

  const renderTabs = () =>
    tabs.map((tab) => {
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
      if (tab.isCenter) {
        return <CenterButton key={tab.key} accent={accent} focused={focused} onPress={onPress} />
      }
      return (
        <TabItem key={tab.key} icon={tab.icon} label={tab.label} focused={focused} accent={accent} muted={muted} onPress={onPress} />
      )
    })

  return (
    <View style={[s.wrapper, { bottom: bottomOffset }]}>
      {Platform.OS === 'ios' && !light ? (
        <BlurView intensity={50} tint="dark" style={s.pill}>
          <View style={s.pillInner}>{renderTabs()}</View>
        </BlurView>
      ) : (
        <View style={[s.pill, light ? s.pillLight : s.pillAndroid]}>
          <View style={s.pillInner}>{renderTabs()}</View>
        </View>
      )}
    </View>
  )
}

type PhosphorIcon = React.ComponentType<{
  size?: number
  color?: string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}>

function TabItem({
  icon: Icon,
  label,
  focused,
  accent,
  muted,
  onPress,
}: {
  icon: PhosphorIcon
  label: string
  focused: boolean
  accent: string
  muted: string
  onPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.1 : 1,
      friction: 6,
      tension: 200,
      useNativeDriver: true,
    }).start()
  }, [focused, scale])

  return (
    <Pressable style={s.tab} onPress={onPress}>
      <Animated.View style={[s.tabIcon, { transform: [{ scale }] }]}>
        <Icon
          size={24}
          color={focused ? accent : muted}
          weight={focused ? 'fill' : 'duotone'}
        />
      </Animated.View>
      <Text style={[s.tabLabel, { color: muted }, focused && { color: accent, opacity: 1 }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function CenterButton({
  accent,
  focused,
  onPress,
}: {
  accent: string
  focused: boolean
  onPress: () => void
}) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }, [pulseAnim])

  return (
    <Pressable style={s.centerWrap} onPress={onPress}>
      {/* Glow ring */}
      <Animated.View
        style={[
          s.glowRing,
          { backgroundColor: accent, opacity: pulseAnim },
        ]}
      />
      {/* Main button */}
      <View style={s.centerBtn}>
        <LinearGradient
          colors={[accent, accent + 'CC']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <Sparkle size={26} color="#fff" weight="fill" />
      </View>
      <Text style={[s.centerLabel, { color: accent }]}>Pals</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  pill: {
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pillAndroid: {
    backgroundColor: 'rgba(16,16,22,0.92)',
  },
  pillLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(20,20,40,0.06)',
    shadowColor: '#3B2E8C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 16,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 8,
    minHeight: 70,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  tabIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.color.textMuted,
    opacity: 0.7,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: -32,
  },
  glowRing: {
    position: 'absolute',
    top: -4,
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  centerBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
})
