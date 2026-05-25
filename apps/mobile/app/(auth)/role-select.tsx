import { useRouter } from 'expo-router'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Role selection — cinematic anime cards with full-bleed art + gradient overlay.
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
          onPress={() => router.push('/(auth)/parent-onboarding')}
        />
        <RoleCard
          image={kidCard}
          title="I'm a kid"
          subtitle="Got an invite from your parent?"
          accent="#3DDC84"
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
  onPress,
}: {
  image: number
  title: string
  subtitle: string
  accent: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && s.cardPressed, { borderColor: accent + '55' }]}
    >
      <ImageBackground source={image} style={s.cardImage} imageStyle={s.cardImageInner} resizeMode="cover">
        {/* Top accent glow */}
        <LinearGradient
          colors={[accent + '40', 'transparent']}
          style={s.topGlow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        {/* Bottom dark gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(11,11,15,0.4)', 'rgba(11,11,15,0.95)']}
          style={s.bottomGradient}
          locations={[0, 0.55, 1]}
        />
        <View style={s.cardContent}>
          <View style={[s.accentBar, { backgroundColor: accent }]} />
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardSubtitle}>{subtitle}</Text>
        </View>
      </ImageBackground>
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
    backgroundColor: tokens.color.surface,
    borderWidth: 1.5,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cardImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardImageInner: {
    // Show the upper portion of the character (face/torso) by anchoring top
    resizeMode: 'cover',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  cardContent: {
    padding: tokens.spacing[5],
    gap: 6,
  },
  accentBar: {
    width: 32,
    height: 3,
    borderRadius: 2,
    marginBottom: 4,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.75)',
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
