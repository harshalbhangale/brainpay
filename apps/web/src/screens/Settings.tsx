import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, LogOut, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { AVATARS, useAvatar } from '../lib/avatar'
import { VOICE_OPTIONS, useVoicePrefs } from '../lib/voicePrefs'
import { PressButton } from '../components/ui'

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
  const { avatar, setAvatar } = useAvatar()
  const { voice, setVoice } = useVoicePrefs()

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
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-grad-aurora opacity-15 blur-[90px]" />
      {/* Header */}
      <div
        className="relative flex items-center justify-between border-b border-border px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <h1 className="text-lg font-extrabold text-ink">Settings</h1>
        <PressButton
          onClick={onClose}
          className="glass flex h-9 w-9 items-center justify-center rounded-full text-muted"
          aria-label="Close settings"
        >
          <X size={18} />
        </PressButton>
      </div>

      <div className="relative flex-1 overflow-y-auto px-5 py-5">
        {/* Profile */}
        <div className="animate-pop-in grad-border mb-6 flex items-center gap-4 rounded-2xl p-4 shadow-pop" style={{ backgroundImage: 'var(--grad-card)' }}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold text-on-accent glow-accent" style={{ backgroundImage: 'var(--grad-accent-bright)' }}>
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-ink">{name}</div>
            <div className="text-sm text-muted">
              {role} · {account?.phone ?? ''}
            </div>
          </div>
        </div>

        {/* Companion */}
        <Section title="Companion">
          {AVATARS.map((a) => (
            <PressButton
              key={a.id}
              onClick={() => setAvatar(a.id)}
              ripple={false}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-surface2"
            >
              <span className="text-sm font-medium text-ink">{a.name}</span>
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full transition"
                style={{
                  backgroundImage: avatar === a.id ? 'var(--grad-accent-bright)' : undefined,
                  boxShadow: avatar === a.id ? 'var(--glow-accent)' : 'inset 0 0 0 2px var(--surface-2)',
                }}
              >
                {avatar === a.id && <span className="h-2 w-2 rounded-full bg-on-accent" />}
              </span>
            </PressButton>
          ))}
        </Section>

        {/* Voice */}
        <Section title="PAL voice">
          {VOICE_OPTIONS.map((v) => (
            <PressButton
              key={v.key}
              onClick={() => setVoice(v.key)}
              ripple={false}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface2"
            >
              <span className="text-xl">{v.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{v.label}</span>
                <span className="block text-xs text-muted">{v.desc}</span>
              </span>
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition"
                style={{
                  backgroundImage: voice === v.key ? 'var(--grad-accent-bright)' : undefined,
                  boxShadow: voice === v.key ? 'var(--glow-accent)' : 'inset 0 0 0 2px var(--surface-2)',
                }}
              >
                {voice === v.key && <span className="h-2 w-2 rounded-full bg-on-accent" />}
              </span>
            </PressButton>
          ))}
        </Section>
        <p className="-mt-4 mb-6 px-1 text-xs text-muted">
          StudyPal interviews always use a warm tutor voice. Voices lean Australian.
        </p>

        {/* Preferences */}
        <Section title="Preferences">
          <ToggleRow label="Sound effects" on={prefs.sound} onToggle={() => setPref({ sound: !prefs.sound })} />
          <ToggleRow label="Haptics" on={prefs.haptics} onToggle={() => setPref({ haptics: !prefs.haptics })} />
          <ToggleRow label="PAL voice replies" on={prefs.palVoice} onToggle={() => setPref({ palVoice: !prefs.palVoice })} />
        </Section>

        {/* Data */}
        <Section title="Data">
          <PressButton
            onClick={clearChat}
            disabled={clearing}
            ripple={false}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-surface2 disabled:opacity-50"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-ink">
              <Trash2 size={18} className="text-muted" /> Clear PAL chat history
            </span>
            <span className="text-sm text-muted">{cleared ? 'Cleared' : clearing ? '…' : ''}</span>
          </PressButton>
        </Section>

        {/* About */}
        <Section title="About">
          <Row label="App" value="BrainPal Web" />
          <Row label="Version" value="1.0.0" />
          <a
            href="https://brainpal.com.au"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-4 py-3.5 transition hover:bg-surface2"
          >
            <span className="text-sm font-medium text-ink">Terms &amp; Privacy</span>
            <span className="text-sm text-muted">›</span>
          </a>
        </Section>

        <PressButton
          onClick={signOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-danger/10 py-3.5 text-sm font-bold text-danger ring-1 ring-danger/20"
        >
          <LogOut size={16} /> Sign out
        </PressButton>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-extrabold uppercase tracking-widest text-muted">{title}</h3>
      <div className="grad-border divide-y divide-[var(--border)] overflow-hidden rounded-2xl" style={{ backgroundImage: 'var(--grad-card)' }}>{children}</div>
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
        className="relative h-6 w-11 rounded-full transition-all duration-300"
        style={{ backgroundImage: on ? 'var(--grad-accent-bright)' : undefined, backgroundColor: on ? undefined : 'var(--surface-2)', boxShadow: on ? 'var(--glow-accent)' : undefined }}
        aria-pressed={on}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300"
          style={{ left: on ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}