import { useRouter } from 'expo-router'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Role selection — anime-style cards for parent vs kid (invite).
 * Tapping "I'm a parent" → voice onboarding with PAL.
 * Tapping "I have an invite" → invite-accept code entry.
 */

const parentCard = require('@/assets/images/parentcard.png')
const kidCard = require('@/assets/images/kidcard.png')

export default function RoleSelect() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)

  const onSignOut = async () => {
    await signOut()
    router.replace('/(auth)/welcome')
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + tokens.spacing[4], paddingBottom: insets.bottom }]}>
      <Text style={s.title}>Welcome to BrainPay</Text>
      <Text style={s.subtitle}>Which one are you?</Text>

      <View style={s.cards}>
        <Pressable
          style={({ pressed }) => [s.card, pressed && s.cardPressed]}
          onPress={() => router.push('/(auth)/parent-onboarding')}
        >
          <Image source={parentCard} style={s.cardImage} resizeMode="cover" />
          <View style={s.cardOverlay}>
            <Text style={s.cardTitle}>I'm a parent</Text>
            <Text style={s.cardSub}>Set up money for your kid</Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [s.card, pressed && s.cardPressed]}
          onPress={() => router.push('/(auth)/invite-accept')}
        >
          <Image source={kidCard} style={s.cardImage} resizeMode="cover" />
          <View style={s.cardOverlay}>
            <Text style={s.cardTitle}>I have an invite</Text>
            <Text style={s.cardSub}>Joining your family</Text>
          </View>
        </Pressable>
      </View>

      <Pressable hitSlop={12} onPress={onSignOut} style={s.signOut}>
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  title: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
    marginTop: tokens.spacing[3],
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
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    backgroundColor: tokens.color.surface,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  cardOverlay: {
    padding: tokens.spacing[4],
    backgroundColor: tokens.color.surface,
  },
  cardTitle: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
  cardSub: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[1],
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: tokens.spacing[3],
    marginBottom: tokens.spacing[3],
  },
  signOutText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
})
