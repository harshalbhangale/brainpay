import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

/**
 * Auth store — drives the OTP flow + holds the current session profile.
 *
 * Uses Supabase's native phone OTP provider (Twilio Verify configured in
 * Auth settings):
 *   supabase.auth.signInWithOtp({ phone })
 *   supabase.auth.verifyOtp({ phone, token, type: 'sms' })
 *
 * Test-account bypass: configure a test phone + fixed code in the
 * Supabase dashboard (Auth → Providers → Phone → Test OTP). The native
 * verifyOtp accepts those without round-tripping Twilio.
 *
 * Sessions persist via SecureStore (configured in lib/supabase.ts).
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
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        // Allow creating a new auth user on first sign-in. Supabase will
        // upsert into auth.users keyed by phone.
        shouldCreateUser: true,
      },
    })
    if (error) {
      set({ status: 'error', errorMessage: error.message })
      throw error
    }
    set({ status: 'awaitingCode' })
  },

  verifyCode: async (code) => {
    const phone = get().phone
    if (!phone) throw new Error('no_phone')
    set({ status: 'verifying', errorMessage: null })

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    })

    if (error || !data.session || !data.user) {
      const msg = error?.message ?? 'verify_failed'
      set({ status: 'awaitingCode', errorMessage: msg })
      throw new Error(msg)
    }

    // Decide onboarding routing: brand-new auth user (created_at within a
    // few seconds of now) vs returning user. Supabase doesn't expose an
    // `isNewUser` flag from verifyOtp, so we infer from created_at.
    const createdAt = new Date(data.user.created_at).getTime()
    const isNewUser = Date.now() - createdAt < 60_000

    // Look up the accounts row + any pending invite for this phone via
    // the API (which uses the just-issued session for RLS).
    let accountType: AccountType = null
    let hasPendingInvite = false
    try {
      const { data: account } = await supabase
        .from('accounts')
        .select('account_type')
        .eq('id', data.user.id)
        .maybeSingle()
      accountType = (account?.account_type ?? null) as AccountType

      const { data: invites } = await supabase
        .from('invites')
        .select('id')
        .eq('recipient_phone', phone)
        .eq('status', 'pending')
        .limit(1)
      hasPendingInvite = (invites?.length ?? 0) > 0
    } catch (lookupErr) {
      // Non-fatal — onboarding routing will default to role-select.
      console.warn('post_verify_lookup_failed', lookupErr)
    }

    set({
      status: 'authenticated',
      accountId: data.user.id,
      accountType,
      isNewUser,
      hasPendingInvite,
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
