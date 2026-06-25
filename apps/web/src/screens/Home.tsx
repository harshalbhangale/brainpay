import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
import { useLocationReporter } from '../lib/useLocationReporter'
import { Chat } from '../components/Chat'
import { FamilyView } from '../components/family/FamilyView'
import { StudyPal } from '../components/StudyPal'
import { Settings } from './Settings'

/**
 * Main surface after onboarding.
 * Pane 0 = PAL chat (default). Swipe left → Pane 1 = family dashboard.
 * A segmented control mirrors/controls the active pane for desktop.
 */
export function Home() {
  const navigate = useNavigate()
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [pane, setPane] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Kids report their device location so parents can see them on the maps.
  useLocationReporter(account?.accountType === 'kid')

  // Background sync of account (accountType / persona / balance).
  useEffect(() => {
    api<{ account: Account }>('/me')
      .then((res) => updateAccount(res.account))
      .catch(() => undefined)
  }, [updateAccount])

  // First-timers without a role go pick one.
  if (account && !account.accountType) return <Navigate to="/role" replace />

  function goTo(i: number) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== pane) setPane(i)
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas" style={{ height: '100dvh' }}>
      {/* Top bar: segmented control + settings */}
      <div
        className="flex items-center justify-between border-b border-border px-3 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <div className="glass flex rounded-full p-1">
          <Tab label="AI" active={pane === 0} onClick={() => goTo(0)} />
          <Tab label="MoneyPal" active={pane === 1} onClick={() => goTo(1)} />
          <Tab label="StudyPal" active={pane === 2} onClick={() => goTo(2)} />
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="press glass flex h-9 w-9 items-center justify-center rounded-full text-muted"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* Onboarding reminder for users who haven't set up their persona */}
      {account && account.accountType && !(account.persona as Record<string, unknown> | null)?.onboarded && (
        <button
          onClick={() => navigate(account.accountType === 'kid' ? '/onboarding-kid' : '/onboarding')}
          className="press flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left"
          style={{ backgroundImage: 'var(--grad-card)' }}
        >
          <span className="text-sm font-semibold text-ink">
            Finish setting up your profile so {account.accountType === 'kid' ? 'your companion' : 'PAL'} knows you better.
          </span>
          <span className="sheen shrink-0 rounded-full bg-grad-accent px-3 py-1 text-xs font-bold text-on-accent">Set up →</span>
        </button>
      )}

      {/* Swipeable panes */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        <section className="h-full w-full flex-none snap-start">
          <Chat />
        </section>
        <section className="h-full w-full flex-none snap-start">
          <FamilyView />
        </section>
        <section className="h-full w-full flex-none snap-start">
          <StudyPal />
        </section>
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`press relative rounded-full px-4 py-1.5 text-sm font-bold transition ${
        active ? 'text-on-accent' : 'text-muted'
      }`}
      style={active ? { backgroundImage: 'var(--grad-accent-bright)', boxShadow: 'var(--glow-accent)' } : undefined}
    >
      {label}
    </button>
  )
}
