import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { tokens } from '@/theme/tokens'

/**
 * Custom tab bar — replaces the default Expo tab bar.
 *
 * Design:
 *   - Floating pill shape, not full-width
 *   - Deep surface background with subtle top border
 *   - Active tab: accent-colored icon + label
 *   - Center tab: raised circle button (scan/camera)
 *   - No labels on center tab
 *   - Smooth active indicator dot under active tab
 */

type TabConfig = {
  name: string
  label: string
  icon: (active: boolean) => React.ReactNode
  isCenter?: boolean
}

type Props = BottomTabBarProps & {
  tabs: TabConfig[]
}

export function CustomTabBar({ state, navigation, tabs }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[s.wrapper, { paddingBottom: insets.bottom }]}>
      <View style={s.bar}>
        {tabs.map((tab, i) => {
          const route = state.routes.find((r) => r.name === tab.name)
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name)
          const focused = state.index === routeIndex

          const onPress = () => {
            if (!route) return
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          if (tab.isCenter) {
            return (
              <Pressable key={tab.name} style={s.centerWrap} onPress={onPress}>
                <View style={[s.centerBtn, focused && s.centerBtnActive]}>
                  {tab.icon(focused)}
                </View>
              </Pressable>
            )
          }

          return (
            <Pressable key={tab.name} style={s.tab} onPress={onPress}>
              <View style={s.tabInner}>
                {tab.icon(focused)}
                <Text style={[s.label, focused && s.labelActive]}>
                  {tab.label}
                </Text>
                {focused && <View style={s.activeDot} />}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface2,
    paddingTop: 8,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
    minHeight: 64,
  },

  // Regular tab
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
  },
  tabInner: {
    alignItems: 'center',
    gap: 3,
    position: 'relative',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.color.textMuted,
    letterSpacing: 0.3,
  },
  labelActive: {
    color: tokens.color.accent,
    fontWeight: '700',
  },
  activeDot: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.accent,
  },

  // Center raised button
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
  },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    // Raised effect
    shadowColor: tokens.color.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
    // Lift above the bar
    marginTop: -20,
  },
  centerBtnActive: {
    shadowOpacity: 0.65,
    transform: [{ scale: 1.05 }],
  },
})
