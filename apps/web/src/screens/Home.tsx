import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
import { Chat } from '../components/Chat'
import { FamilyView } from '../components/family/FamilyView'

/**
 * Main surface after onboarding.
 * Pane 0 = PAL chat (default). Swipe left → Pane 1 = family dashboard.
 * A segmented control mirrors/controls the active pane for desktop.
 */
export function Home() {
  const navigate = useNavigate()
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const logout = useAuthStore((s) => s.logout)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [pane, setPane] = useState(0)

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
    <div className="fixed inset-0 flex flex-col bg-canvas">
      {/* Top bar: segmented control + logout */}
      <div className="flex items-center justify-between border-b border-surface2 px-3 py-2">
        <div className="flex rounded-full bg-surface p-1">
          <Tab label="AI" active={pane === 0} onClick={() => goTo(0)} />
          <Tab label="Family" active={pane === 1} onClick={() => goTo(1)} />
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
          className="px-3 text-sm text-muted hover:text-ink"
        >
          Log out
        </button>
      </div>

      {/* Swipeable panes */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        <section className="h-full w-full flex-none snap-start">
          <Chat />
        </section>
        <section className="h-full w-full flex-none snap-start">
          <FamilyView />
        </section>
      </div>
    </div>
  )
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
        active ? 'bg-accent text-black' : 'text-muted'
      }`}
    >
      {label}
    </button>
  )
}
