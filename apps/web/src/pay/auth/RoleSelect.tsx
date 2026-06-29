/**
 * RoleSelect — parent vs kid, in the light `.pv` system.
 * Parent defers accountType until onboarding completes; kid persists it now.
 */
import { useState } from 'react'
import { UserCog, Baby, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore, type Account } from '../../stores/auth'

export function RoleSelect({ onParent, onKid }: { onParent: () => void; onKid: () => void }) {
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const logout = useAuthStore((s) => s.logout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function chooseKid() {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ account: Account }>('/me', { method: 'PATCH', body: JSON.stringify({ accountType: 'kid' }) })
      updateAccount(res.account)
      onKid()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-8">
      <header className="pv-rise pt-6">
        <h1 className="pv-h1 pv-tight">Welcome to BrainPal</h1>
        <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>Pick your side.</p>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-4">
        <RoleCard Icon={UserCog} title="I'm a parent" subtitle="Set up money and chores for your kid" gradient="var(--pv-grad-accent)" onAccent="var(--pv-on-accent)" delay={0} onClick={onParent} disabled={busy} />
        <RoleCard Icon={Baby} title="I'm a kid" subtitle="Your parent added you? Sign in here." gradient="linear-gradient(150deg, #a99bff 0%, #6f5cf0 100%)" onAccent="#ffffff" delay={80} onClick={chooseKid} disabled={busy} />
      </div>

      {error && <p className="pv-pop mt-2 text-center text-sm font-semibold" style={{ color: 'var(--pv-neg)' }}>{error}</p>}

      <button onClick={logout} className="pv-press mx-auto mt-4 py-3 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Sign out</button>
    </div>
  )
}

function RoleCard({ Icon, title, subtitle, gradient, onAccent, delay, onClick, disabled }: {
  Icon: LucideIcon; title: string; subtitle: string; gradient: string; onAccent: string; delay: number; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pv-press-lg pv-pop pv-glass pv-hairline flex-1 overflow-hidden rounded-[28px] p-6 text-left disabled:opacity-50"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="pv-hairline mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundImage: gradient, color: onAccent, boxShadow: 'var(--pv-shadow-pop)' }}>
        <Icon size={30} />
      </div>
      <div className="h-1 w-8 rounded-full" style={{ backgroundImage: gradient }} />
      <div className="pv-h2 pv-tight mt-3">{title}</div>
      <div className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>{subtitle}</div>
    </button>
  )
}
