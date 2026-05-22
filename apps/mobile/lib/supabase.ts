import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { env } from './env'

/**
 * Platform-aware storage for the Supabase auth session.
 *
 *   iOS / Android — expo-secure-store (Keychain / Keystore).
 *   Web           — window.localStorage. SecureStore doesn't exist there.
 *
 * SecureStore values must be ≤2048 bytes; Supabase JWT + refresh fits.
 */

const nativeStorage: SupportedStorage = {
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

const webStorage: SupportedStorage = {
  async getItem(key) {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    return ls?.getItem(key) ?? null
  },
  async setItem(key, value) {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    ls?.setItem(key, value)
  },
  async removeItem(key) {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    ls?.removeItem(key)
  },
}

const storage = Platform.OS === 'web' ? webStorage : nativeStorage

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // OAuth redirects on web only
  },
})
