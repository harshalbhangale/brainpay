import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore, type Account } from '../stores/auth'
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
        className="flex items-center justify-between border-b border-surface2 px-3 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <div className="flex rounded-full bg-surface p-1">
          <Tab label="AI" active={pane === 0} onClick={() => goTo(0)} />
          <Tab label="Family" active={pane === 1} onClick={() => goTo(1)} />
          <Tab label="Study" active={pane === 2} onClick={() => goTo(2)} />
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface2 hover:text-ink"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

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
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
        active ? 'bg-accent text-on-accent' : 'text-muted'
      }`}
    >
      {label}
    </button>
  )
}
