/**
 * Mobile env reader. Only EXPO_PUBLIC_* vars are bundled into the client.
 */
export const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000/live',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
}
