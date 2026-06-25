/**
 * Login — phone OTP, in the light `.pv` system.
 * Reuses the real backend (`/auth/otp/start`, `/auth/otp/check`) and lib/phone.
 * On success it sets auth; the PayApp gate then routes to role/onboarding/home.
 */
import { useMemo, useState } from 'react'
import { Sparkles, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { COUNTRIES, isValidLocal, toE164, type Country } from '../../lib/phone'
import { useAuthStore, type Account } from '../../stores/auth'
import { Button } from '../components/primitives'

type CheckResponse = { token: string; expiresAt: number; isNewUser: boolean; account: Account }

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function Login() {
  const setAuth = useAuthStore((s) => s.setAuth)

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [country, setCountry] = useState<Country>(COUNTRIES[0])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [local, setLocal] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const e164 = useMemo(() => toE164(country.dial, local), [country, local])
  const phoneValid = isValidLocal(local)

  async function startOtp() {
    if (!phoneValid) return
    setError(null)
    setLoading(true)
    try {
      await api('/auth/otp/start', { method: 'POST', body: JSON.stringify({ phone: e164 }) })
      setStep('code')
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setLoading(false)
    }
  }

  async function checkOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await api<CheckResponse>('/auth/otp/check', { method: 'POST', body: JSON.stringify({ phone: e164, code: code.trim() }) })
      setAuth({ token: res.token, expiresAt: res.expiresAt, account: res.account })
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-6 pb-10">
      <div className="pv-rise mb-9 flex flex-col items-center text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
          <Sparkles size={30} strokeWidth={2.2} />
        </span>
        <h1 className="text-[2.6rem] font-extrabold leading-none tracking-tight">BrainPal</h1>
        <p className="pv-body mt-3 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>
          {step === 'phone' ? "What's your number? We'll text you a code." : `Enter the code we sent to ${e164}`}
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (!loading) startOtp() }}>
          <div className="flex gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="pv-press flex h-14 items-center gap-1.5 rounded-2xl px-4 font-bold"
                style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}
              >
                <span className="text-xl">{country.flag}</span>
                <span>{country.dial}</span>
                <ChevronDown size={15} style={{ color: 'var(--pv-ink-3)' }} />
              </button>
              {pickerOpen && (
                <div className="pv-pop absolute left-0 top-16 z-10 w-56 overflow-hidden rounded-2xl" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
                  {COUNTRIES.map((c) => (
                    <button key={c.code} type="button" onClick={() => { setCountry(c); setPickerOpen(false) }} className="pv-press flex w-full items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl">{c.flag}</span>
                      <span className="flex-1 font-semibold">{c.name}</span>
                      <span className="text-sm" style={{ color: 'var(--pv-ink-3)' }}>{c.dial}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              type="tel"
              inputMode="tel"
              autoFocus
              placeholder="412 345 678"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="h-14 flex-1 rounded-2xl px-4 text-lg font-semibold outline-none"
              style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink)' }}
            />
          </div>

          <div className="mt-5">
            <Button type="submit" variant="accent" size="lg" full disabled={loading || !phoneValid}>{loading ? 'Sending…' : 'Continue'}</Button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!loading) checkOtp() }}>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-16 w-full rounded-2xl px-4 text-center text-2xl font-bold tracking-[0.5em] outline-none"
            style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink)' }}
          />
          <div className="mt-5">
            <Button type="submit" variant="accent" size="lg" full disabled={loading || code.trim().length < 4}>{loading ? 'Verifying…' : 'Verify'}</Button>
          </div>
          <button type="button" onClick={() => { setStep('phone'); setCode(''); setError(null) }} className="pv-press mt-3 w-full py-2 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            Use a different number
          </button>
        </form>
      )}

      {error && (
        <p className="pv-pop mt-4 rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>{error}</p>
      )}

      <p className="mt-8 text-center text-xs" style={{ color: 'var(--pv-ink-3)' }}>By continuing you agree to the Terms and Privacy Policy.</p>
    </div>
  )
}
