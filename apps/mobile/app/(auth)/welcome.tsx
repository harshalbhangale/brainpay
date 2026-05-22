import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { tokens } from '@/theme/tokens'

/**
 * Welcome screen — first thing a fresh install sees.
 * One CTA + one secondary link, both lead to the phone entry.
 */
export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.wordmark}>BrainPay</Text>
        <Text style={styles.tagline}>Money buddy for your family.</Text>
      </View>

      {/* CTAs */}
      <View style={styles.actions}>
        <Pressable
          style={styles.primary}
          onPress={() => router.push('/(auth)/phone')}
        >
          <Text style={styles.primaryText}>Get started</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/phone')}>
          <Text style={styles.secondary}>I have an account</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: tokens.spacing[5],
  },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  wordmark: {
    fontSize: 56,
    fontWeight: '900',
    color: tokens.color.text,
    letterSpacing: -1.5,
  },
  tagline: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.lg,
    marginTop: tokens.spacing[2],
    textAlign: 'center',
  },
  actions: { gap: tokens.spacing[4], paddingBottom: tokens.spacing[5] },
  primary: {
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  secondary: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    textAlign: 'center',
    paddingVertical: tokens.spacing[3],
  },
})
