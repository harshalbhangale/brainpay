import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { env } from './env'

/**
 * SecureStore-backed storage adapter for Supabase auth.
 * SecureStore values must be ≤2048 bytes; Supabase JWT + refresh fits.
 */
const secureStorage: SupportedStorage = {
  async getItem(key) {
    return (await SecureStore.getItemAsync(key)) ?? null
  },
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value)
  },
  async removeItem(key) {
    await SecureStore.deleteItemAsync(key)
  },
}

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
