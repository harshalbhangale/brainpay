import { useRouter } from 'expo-router'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Role selection — full anime art on top, accent gradient + label at the bottom.
 * Tapping "I'm a parent" → voice onboarding with PAL.
 * Tapping "I'm a kid" → invite-accept code entry (kids only join via invite).
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
      <View style={s.header}>
        <Text style={s.title}>Welcome to BrainPay</Text>
        <Text style={s.subtitle}>Pick your side.</Text>
      </View>

      <View style={s.cards}>
        <RoleCard
          image={parentCard}
          title="I'm a parent"
          subtitle="Set up money for your kid"
          accent="#A855F7"
          accentBg="rgba(168,85,247,0.12)"
          onPress={() => router.push('/(auth)/voice-onboard')}
        />
        <RoleCard
          image={kidCard}
          title="I'm a kid"
          subtitle="Got an invite from your parent?"
          accent="#3DDC84"
          accentBg="rgba(61,220,132,0.12)"
          onPress={() => router.push('/(auth)/invite-accept')}
        />
      </View>

      <Pressable hitSlop={12} onPress={onSignOut} style={s.signOut}>
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

function RoleCard({
  image,
  title,
  subtitle,
  accent,
  accentBg,
  onPress,
}: {
  image: number
  title: string
  subtitle: string
  accent: string
  accentBg: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        pressed && s.cardPressed,
        { borderColor: accent + '55', backgroundColor: accentBg },
      ]}
    >
      {/* Image area — top portion, full image visible (contain) */}
      <View style={s.imageWrapper}>
        <Image source={image} style={s.image} resizeMode="contain" />
        {/* Soft accent glow behind the character */}
        <LinearGradient
          colors={[accent + '30', 'transparent']}
          style={s.imageGlow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
        />
      </View>

      {/* Footer — solid background for text */}
      <View style={s.footer}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.spacing[5],
  },
  header: {
    paddingTop: tokens.spacing[3],
    paddingBottom: tokens.spacing[5],
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[1],
  },
  cards: {
    flex: 1,
    gap: tokens.spacing[4],
    paddingBottom: tokens.spacing[4],
  },
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  imageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  footer: {
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[4],
    backgroundColor: 'rgba(11,11,15,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  accentBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginBottom: 4,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: tokens.fontSize.sm,
    fontWeight: '500',
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: tokens.spacing[3],
    marginBottom: tokens.spacing[2],
  },
  signOutText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
})
