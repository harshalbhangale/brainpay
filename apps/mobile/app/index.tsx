import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Root index — redirect based on auth state and account type.
 *   - unauthed             → (auth)/welcome
 *   - authed + no type yet → (auth)/role-select
 *   - authed + parent      → (app)/parent
 *   - authed + kid         → (app)/kid
 */
export default function Index() {
  const status = useAuthStore((s) => s.status)
  const accountType = useAuthStore((s) => s.accountType)

  if (status !== 'authenticated') return <Redirect href="/(auth)/welcome" />
  if (!accountType) return <Redirect href="/(auth)/role-select" />
  if (accountType === 'parent') return <Redirect href="/(app)/parent" />
  // kid (and 'extended' for now) lands in the kid app
  return <Redirect href="/(app)/kid" />
}
