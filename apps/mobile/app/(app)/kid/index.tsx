import { useRouter } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Kid home — placeholder. Task 8 fills this with balance, goal, streak,
 * activity, and the 4-button action row.
 */
export default function KidHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)

  const onSignOut = () => {
    Alert.alert(
      'Sign out?',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut()
            router.replace('/(auth)/welcome')
          },
        },
      ],
      { cancelable: true },
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Hey 👋</Text>
        <Pressable hitSlop={12} onPress={onSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.balance}>0 🧠</Text>
      <Pressable style={styles.cta} onPress={() => router.push('/(app)/camera')}>
        <Text style={styles.ctaText}>📷 Scan & earn</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg },
  signOut: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600' },
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
