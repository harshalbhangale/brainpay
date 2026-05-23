import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Role selection — only seen by brand-new users without a pending invite.
 * Two paths: become a parent and set up a family, OR enter an invite code
 * that someone sent you. (Kids never sign up directly — they always come
 * in via an invite, so there's no "I'm a kid" option.)
 */
export default function RoleSelect() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)

  const onSignOut = async () => {
    await signOut()
    router.replace('/(auth)/welcome')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Welcome to BrainPay</Text>
        <Text style={styles.subtitle}>Which one are you?</Text>

        <View style={styles.cards}>
          <Pressable
            style={[styles.card, styles.cardParent]}
            onPress={() => router.push('/(auth)/parent-persona')}
          >
            <Text style={styles.cardEmoji}>👨‍👩‍👧</Text>
            <Text style={styles.cardTitle}>I'm a parent</Text>
            <Text style={styles.cardSub}>Set up money for your kid</Text>
          </Pressable>

          <Pressable
            style={[styles.card, styles.cardInvite]}
            onPress={() => router.push('/(auth)/invite-accept')}
          >
            <Text style={styles.cardEmoji}>✉️</Text>
            <Text style={styles.cardTitle}>I have an invite</Text>
            <Text style={styles.cardSub}>Joining your family</Text>
          </Pressable>
        </View>

        <Pressable hitSlop={12} onPress={onSignOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  title: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2],
  },
  cards: {
    flex: 1,
    justifyContent: 'center',
    gap: tokens.spacing[4],
  },
  card: {
    padding: tokens.spacing[5],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardParent: { borderColor: 'rgba(168, 85, 247, 0.3)' }, // purple hint
  cardInvite: { borderColor: 'rgba(61, 220, 132, 0.3)' }, // green hint
  cardEmoji: { fontSize: 40 },
  cardTitle: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
    marginTop: tokens.spacing[3],
  },
  cardSub: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[1],
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: tokens.spacing[3],
  },
  signOutText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
})
