import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, Baby, type LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
import { PressButton } from '../components/ui'

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
      navigate('/onboarding-kid', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-full max-w-md flex-col overflow-hidden p-6">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-grad-aurora opacity-20 blur-[90px] animate-aurora" />
      <header className="animate-rise relative pt-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome to <span className="text-grad-accent">BrainPal</span></h1>
        <p className="mt-1 text-muted">Pick your side.</p>
      </header>

      <div className="relative mt-6 flex flex-1 flex-col gap-4">
        <RoleCard
          Icon={UserCog}
          title="I'm a parent"
          subtitle="Set up money and chores for your kid"
          grad="var(--grad-accent-bright)"
          glow="var(--glow-accent)"
          delay={0}
          onClick={chooseParent}
          disabled={busy}
        />
        <RoleCard
          Icon={Baby}
          title="I'm a kid"
          subtitle="Your parent added you? Sign in here."
          grad="var(--grad-violet)"
          glow="var(--glow-violet)"
          delay={80}
          onClick={chooseKid}
          disabled={busy}
        />
      </div>

      {error && <p className="animate-pop-in relative mt-2 text-center text-sm text-danger">{error}</p>}

      <PressButton
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
        className="relative mx-auto mt-4 py-3 text-sm font-semibold text-muted transition hover:text-ink"
      >
        Sign out
      </PressButton>
    </div>
  )
}

function RoleCard({
  Icon,
  title,
  subtitle,
  grad,
  glow,
  delay,
  onClick,
  disabled,
}: {
  Icon: LucideIcon
  title: string
  subtitle: string
  grad: string
  glow: string
  delay: number
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <PressButton
      onClick={onClick}
      disabled={disabled}
      spring="lg"
      className="grad-border animate-pop-in flex-1 overflow-hidden rounded-3xl p-6 text-left shadow-pop disabled:opacity-50"
      style={{ backgroundImage: 'var(--grad-card)', animationDelay: `${delay}ms` }}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white"
        style={{ backgroundImage: grad, boxShadow: glow }}
      >
        <Icon size={30} />
      </div>
      <div className="h-1 w-8 rounded-full" style={{ backgroundImage: grad }} />
      <div className="mt-3 text-xl font-extrabold text-ink">{title}</div>
      <div className="mt-1 text-sm text-muted">{subtitle}</div>
    </PressButton>
  )
}
