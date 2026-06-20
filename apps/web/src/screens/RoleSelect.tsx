import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, Baby, type LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'

export function RoleSelect() {
  const navigate = useNavigate()
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const logout = useAuthStore((s) => s.logout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function chooseParent() {
    // Parent persists accountType at the end of onboarding (with persona).
    navigate('/onboarding', { replace: true })
  }

  async function chooseKid() {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ account: Account }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'kid' }),
      })
      updateAccount(res.account)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col p-6">
      <header className="pt-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome to BrainPal</h1>
        <p className="mt-1 text-muted">Pick your side.</p>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-4">
        <RoleCard
          Icon={UserCog}
          title="I'm a parent"
          subtitle="Set up money and chores for your kid"
          accent="#12b76a"
          onClick={chooseParent}
          disabled={busy}
        />
        <RoleCard
          Icon={Baby}
          title="I'm a kid"
          subtitle="Your parent added you? Sign in here."
          accent="#6aa3ff"
          onClick={chooseKid}
          disabled={busy}
        />
      </div>

      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}

      <button
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
        className="mx-auto mt-4 py-3 text-sm font-semibold text-muted hover:text-ink"
      >
        Sign out
      </button>
    </div>
  )
}

function RoleCard({
  Icon,
  title,
  subtitle,
  accent,
  onClick,
  disabled,
}: {
  Icon: LucideIcon
  title: string
  subtitle: string
  accent: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ borderColor: `${accent}66` }}
      className="flex-1 overflow-hidden rounded-3xl border-2 bg-surface p-6 text-left transition active:scale-[0.98] disabled:opacity-50"
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${accent}22` }}
      >
        <Icon size={30} style={{ color: accent }} />
      </div>
      <div className="h-1 w-7 rounded-full" style={{ backgroundColor: accent }} />
      <div className="mt-3 text-xl font-extrabold text-ink">{title}</div>
      <div className="mt-1 text-sm text-muted">{subtitle}</div>
    </button>
  )
}
