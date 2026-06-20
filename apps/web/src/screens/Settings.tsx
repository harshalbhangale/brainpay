import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Sun, Moon, X, LogOut, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../lib/theme'
import { AVATARS, useAvatar } from '../lib/avatar'

/**
 * Settings — a full-screen overlay reachable from the Home top bar.
 *
 * Account details, app preferences (persisted locally), and destructive
 * actions (clear chat, sign out). Kept self-contained so it can be dropped
 * into any screen without routing changes.
 */

type Prefs = { sound: boolean; haptics: boolean; palVoice: boolean }
const PREFS_KEY = 'brainpal.prefs'
const DEFAULT_PREFS: Prefs = { sound: true, haptics: true, palVoice: true }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export function Settings({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const account = useAuthStore((s) => s.account)
  const logout = useAuthStore((s) => s.logout)
  const { theme, setTheme } = useTheme()
  const { avatar, setAvatar } = useAvatar()

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  const name = (account?.persona?.name as string) || 'You'
  const role = account?.accountType === 'kid' ? 'Kid' : 'Parent'

  function setPref(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  async function clearChat() {
    if (clearing) return
    setClearing(true)
    try {
      await api('/chat/history', { method: 'DELETE' })
      setCleared(true)
      setTimeout(() => setCleared(false), 2000)
    } catch {
      /* ignore */
    } finally {
      setClearing(false)
    }
  }

  function signOut() {
    logout()
    qc.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-surface2 px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <h1 className="text-lg font-extrabold text-ink">Settings</h1>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-muted transition hover:text-ink active:scale-95"
          aria-label="Close settings"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Profile */}
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-surface p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/20 text-2xl font-extrabold text-ink">
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-ink">{name}</div>
            <div className="text-sm text-muted">
              {role} · {account?.phone ?? ''}
            </div>
          </div>
        </div>

        {/* Appearance */}
        <Section title="Appearance">
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm font-medium text-ink">Theme</span>
            <div className="flex rounded-full bg-surface2 p-1">
              <SegBtn active={theme === 'light'} onClick={() => setTheme('light')}>
                <Sun size={15} /> Light
              </SegBtn>
              <SegBtn active={theme === 'dark'} onClick={() => setTheme('dark')}>
                <Moon size={15} /> Dark
              </SegBtn>
            </div>
          </div>
        </Section>

        {/* Companion */}
        <Section title="Companion">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAvatar(a.id)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left transition active:bg-surface2"
            >
              <span className="text-sm font-medium text-ink">{a.name}</span>
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full ring-2"
                style={{
                  borderColor: 'transparent',
                  backgroundColor: avatar === a.id ? 'var(--color-accent)' : 'transparent',
                  boxShadow: avatar === a.id ? 'none' : 'inset 0 0 0 2px var(--color-surface2)',
                }}
              >
                {avatar === a.id && <span className="h-2 w-2 rounded-full bg-on-accent" />}
              </span>
            </button>
          ))}
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <ToggleRow label="Sound effects" on={prefs.sound} onToggle={() => setPref({ sound: !prefs.sound })} />
          <ToggleRow label="Haptics" on={prefs.haptics} onToggle={() => setPref({ haptics: !prefs.haptics })} />
          <ToggleRow label="PAL voice replies" on={prefs.palVoice} onToggle={() => setPref({ palVoice: !prefs.palVoice })} />
        </Section>

        {/* Data */}
        <Section title="Data">
          <button
            onClick={clearChat}
            disabled={clearing}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left transition active:bg-surface2 disabled:opacity-50"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-ink">
              <Trash2 size={18} className="text-muted" /> Clear PAL chat history
            </span>
            <span className="text-sm text-muted">{cleared ? 'Cleared' : clearing ? '…' : ''}</span>
          </button>
        </Section>

        {/* About */}
        <Section title="About">
          <Row label="App" value="BrainPal Web" />
          <Row label="Version" value="1.0.0" />
          <a
            href="https://brainpal.com.au"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-4 py-3.5 active:bg-surface2"
          >
            <span className="text-sm font-medium text-ink">Terms &amp; Privacy</span>
            <span className="text-sm text-muted">›</span>
          </a>
        </Section>

        <button
          onClick={signOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-danger/10 py-3.5 text-sm font-bold text-danger transition active:scale-[0.99]"
        >
          <LogOut size={16} /> Sign out
        </button>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      <div className="divide-y divide-surface2 overflow-hidden rounded-2xl bg-surface">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-sm text-muted">{value}</span>
    </div>
  )
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <button
        onClick={onToggle}
        className="relative h-6 w-11 rounded-full transition"
        style={{ backgroundColor: on ? '#3ddc84' : '#3a3a45' }}
        aria-pressed={on}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: on ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active ? 'bg-accent text-on-accent' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}
