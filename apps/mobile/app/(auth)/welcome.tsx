import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { kidTheme as tokens } from '@/theme/tokens'
import { Lottie } from '@/components/Lottie'

const { width, height } = Dimensions.get('window')

/**
 * Welcome screen — full-bleed dark hero with animated gradient orbs,
 * large wordmark, and two CTAs.
 */
export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Floating orb animations
  const orb1Y = useRef(new Animated.Value(0)).current
  const orb2Y = useRef(new Animated.Value(0)).current
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()

    // Orb float loops
    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Y, { toValue: -18, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orb1Y, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Y, { toValue: 14, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orb2Y, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start()
  }, [])

  return (
    <View style={s.root}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#FFFFFF', '#F3F4FA', '#EEF0FA']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Floating orbs */}
      <Animated.View style={[s.orb1, { transform: [{ translateY: orb1Y }] }]}>
        <LinearGradient
          colors={['#A855F740', 'transparent']}
          style={s.orbGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>
      <Animated.View style={[s.orb2, { transform: [{ translateY: orb2Y }] }]}>
        <LinearGradient
          colors={['#3DDC8440', 'transparent']}
          style={s.orbGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      <Animated.View style={[s.content, { opacity: fadeIn, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, tokens.spacing[5]) }]}>
        {/* Hero section */}
        <View style={s.hero}>
          <Lottie name="coinBurst" size={140} loop style={{ marginBottom: 4 }} />
          {/* Logo mark */}
          <View style={s.logoMark}>
            <LinearGradient
              colors={['#7B61FF', '#2D9CFF']}
              style={s.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Text style={s.logoChar}>B</Text>
          </View>

          <Text style={s.wordmark}>BrainPal</Text>
          <Text style={s.tagline}>Money smarts for the whole family.</Text>

          {/* Feature pills */}
          <View style={s.pills}>
            <FeaturePill label="Earn & Save" color={tokens.color.accent} />
            <FeaturePill label="Smart Chores" color={tokens.color.purple} />
            <FeaturePill label="Family Goals" color={tokens.color.blue} />
          </View>
        </View>

        {/* CTAs */}
        <View style={s.actions}>
          <Pressable
            style={({ pressed }) => [s.primary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={() => router.push('/(auth)/phone')}
          >
            <LinearGradient
              colors={['#A855F7', '#7C3AED']}
              style={s.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            <Text style={s.primaryText}>Get started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/(auth)/phone')}
          >
            <Text style={s.secondaryText}>I already have an account</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  )
}

function FeaturePill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[fp.pill, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <View style={[fp.dot, { backgroundColor: color }]} />
      <Text style={[fp.text, { color }]}>{label}</Text>
    </View>
  )
}
const fp = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: tokens.fontSize.xs, fontWeight: '700', letterSpacing: 0.3 },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },

  orb1: {
    position: 'absolute',
    top: height * 0.1,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    overflow: 'hidden',
  },
  orb2: {
    position: 'absolute',
    top: height * 0.35,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
  },
  orbGradient: { flex: 1 },

  content: { flex: 1, paddingHorizontal: tokens.spacing[5] },

  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacing[4],
  },

  logoMark: {
    width: 80,
    height: 80,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[2],
  },
  logoGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  logoChar: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },

  wordmark: {
    fontSize: tokens.fontSize.hero,
    fontWeight: '900',
    color: tokens.color.text,
    letterSpacing: -2,
  },
  tagline: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.lg,
    textAlign: 'center',
    lineHeight: 26,
  },

  pills: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: tokens.spacing[2],
  },

  actions: { gap: tokens.spacing[3], paddingBottom: tokens.spacing[2] },

  primary: {
    height: 58,
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: tokens.fontSize.md,
    letterSpacing: 0.2,
  },

  secondary: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
    fontWeight: '600',
  },
})
