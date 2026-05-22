import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { tokens } from '@/theme/tokens'

/**
 * Reusable sliding wizard — horizontal page transitions, progress dots,
 * back arrow, continue button. Used by every multi-step onboarding flow
 * (parent persona, kid persona, family create, top-up, checkout, add-kid).
 *
 * The parent owns step state via `step` + `onStepChange` so steps can
 * gate Continue with their own validation (`canContinue`).
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export type SlidingWizardProps = {
  steps: ReactNode[]
  step: number
  onStepChange: (step: number) => void
  canContinue: boolean
  continueLabel?: string
  onComplete: () => void
  onBack?: () => void                  // tapped on first step
  /** Optional accent color override (defaults to tokens.color.accent). */
  accent?: string
}

export function SlidingWizard({
  steps,
  step,
  onStepChange,
  canContinue,
  continueLabel,
  onComplete,
  onBack,
  accent = tokens.color.accent,
}: SlidingWizardProps) {
  const insets = useSafeAreaInsets()
  const translateX = useRef(new Animated.Value(-step * SCREEN_WIDTH)).current
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setIsAnimating(true)
    Animated.timing(translateX, {
      toValue: -step * SCREEN_WIDTH,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setIsAnimating(false))
  }, [step, translateX])

  const goBack = () => {
    if (isAnimating) return
    if (step === 0) onBack?.()
    else onStepChange(step - 1)
  }

  const goNext = () => {
    if (!canContinue || isAnimating) return
    if (step === steps.length - 1) onComplete()
    else onStepChange(step + 1)
  }

  const isLast = step === steps.length - 1

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar: back arrow + progress dots */}
      <View style={styles.topBar}>
        <Pressable hitSlop={16} onPress={goBack} style={styles.backBtn}>
          {(step > 0 || onBack) && <Text style={styles.backChevron}>‹</Text>}
        </Pressable>

        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step && [styles.dotActive, { backgroundColor: accent }],
              ]}
            />
          ))}
        </View>

        <View style={styles.backBtn} /> {/* spacer to balance back arrow */}
      </View>

      {/* Sliding content */}
      <View style={styles.viewport}>
        <Animated.View
          style={[
            styles.track,
            {
              width: SCREEN_WIDTH * steps.length,
              transform: [{ translateX }],
            },
          ]}
        >
          {steps.map((node, i) => (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              {node}
            </View>
          ))}
        </Animated.View>
      </View>

      {/* Continue button */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + tokens.spacing[3] }]}>
        <Pressable
          onPress={goNext}
          disabled={!canContinue}
          style={[
            styles.cta,
            { backgroundColor: accent },
            !canContinue && styles.ctaDisabled,
          ]}
        >
          <Text style={[styles.ctaText, !canContinue && styles.ctaTextDisabled]}>
            {isLast ? continueLabel ?? 'Done' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backChevron: {
    color: tokens.color.text,
    fontSize: 32,
    lineHeight: 32,
    fontWeight: '300',
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.surface2,
  },
  dotActive: { width: 18 },
  viewport: { flex: 1, overflow: 'hidden' },
  track: { flexDirection: 'row', flex: 1 },
  slide: { paddingHorizontal: tokens.spacing[5], justifyContent: 'flex-start' },
  bottom: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[3],
  },
  cta: {
    height: 56,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: tokens.color.surface2 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  ctaTextDisabled: { color: tokens.color.textMuted },
})
