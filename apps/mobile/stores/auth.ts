import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { env } from '@/lib/env'
import { registerForPushNotifications } from '@/lib/push'

/**
 * Auth store — drives the OTP flow + holds the current session.
 *
 * BrainPal owns the auth flow end-to-end:
 *   POST {API}/auth/otp/start   { phone }       -> SMS via Twilio Verify
 *   POST {API}/auth/otp/check   { phone, code } -> { token, account, isNewUser }
 *
 * The token is a BrainPal-issued HS256 JWT (NOT Supabase Auth). We store
 * it in SecureStore and attach it as `Authorization: Bearer ...` to every
 * subsequent API call (apps/mobile/lib/api.ts).
 */

const TOKEN_KEY = 'brainpal.auth.token'
const ACCOUNT_KEY = 'brainpal.auth.account'

export type AuthStatus =
  | 'idle'
  | 'sendingCode'
  | 'awaitingCode'
  | 'verifying'
  | 'authenticated'
  | 'error'

export type AccountType = 'parent' | 'kid' | 'extended' | null

export type StoredAccount = {
  id: string
  phone: string
  accountType: AccountType
  persona: Record<string, unknown> | null
  cachedBalance: number
}

type AuthState = {
  status: AuthStatus
  phone: string | null
  accountId: string | null
  accountType: AccountType
  persona: Record<string, unknown> | null
  /** True when accountType is set AND persona has a name — onboarding is done. */
  onboardingComplete: boolean
  hasPendingInvite: boolean
  isNewUser: boolean
  errorMessage: string | null

  // actions
  setStatus: (s: AuthStatus) => void
  setPhone: (p: string | null) => void
  setAccountType: (t: AccountType) => void
  setPersona: (p: Record<string, unknown>) => void
  sendCode: (phone: string) => Promise<void>
  verifyCode: (code: string) => Promise<void>
  resend: () => Promise<void>
  signOut: () => Promise<void>
  hydrateFromSession: () => Promise<void>
}

const apiUrl = (path: string) => `${env.apiBaseUrl}${path}`

async function jsonOrThrow(res: Response, op: string): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      detail = (parsed.error as string | undefined) ?? text
    } catch { /* not JSON */ }
    throw new Error(`${op} ${res.status}: ${detail}`)
  }
  return res.json()
}

function isOnboardingComplete(accountType: AccountType, persona: Record<string, unknown> | null): boolean {
  return !!accountType && !!persona && typeof persona.name === 'string' && persona.name.length > 0
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  phone: null,
  accountId: null,
  accountType: null,
  persona: null,
  onboardingComplete: false,
  hasPendingInvite: false,
  isNewUser: false,
  errorMessage: null,

  setStatus: (status) => set({ status }),
  setPhone: (phone) => set({ phone }),
  setAccountType: (accountType) => set((s) => ({
    accountType,
    onboardingComplete: isOnboardingComplete(accountType, s.persona),
  })),
  setPersona: (persona) => set((s) => ({
    persona,
    onboardingComplete: isOnboardingComplete(s.accountType, persona),
  })),

  sendCode: async (phone) => {
    set({ status: 'sendingCode', phone, errorMessage: null })
    try {
      const res = await fetch(apiUrl('/auth/otp/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      await jsonOrThrow(res, 'otp.start')
      set({ status: 'awaitingCode' })
    } catch (err) {
      const msg = (err as Error).message
      set({ status: 'error', errorMessage: msg })
      throw err
    }
  },

  verifyCode: async (code) => {
    const phone = get().phone
    if (!phone) throw new Error('no_phone')
    set({ status: 'verifying', errorMessage: null })

    let body: {
      token: string
      expiresAt: number
      isNewUser: boolean
      account: StoredAccount
    }
    try {
      const res = await fetch(apiUrl('/auth/otp/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })
      body = (await jsonOrThrow(res, 'otp.check')) as typeof body
    } catch (err) {
      const msg = (err as Error).message
      set({ status: 'awaitingCode', errorMessage: msg })
      throw err
    }

    // Persist token + account locally.
    await SecureStore.setItemAsync(TOKEN_KEY, body.token)
    await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(body.account))

    // Lookup pending join requests for this phone (replaces old invite check).
    let hasPendingInvite = false
    try {
      const joinRes = await fetch(apiUrl('/join-requests/pending'), {
        headers: { Authorization: `Bearer ${body.token}` },
      })
      if (joinRes.ok) {
        const data = (await joinRes.json()) as { requests?: unknown[] }
        hasPendingInvite = (data.requests?.length ?? 0) > 0
      }
    } catch { /* non-fatal */ }

    set({
      status: 'authenticated',
      accountId: body.account.id,
      accountType: body.account.accountType,
      persona: body.account.persona,
      onboardingComplete: isOnboardingComplete(body.account.accountType, body.account.persona),
      isNewUser: body.isNewUser,
      hasPendingInvite,
    })

    // Register for push notifications after successful login — non-blocking.
    registerForPushNotifications().catch(() => undefined)
  },

  resend: async () => {
    const phone = get().phone
    if (!phone) return
    await get().sendCode(phone)
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    await SecureStore.deleteItemAsync(ACCOUNT_KEY)
    // Best-effort hit logout endpoint. Not awaited beyond a short timeout.
    fetch(apiUrl('/auth/logout'), { method: 'POST' }).catch(() => undefined)
    set({
      status: 'idle',
      phone: null,
      accountId: null,
      accountType: null,
      persona: null,
      onboardingComplete: false,
      hasPendingInvite: false,
      isNewUser: false,
      errorMessage: null,
    })
  },

  hydrateFromSession: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    const accountRaw = await SecureStore.getItemAsync(ACCOUNT_KEY)
    if (!token || !accountRaw) {
      set({ status: 'idle' })
      return
    }
    try {
      const account = JSON.parse(accountRaw) as StoredAccount
      set({
        status: 'authenticated',
        accountId: account.id,
        accountType: account.accountType,
        persona: account.persona,
        onboardingComplete: isOnboardingComplete(account.accountType, account.persona),
        phone: account.phone,
      })
    } catch {
      // Corrupt cache — drop and reset to idle.
      await SecureStore.deleteItemAsync(TOKEN_KEY)
      await SecureStore.deleteItemAsync(ACCOUNT_KEY)
      set({ status: 'idle' })
    }
  },
}))

/** Read the stored token (used by api.ts to attach Authorization header). */
export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}
