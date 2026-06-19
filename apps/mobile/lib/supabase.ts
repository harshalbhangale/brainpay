import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { env } from './env'

/**
 * SecureStore-backed storage adapter for Supabase auth.
 * SecureStore values must be ≤2048 bytes; Supabase JWT + refresh fits.
 *
 * Falls back to an in-memory map when the Keychain is unavailable (e.g. the
 * iOS Simulator built without an Apple Developer team, where SecureStore
 * throws "A required entitlement isn't present"). The session simply won't
 * persist across launches in that case, instead of crashing with an
 * uncaught promise rejection.
 */
const memoryStore = new Map<string, string>()

const secureStorage: SupportedStorage = {
  async getItem(key) {
    try {
      return (await SecureStore.getItemAsync(key)) ?? null
    } catch {
      return memoryStore.get(key) ?? null
    }
  },
  async setItem(key, value) {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      memoryStore.set(key, value)
    }
  },
  async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      memoryStore.delete(key)
    }
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
