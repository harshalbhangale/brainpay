import React, { useEffect, useRef } from 'react'
import { Animated, Easing, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { kidTheme as t, shadow } from '@/theme/tokens'

/** Full-screen light container. Set `scroll` for a ScrollView body. */
export function Screen({
  children,
  scroll,
  padded = true,
  contentStyle,
}: {
  children: React.ReactNode
  scroll?: boolean
  padded?: boolean
  contentStyle?: ViewStyle
}) {
  const insets = useSafeAreaInsets()
  const pad = padded ? { paddingHorizontal: t.spacing[5] } : null
  if (scroll) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[pad, { paddingBottom: insets.bottom + t.spacing[8] }, contentStyle]}
        >
          {children}
        </ScrollView>
      </View>
    )
  }
  return <View style={[s.root, pad, { paddingTop: insets.top }, contentStyle]}>{children}</View>
}

/** White rounded card with a soft light shadow. */
export function Card({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>
}

/** Fade + slide-up entrance (built-in Animated, no external deps). */
export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode
  delay?: number
  style?: ViewStyle
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(14)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY, delay])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  )
}

/** Staggered entrance for a list of children. */
export function Stagger({
  children,
  base = 60,
  step = 70,
}: {
  children: React.ReactNode
  base?: number
  step?: number
}) {
  return (
    <>
      {React.Children.map(children, (child, i) => (
        <FadeIn delay={base + i * step}>{child}</FadeIn>
      ))}
    </>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.color.bg },
  card: {
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    padding: t.spacing[4],
    ...shadow.md,
  },
})
