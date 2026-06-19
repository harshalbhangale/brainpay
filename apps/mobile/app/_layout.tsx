import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { useEffect, useState } from 'react'
import { Platform, View, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StripeProvider } from '@stripe/stripe-react-native'
import { useAuthStore } from '@/stores/auth'
import { addNotificationResponseListener } from '@/lib/push'

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
const STRIPE_MERCHANT = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? 'merchant.com.brainpal.pay'

// Screen → route map for notification deep links.
const NOTIFICATION_ROUTES: Record<string, string> = {
  wallet:  '/(app)/(tabs)',
  chores:  '/(app)/parent-chores',
  feed:    '/(app)/(tabs)',
  home:    '/',
  goals:   '/(app)/goals',
  chat:    '/(app)/(tabs)',
}

/**
 * Root layout: providers + status bar + auth gate.
 *
 * Auth flow (BrainPal-issued JWT, NOT Supabase Auth):
 *   - On mount, hydrate from SecureStore (token + cached account).
 *   - Route gating: unauthed users land in (auth), authed users in (app).
 *
 * Deep link handling for invites lives in (auth)/invite-accept; this layout
 * only owns the authed/unauthed binary.
 */
export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 3 } },
  }))

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={STRIPE_PK}
          merchantIdentifier={STRIPE_MERCHANT}
          urlScheme="brainpay"
        >
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <PhoneFrame>
              <AuthGate />
            </PhoneFrame>
          </QueryClientProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * On web, the app is a full-width desktop page by default, which looks
 * broken for a phone-first UI. This wraps everything in a centered,
 * phone-width column so the browser renders it like a device. No-op on
 * native (returns children directly).
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>
  return (
    <View style={frame.outer}>
      <View style={frame.device}>{children}</View>
    </View>
  )
}

const frame = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#F3F4FA',
    // @ts-ignore web-only
    minHeight: '100vh',
  },
  device: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F3F4FA',
  },
})

function AuthGate() {
  const segments = useSegments()
  const router = useRouter()
  const status = useAuthStore((s) => s.status)
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const accountType = useAuthStore((s) => s.accountType)
  const hydrate = useAuthStore((s) => s.hydrateFromSession)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate on mount.
  useEffect(() => {
    hydrate().finally(() => setHydrated(true))
  }, [hydrate])

  // Notification tap → deep link routing.
  useEffect(() => {
    const cleanup = addNotificationResponseListener((screen) => {
      const route = NOTIFICATION_ROUTES[screen] ?? '/'
      router.push(route as Parameters<typeof router.push>[0])
    })
    return cleanup
  }, [router])

  // Deep link handler: brainpay://inv/<code> → invite-accept screen
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return
      const parsed = Linking.parse(url)
      // expo Linking strips the scheme; path is "inv/CODE" for brainpay://inv/CODE
      const path = parsed.path ?? ''
      const match = path.match(/^inv\/([A-Z0-9]{6,12})$/i)
      if (match) {
        router.push({ pathname: '/(auth)/invite-accept', params: { code: match[1] } })
      }
    }
    // Initial URL when the app cold-starts from the deep link
    Linking.getInitialURL().then(handleUrl)
    // Subsequent URLs while running
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url))
    return () => sub.remove()
  }, [router])

  // Route guards.
  useEffect(() => {
    if (!hydrated) return
    const segs = segments as readonly string[]
    const inAuthGroup = segs[0] === '(auth)'
    const screen = segs[1]

    if (status !== 'authenticated' && !inAuthGroup && segs.length > 0) {
      // Not logged in — send to welcome.
      router.replace('/(auth)/welcome')
      return
    }

    if (status === 'authenticated' && inAuthGroup && onboardingComplete) {
      // Logged in + onboarding done — never let them back into any auth screen.
      // Exceptions: invite-accept (joining a second family) is always accessible.
      // kid-persona / parent-onboarding / parent-persona are mid-onboarding — also exempt.
      const onboardingScreens = ['invite-accept', 'kid-persona', 'parent-onboarding', 'parent-persona', 'voice-onboard']
      if (!onboardingScreens.includes(screen)) {
        router.replace('/(app)/(tabs)')
      }
    }  }, [hydrated, status, onboardingComplete, accountType, segments, router])

  return <Slot />
}
