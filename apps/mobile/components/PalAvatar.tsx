import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

/**
 * Animated PAL avatar — a glowing orb with rotating rings + pulse.
 * Pure RN Animated, no external deps.
 *
 * States:
 *   - idle: gentle pulse, slow ring rotation
 *   - speaking: faster pulse, brighter glow, eyes "talk" via dot animation
 *   - listening: red rim, paused rotation, mic icon
 *   - thinking: dots above the orb
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
  const glowAnim = useRef(new Animated.Value(0.6)).current
  const mouthAnim = useRef(new Animated.Value(0)).current
  const eyeBlinkAnim = useRef(new Animated.Value(1)).current

  // Breath / pulse
  useEffect(() => {
    const speed = state === 'speaking' ? 600 : state === 'celebrating' ? 400 : 1400
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
    if (state === 'listening') return
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: state === 'speaking' ? 4000 : 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [state, rotateAnim])

  // Glow intensity
  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: state === 'speaking' || state === 'celebrating' ? 1 : 0.5,
      duration: 400,
      useNativeDriver: false,
    }).start()
  }, [state, glowAnim])

  // Mouth animation when speaking
  useEffect(() => {
    if (state !== 'speaking') {
      mouthAnim.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(mouthAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(mouthAnim, { toValue: 0.3, duration: 180, useNativeDriver: true }),
        Animated.timing(mouthAnim, { toValue: 0.7, duration: 180, useNativeDriver: true }),
        Animated.timing(mouthAnim, { toValue: 0.1, duration: 180, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [state, mouthAnim])

  // Eye blinks (random)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const scheduleBlink = () => {
      timeout = setTimeout(() => {
        Animated.sequence([
          Animated.timing(eyeBlinkAnim, { toValue: 0.1, duration: 80, useNativeDriver: true }),
          Animated.timing(eyeBlinkAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start(() => scheduleBlink())
      }, 2000 + Math.random() * 3000)
    }
    scheduleBlink()
    return () => clearTimeout(timeout)
  }, [eyeBlinkAnim])

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const reverseRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  })

  const rimColor = state === 'listening' ? '#FF5C5C' : accent
  const orbBg = state === 'listening' ? 'rgba(255,92,92,0.18)' : `${accent}22`

  return (
    <View style={[styles.container, { width: size * 1.6, height: size * 1.6 }]}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.outerGlow,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
            backgroundColor: rimColor,
            opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] }),
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />

      {/* Outer rotating ring with dots */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 1.3,
            height: size * 1.3,
            borderRadius: size * 0.65,
            borderColor: rimColor + '55',
            transform: [{ rotate: rotateInterpolate }],
          },
        ]}
      >
        {[0, 90, 180, 270].map((deg) => (
          <View
            key={deg}
            style={[
              styles.ringDot,
              {
                backgroundColor: rimColor,
                top: '50%',
                left: '50%',
                transform: [
                  { translateX: -3 },
                  { translateY: -3 },
                  { rotate: `${deg}deg` },
                  { translateY: -size * 0.65 },
                ],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Inner reverse-rotating ring */}
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

      {/* The orb itself */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: orbBg,
            borderColor: rimColor,
            transform: [{ scale: pulseAnim }],
            shadowColor: rimColor,
          },
        ]}
      >
        {/* Eyes */}
        <View style={styles.face}>
          <Animated.View
            style={[
              styles.eye,
              {
                backgroundColor: rimColor,
                transform: [{ scaleY: eyeBlinkAnim }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.eye,
              {
                backgroundColor: rimColor,
                transform: [{ scaleY: eyeBlinkAnim }],
              },
            ]}
          />
        </View>

        {/* Mouth — animates when speaking */}
        <Animated.View
          style={[
            styles.mouth,
            {
              backgroundColor: rimColor,
              transform: [{ scaleY: mouthAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) }],
              opacity: state === 'speaking' ? 1 : 0.5,
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
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  ringDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ringInner: {
    position: 'absolute',
    borderWidth: 1,
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  face: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 14,
  },
  eye: {
    width: 12,
    height: 14,
    borderRadius: 6,
  },
  mouth: {
    width: 30,
    height: 6,
    borderRadius: 3,
  },
})
