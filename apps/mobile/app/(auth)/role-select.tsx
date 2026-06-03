import { useRouter } from 'expo-router'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Role selection — full-bleed anime art fills the card edge-to-edge.
 * Footer label overlays the bottom of the image with a gradient scrim.
 */

const parentCard = require('@/assets/images/parentcard.png')
const kidCard = require('@/assets/images/kidcard.png')

export default function RoleSelect() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)
  const accountType = useAuthStore((s) => s.accountType)
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)

  const onSignOut = async () => {
    await signOut()
    router.replace('/(auth)/welcome')
  }

  const onKidPress = () => {
    // If already a kid with onboarding done, skip straight to the app
    if (accountType === 'kid' && onboardingComplete) {
      router.replace('/(app)/(tabs)')
      return
    }
    router.push('/(auth)/join-request')
  }

  const onParentPress = () => {
    // If already a parent with onboarding done, skip straight to the app
    if ((accountType === 'parent' || accountType === 'extended') && onboardingComplete) {
      router.replace('/(app)/(tabs)')
      return
    }
    router.push('/(auth)/voice-onboard')
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + tokens.spacing[4], paddingBottom: insets.bottom }]}>
      <View style={s.header}>
        <Text style={s.title}>Welcome to BrainPal</Text>
        <Text style={s.subtitle}>Pick your side.</Text>
      </View>

      <View style={s.cards}>
        <RoleCard
          image={parentCard}
          title="I'm a parent"
          subtitle="Set up money for your kid"
          accent="#A855F7"
          onPress={onParentPress}
        />
        <RoleCard
          image={kidCard}
          title="I'm a kid"
          subtitle="Your parent added you? Sign in here."
          accent="#3DDC84"
          onPress={onKidPress}
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
      style={({ pressed }) => [
        s.card,
        { borderColor: accent + '66' },
        pressed && s.cardPressed,
      ]}
    >
      {/* Full-bleed image — cover fills the entire card, no side bars */}
      <Image source={image} style={s.image} resizeMode="cover" />

      {/* Bottom gradient scrim so text is always readable */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
        style={s.scrim}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />

      {/* Accent glow at the top */}
      <LinearGradient
        colors={[accent + '44', 'transparent']}
        style={s.topGlow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      {/* Label overlaid at the bottom */}
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

  // Card — no background color, image fills it completely
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: '#000',
  },
  cardPressed: {
    transform: [{ scale: 0.975 }],
    opacity: 0.92,
  },

  // Image fills the entire card
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },

  // Gradient scrim over the bottom ~50% for text legibility
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },

  // Subtle accent glow at the top
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
  },

  // Text label sits at the bottom, on top of the scrim
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[4],
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
