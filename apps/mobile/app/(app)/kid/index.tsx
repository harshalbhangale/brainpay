import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { tokens } from '@/theme/tokens'

/**
 * Kid home — placeholder. Task 8 fills this with balance, goal, streak,
 * activity, and the 4-button action row.
 */
export default function KidHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
      <Text style={styles.title}>Hey 👋</Text>
      <Text style={styles.balance}>0 🧠</Text>
      <Pressable style={styles.cta} onPress={() => router.push('/(app)/camera')}>
        <Text style={styles.ctaText}>📷 Scan & earn</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg },
  balance: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.hero,
    fontWeight: '800',
    marginTop: tokens.spacing[5],
  },
  cta: {
    height: 56,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing[6],
  },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
