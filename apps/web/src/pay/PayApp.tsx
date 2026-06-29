/**
 * BrainPal (light) — the self-contained app.
 * ───────────────────────────────────────────────────────────────────────────
 * Gates on auth state and routes entirely in-component (no router needed):
 *   no token        → Login (phone OTP)
 *   no accountType  → RoleSelect (parent / kid)
 *   not onboarded   → Onboarding (voice-first, wizard fallback)
 *   else            → PalShell (the animated Pal switcher: Money / Study / …)
 *
 * Mounted at /pay today; becomes the default route at cutover.
 */
import { useEffect, useState } from 'react'
import './theme.css'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
import { PhoneCanvas } from './components/shell'
import { Login } from './auth/Login'
import { RoleSelect } from './auth/RoleSelect'
import { Onboarding } from './onboard/Onboarding'
import { JoinFamily, type PendingReq } from './auth/JoinFamily'
import { PalShell } from './pals/PalShell'

export default function PayApp() {
  const token = useAuthStore((s) => s.token)
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const [roleChoice, setRoleChoice] = useState<'parent' | 'kid' | null>(null)
  const [pending, setPending] = useState<PendingReq[] | null>(null)

  // Background-sync the account (accountType / persona / balance) when signed in.
  useEffect(() => {
    if (!token) return
    api<{ account: Account }>('/me').then((r) => updateAccount(r.account)).catch(() => undefined)
  }, [token, updateAccount])

  // Un-roled, signed-in users may have a pending invite from a parent — check
  // before showing role-select so an invited kid just taps "Join".
  useEffect(() => {
    const hasRole = !!((account?.accountType as string | null) ?? roleChoice)
    if (!token || hasRole) { setPending(null); return }
    let active = true
    api<{ requests: PendingReq[] }>('/join-requests/pending')
      .then((r) => { if (active) setPending(r.requests) })
      .catch(() => { if (active) setPending([]) })
    return () => { active = false }
  }, [token, account?.accountType, roleChoice])

  if (!token) {
    return <PhoneCanvas><Login /></PhoneCanvas>
  }

  const role = (account?.accountType as 'parent' | 'kid' | null) ?? roleChoice
  const onboarded = !!(account?.persona as Record<string, unknown> | null)?.onboarded

  if (!role) {
    if (pending === null) {
      return (
        <PhoneCanvas>
          <div className="flex flex-1 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full" style={{ border: '3px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
          </div>
        </PhoneCanvas>
      )
    }
    if (pending.length > 0) {
      return (
        <PhoneCanvas>
          <JoinFamily requests={pending} onDone={() => setPending(null)} onDecline={() => setPending([])} />
        </PhoneCanvas>
      )
    }
    return (
      <PhoneCanvas>
        <RoleSelect onParent={() => setRoleChoice('parent')} onKid={() => setRoleChoice('kid')} />
      </PhoneCanvas>
    )
  }

  if (!onboarded) {
    return (
      <PhoneCanvas>
        <Onboarding role={role} onDone={() => setRoleChoice(null)} />
      </PhoneCanvas>
    )
  }

  return <PalShell />
}
