import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'

/**
 * Animated PAL avatar — a glowing orb with two rotating rings + breath pulse.
 * Pure RN Animated, no external deps.
 *
 * States:
 *   - idle: gentle breath pulse, slow ring rotation
 *   - speaking: faster pulse, brighter glow
 *   - listening: red rim, paused rotation
 *   - thinking: slow rotation
 *   - celebrating: fast bouncy pulse
 */

export type PalState = 'idle' | 'speaking' | 'listening' | 'thinking' | 'celebrating'

type Props = {
  state: PalState
  accent?: string
  size?: number
}

export function PalAvatar({ state, accent = '#3DDC84', size = 140 }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current
  const rotateAnim = useRef(new Animated.Value(0)).current
  const glowAnim = useRef(new Animated.Value(0.5)).current

  // Breath / pulse
  useEffect(() => {
    const speed = state === 'speaking' ? 500 : state === 'celebrating' ? 350 : 1400
    const target = state === 'speaking' ? 1.08 : state === 'celebrating' ? 1.15 : 1.04
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: target,
          duration: speed,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: speed,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [state, pulseAnim])

  // Ring rotation
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null
    if (state !== 'listening') {
      loop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: state === 'speaking' ? 4000 : 12000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      )
      loop.start()
    }
    return () => loop?.stop()
  }, [state, rotateAnim])

  // Glow intensity
  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: state === 'speaking' || state === 'celebrating' ? 1 : 0.5,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [state, glowAnim])

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const reverseRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  })

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.25],
  })

  const isListening = state === 'listening'
  const rimColor = isListening ? '#FF5C5C' : accent
  const orbBg = isListening ? 'rgba(255,92,92,0.18)' : `${accent}22`

  return (
    <View style={[styles.container, { width: size * 1.6, height: size * 1.6 }]}>
      {/* Outer glow halo */}
      <Animated.View
        style={[
          styles.outerGlow,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
            backgroundColor: rimColor,
            opacity: glowOpacity,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />

      {/* Outer dashed ring — clockwise */}
      <Animated.View
        style={[
          styles.ringOuter,
          {
            width: size * 1.3,
            height: size * 1.3,
            borderRadius: size * 0.65,
            borderColor: rimColor + '66',
            transform: [{ rotate: rotateInterpolate }],
          },
        ]}
      />

      {/* Inner solid ring — counter-clockwise */}
      <Animated.View
        style={[
          styles.ringInner,
          {
            width: size * 1.15,
            height: size * 1.15,
            borderRadius: size * 0.575,
            borderColor: rimColor + '33',
            transform: [{ rotate: reverseRotate }],
          },
        ]}
      />

      {/* The orb */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: orbBg,
            borderColor: rimColor,
            shadowColor: rimColor,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Simple expressive face — emoji avoids platform-specific text issues */}
        <Text style={[styles.faceText, { color: rimColor }]} allowFontScaling={false}>
          {state === 'celebrating' ? '◠ ◠' : state === 'listening' ? '· ·' : '● ●'}
        </Text>
        <View
          style={[
            styles.mouth,
            {
              backgroundColor: rimColor,
              width: state === 'speaking' ? 36 : 24,
              height: state === 'speaking' ? 8 : 4,
            },
          ]}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
  },
  ringOuter: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  ringInner: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  faceText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 8,
    marginBottom: 10,
  },
  mouth: {
    borderRadius: 4,
  },
})
