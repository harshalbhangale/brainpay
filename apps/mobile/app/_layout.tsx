import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

/**
 * Root layout: providers + status bar.
 * Auth gate (route to (auth) vs (app) based on session) lands when OTP ships.
 */
export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 3 } },
  }))

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Slot />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
