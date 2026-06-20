import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { COUNTRIES, isValidLocal, toE164, type Country } from '../lib/phone'
import { useAuthStore, type Account } from '../stores/auth'

type CheckResponse = {
  token: string
  expiresAt: number
  isNewUser: boolean
  account: Account
}

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function Login() {
  const navigate = useNavigate()
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
      const res = await api<CheckResponse>('/auth/otp/check', {
        method: 'POST',
        body: JSON.stringify({ phone: e164, code: code.trim() }),
      })
      setAuth({ token: res.token, expiresAt: res.expiresAt, account: res.account })
      // First-timers (no role yet) pick parent/kid; everyone else goes straight in.
      navigate(res.account.accountType ? '/' : '/role', { replace: true })
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl font-extrabold tracking-tight">BrainPal</div>
          <p className="mt-2 text-sm text-muted">
            {step === 'phone' ? "What's your number? We'll text you a code." : `Enter the code sent to ${e164}`}
          </p>
        </div>

        {step === 'phone' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!loading) startOtp()
            }}
          >
            <div className="flex gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="flex h-14 items-center gap-2 rounded-2xl bg-surface px-4 font-semibold text-ink"
                >
                  <span className="text-xl">{country.flag}</span>
                  <span>{country.dial}</span>
                  <span className="text-xs text-muted">▾</span>
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 top-16 z-10 w-56 overflow-hidden rounded-2xl bg-surface shadow-xl">
                    {COUNTRIES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          setCountry(c)
                          setPickerOpen(false)
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2"
                      >
                        <span className="text-xl">{c.flag}</span>
                        <span className="flex-1 text-ink">{c.name}</span>
                        <span className="text-sm text-muted">{c.dial}</span>
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
                className="h-14 flex-1 rounded-2xl bg-surface px-4 text-lg font-semibold text-ink outline-none ring-1 ring-transparent focus:ring-accent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !phoneValid}
              className="mt-5 h-14 w-full rounded-full bg-accent font-bold text-on-accent transition active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? 'Sending…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!loading) checkOtp()
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-16 w-full rounded-2xl bg-surface px-4 text-center text-2xl tracking-[0.5em] text-ink outline-none ring-1 ring-transparent focus:ring-accent"
            />
            <button
              type="submit"
              disabled={loading || code.trim().length < 4}
              className="mt-5 h-14 w-full rounded-full bg-accent font-bold text-on-accent transition active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setCode('')
                setError(null)
              }}
              className="mt-3 w-full text-sm text-muted hover:text-ink"
            >
              Use a different number
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          By continuing you agree to the Terms and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
