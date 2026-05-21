/**
 * Mobile env. Only EXPO_PUBLIC_* vars are bundled into the client.
 * Defaults point at the deployed prototype API (api.zapfan.com).
 */
export const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.zapfan.com',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'wss://api.zapfan.com/live',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
}
