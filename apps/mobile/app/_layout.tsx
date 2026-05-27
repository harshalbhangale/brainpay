import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StripeProvider } from '@stripe/stripe-react-native'
import { useAuthStore } from '@/stores/auth'
import { addNotificationResponseListener } from '@/lib/push'

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
const STRIPE_MERCHANT = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? 'merchant.com.brainpal.pay'

// Screen → route map for notification deep links.
const NOTIFICATION_ROUTES: Record<string, string> = {
  wallet:  '/(app)/kid',
  chores:  '/(app)/parent',
  feed:    '/(app)/parent/feed',
  home:    '/',
  goals:   '/(app)/kid',
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
    <SafeAreaProvider>
      <StripeProvider
        publishableKey={STRIPE_PK}
        merchantIdentifier={STRIPE_MERCHANT}
        urlScheme="brainpay"
      >
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AuthGate />
        </QueryClientProvider>
      </StripeProvider>
    </SafeAreaProvider>
  )
}

function AuthGate() {
  const segments = useSegments()
  const router = useRouter()
  const status = useAuthStore((s) => s.status)
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

  // Route guards: keep unauthed users in (auth), authed users out of it.
  useEffect(() => {
    if (!hydrated) return
    const segs = segments as readonly string[]
    const inAuthGroup = segs[0] === '(auth)'
    if (status === 'authenticated' && inAuthGroup) {
      // Final redirect handled inside individual auth screens (e.g. otp.tsx
      // routes to invite-accept or role-select); only bounce out of the
      // very first welcome/phone screens.
      const screen = segs[1]
      if (screen === 'welcome' || screen === 'phone' || screen === 'otp') {
        router.replace('/')
      }
    } else if (status !== 'authenticated' && !inAuthGroup && segs.length > 0) {
      router.replace('/(auth)/welcome')
    }
  }, [hydrated, status, segments, router])

  return <Slot />
}
