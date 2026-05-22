import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'

/**
 * Auth store — drives the OTP flow + holds the current session profile.
 *
 * The Twilio bridge lives in two Supabase Edge Functions:
 *   POST {SUPABASE_URL}/functions/v1/otp-start  { phone }
 *   POST {SUPABASE_URL}/functions/v1/otp-check  { phone, code }
 *
 * After otp-check returns the JWT we hand it to supabase.auth.setSession
 * so SecureStore picks it up automatically and every API call gets the
 * Authorization header for free.
 */

export type AuthStatus =
  | 'idle'
  | 'sendingCode'
  | 'awaitingCode'
  | 'verifying'
  | 'authenticated'
  | 'error'

export type AccountType = 'parent' | 'kid' | 'extended' | null

type AuthState = {
  status: AuthStatus
  phone: string | null
  accountId: string | null
  accountType: AccountType
  hasPendingInvite: boolean
  isNewUser: boolean
  errorMessage: string | null

  // actions
  setStatus: (s: AuthStatus) => void
  setPhone: (p: string | null) => void
  setAccountType: (t: AccountType) => void
  sendCode: (phone: string) => Promise<void>
  verifyCode: (code: string) => Promise<void>
  resend: () => Promise<void>
  signOut: () => Promise<void>
  hydrateFromSession: () => Promise<void>
}

const FN_URL = (path: string) => `${env.supabaseUrl}/functions/v1/${path}`

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  phone: null,
  accountId: null,
  accountType: null,
  hasPendingInvite: false,
  isNewUser: false,
  errorMessage: null,

  setStatus: (status) => set({ status }),
  setPhone: (phone) => set({ phone }),
  setAccountType: (accountType) => set({ accountType }),

  sendCode: async (phone) => {
    set({ status: 'sendingCode', phone, errorMessage: null })
    const res = await fetch(FN_URL('otp-start'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
      },
      body: JSON.stringify({ phone }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      set({ status: 'error', errorMessage: body || `otp-start ${res.status}` })
      throw new Error(`otp-start failed (${res.status})`)
    }
    set({ status: 'awaitingCode' })
  },

  verifyCode: async (code) => {
    const phone = get().phone
    if (!phone) throw new Error('no_phone')
    set({ status: 'verifying', errorMessage: null })

    const res = await fetch(FN_URL('otp-check'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
      },
      body: JSON.stringify({ phone, code }),
    })

    if (!res.ok) {
      set({ status: 'awaitingCode', errorMessage: 'wrong_code' })
      throw new Error(`otp-check failed (${res.status})`)
    }

    const body = (await res.json()) as {
      jwt: string
      refreshToken: string
      user: { id: string; phone: string }
      isNewUser: boolean
      hasPendingInvite: boolean
      accountType: AccountType
    }

    // Hand the tokens to supabase-js so SecureStore picks them up.
    const { error } = await supabase.auth.setSession({
      access_token: body.jwt,
      refresh_token: body.refreshToken,
    })
    if (error) {
      set({ status: 'error', errorMessage: error.message })
      throw error
    }

    set({
      status: 'authenticated',
      accountId: body.user.id,
      accountType: body.accountType,
      isNewUser: body.isNewUser,
      hasPendingInvite: body.hasPendingInvite,
    })
  },

  resend: async () => {
    const phone = get().phone
    if (!phone) return
    await get().sendCode(phone)
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({
      status: 'idle',
      phone: null,
      accountId: null,
      accountType: null,
      hasPendingInvite: false,
      isNewUser: false,
      errorMessage: null,
    })
  },

  hydrateFromSession: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      set({
        status: 'authenticated',
        accountId: data.session.user.id,
        phone: data.session.user.phone ? `+${data.session.user.phone}` : null,
      })
    } else {
      set({ status: 'idle' })
    }
  },
}))
