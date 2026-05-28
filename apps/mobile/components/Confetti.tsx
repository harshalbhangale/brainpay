import { useEffect, useRef } from 'react'
import { Animated, Dimensions, Easing, View, StyleSheet } from 'react-native'

/**
 * Confetti — pure React Native animated burst.
 * No native dependencies. Renders 30 colored dots that fly outward from
 * the center, then fade.
 *
 * Usage:
 *   <Confetti show={celebrating} onComplete={() => setCelebrating(false)} />
 */

const { width: SW, height: SH } = Dimensions.get('window')

const COLORS = ['#A855F7', '#3DDC84', '#3B82F6', '#FB923C', '#EC4899', '#FACC15']
const PARTICLE_COUNT = 30

type Props = {
  show: boolean
  onComplete?: () => void
}

export function Confetti({ show, onComplete }: Props) {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * Math.PI * 2,
      distance: 150 + Math.random() * 200,
    })),
  ).current

  useEffect(() => {
    if (!show) return

    const animations = particles.map((p) => {
      p.x.setValue(0)
      p.y.setValue(0)
      p.opacity.setValue(1)
      p.rotate.setValue(0)

      const dx = Math.cos(p.angle) * p.distance
      const dy = Math.sin(p.angle) * p.distance - 100 // bias upward

      return Animated.parallel([
        Animated.timing(p.x, {
          toValue: dx,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(p.y, {
          toValue: dy + 400, // gravity
          duration: 1500,
          easing: Easing.bezier(0.4, 0, 1, 1),
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 1500,
          delay: 600,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotate, {
          toValue: Math.random() * 4 - 2,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    })

    Animated.stagger(20, animations).start(() => {
      onComplete?.()
    })
  }, [show, particles, onComplete])

  if (!show) return null

  return (
    <View pointerEvents="none" style={s.root}>
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            s.particle,
            {
              backgroundColor: p.color,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                {
                  rotate: p.rotate.interpolate({
                    inputRange: [-2, 2],
                    outputRange: ['-360deg', '360deg'],
                  }),
                },
              ],
              opacity: p.opacity,
            },
          ]}
        />
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    top: SH / 2,
    left: SW / 2,
    width: 0,
    height: 0,
    zIndex: 9999,
  },
  particle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 2,
  },
})
