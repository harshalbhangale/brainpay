/**
 * JoinFamily — shown to a freshly signed-in kid who has a pending invite from
 * a parent (GET /join-requests/pending). Accept → joins the family as a kid
 * (POST /join-requests/:id/accept), then continues into onboarding.
 */
import { useState } from 'react'
import { Users, Check, Gift } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'
import { fmt } from '../data'
import { Avatar, Button } from '../components/primitives'

export type PendingReq = {
  id: string
  familyId: string
  familyName: string
  familyAvatar: string
  parentName: string
  parentAvatar: string
  initialTopup: number
  kidSeed?: Record<string, unknown>
}

export function JoinFamily({ requests, onDone, onDecline }: { requests: PendingReq[]; onDone: () => void; onDecline: () => void }) {
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const req = requests[0]
  const kidName = (req.kidSeed?.name as string) || undefined

  async function accept() {
    if (busy) return
    setBusy('accept'); setError(null)
    try {
      await api(`/join-requests/${req.id}/accept`, { method: 'POST' })
      const me = await api<{ account: Account }>('/me')
      updateAccount(me.account)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join — try again')
      setBusy(null)
    }
  }

  async function decline() {
    if (busy) return
    setBusy('decline')
    try { await api(`/join-requests/${req.id}/decline`, { method: 'POST' }) } catch { /* ignore */ }
    onDecline()
  }


  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-6 pb-10">
      <div className="pv-rise flex flex-col items-center text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
          <Users size={28} strokeWidth={2.2} />
        </span>
        <h1 className="pv-h1">{kidName ? `Hi ${kidName}!` : 'You\u2019re invited!'}</h1>
        <p className="pv-body mt-2 max-w-xs" style={{ color: 'var(--pv-ink-2)' }}>
          <span style={{ fontWeight: 700, color: 'var(--pv-ink)' }}>{req.parentName}</span> wants to add you to their family on BrainPal.
        </p>
      </div>

      <div className="pv-pop mt-7 rounded-[var(--pv-r-xl)] p-5" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-md)' }}>
        <div className="flex items-center gap-3">
          <Avatar name={req.parentName} src={req.parentAvatar} size={48} />
          <div className="min-w-0 flex-1">
            <div className="pv-title truncate">{req.familyAvatar} {req.familyName}</div>
            <div className="text-sm font-medium" style={{ color: 'var(--pv-ink-3)' }}>Invited by {req.parentName}</div>
          </div>
        </div>
        {req.initialTopup > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--pv-accent-soft)', color: 'var(--pv-ink)' }}>
            <Gift size={16} style={{ color: 'var(--pv-accent)' }} /> {fmt(req.initialTopup)} waiting in your wallet
          </div>
        )}
      </div>

      {error && <p className="pv-pop mt-4 rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>{error}</p>}

      <div className="mt-7">
        <Button variant="accent" size="lg" full leadingIcon={Check} onClick={accept} disabled={!!busy}>
          {busy === 'accept' ? 'Joining\u2026' : `Join ${req.familyName}`}
        </Button>
        <button onClick={decline} disabled={!!busy} className="pv-press mt-3 w-full py-2 text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--pv-ink-3)' }}>
          {busy === 'decline' ? '\u2026' : 'No thanks, set up my own'}
        </button>
      </div>
    </div>
  )
}
