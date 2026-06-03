import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Root index — redirect based on auth state and onboarding completion.
 *
 *   unauthenticated              → (auth)/welcome
 *   authed + onboarding not done → (auth)/role-select
 *   authed + parent              → (app)/parent
 *   authed + kid                 → (app)/kid
 *
 * onboardingComplete = accountType is set AND persona has a name.
 * This means returning users who already finished onboarding skip it
 * entirely on every subsequent launch.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status)
  const accountType = useAuthStore((s) => s.accountType)
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)

  if (status !== 'authenticated') return <Redirect href="/(auth)/welcome" />

  // Onboarding complete — go straight to the app
  if (onboardingComplete) {
    return <Redirect href="/(app)/(tabs)" />
  }

  // accountType is set but persona has no name — mid-onboarding, resume the right wizard
  if (accountType === 'kid') return <Redirect href="/(auth)/kid-persona" />
  if (accountType === 'parent') return <Redirect href="/(auth)/parent-onboarding" />

  // No accountType yet — fresh user, pick a role
  return <Redirect href="/(auth)/role-select" />
}
