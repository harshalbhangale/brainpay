/**
 * Profile — the single place for who you are + all settings + sign out.
 * ───────────────────────────────────────────────────────────────────────────
 * Opened from the profile button beside the Pal rail. Built entirely from `.pv`
 * primitives so it matches MoneyPal / StudyPal. Logout lives ONLY here (and the
 * pre-onboarding role screen), so it's consistent across the app.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, LogOut, Trash2, ChevronRight, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { AVATARS, useAvatar } from '../../lib/avatar'
import { VOICE_OPTIONS, useVoicePrefs } from '../../lib/voicePrefs'
import { Avatar, Button, Card } from '../components/primitives'

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

export function Profile({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const account = useAuthStore((s) => s.account)
  const logout = useAuthStore((s) => s.logout)
  const { avatar, setAvatar } = useAvatar()
  const { voice, setVoice } = useVoicePrefs()

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)

  const name = (account?.persona?.name as string) || 'You'
  const photo = typeof account?.persona?.avatar === 'string' ? (account.persona.avatar as string) : undefined
  const role = account?.accountType === 'kid' ? 'Kid' : 'Parent'

  function setPref(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
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
    } catch { /* ignore */ } finally {
      setClearing(false)
    }
  }

  function signOut() {
    logout()
    qc.clear()
    // PayApp gates on the auth token, so clearing it re-renders to Login.
  }

  return (
    <div className="pv fixed inset-0 z-[70] flex flex-col" style={{ background: 'var(--pv-bg)' }} role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex flex-none items-center justify-between px-5 pb-2 pt-[max(16px,env(safe-area-inset-top))]">
        <h1 className="pv-h1">Profile</h1>
        <button onClick={onClose} aria-label="Close" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink-2)' }}>
          <X size={20} />
        </button>
      </div>

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-10">
        {/* Identity card */}
        <Card className="pv-rise flex items-center gap-4 p-5" style={{ background: 'var(--pv-grad-ink)' }}>
          <Avatar name={name} src={photo} size={60} />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold" style={{ color: 'var(--pv-on-dark)' }}>{name}</div>
            <div className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {role}{account?.phone ? ` · ${account.phone}` : ''}
            </div>
          </div>
        </Card>

        {/* Companion */}
        <Section title="Companion">
          {AVATARS.map((a) => (
            <SelectRow key={a.id} label={a.name} selected={avatar === a.id} onClick={() => setAvatar(a.id)} />
          ))}
        </Section>

        {/* PAL voice */}
        <Section title="PAL voice">
          {VOICE_OPTIONS.map((v) => (
            <SelectRow key={v.key} label={v.label} sub={v.desc} emoji={v.emoji} selected={voice === v.key} onClick={() => setVoice(v.key)} />
          ))}
        </Section>
        <p className="-mt-3 mb-6 px-1 text-xs" style={{ color: 'var(--pv-ink-3)' }}>
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
          <button onClick={clearChat} disabled={clearing} className="pv-press flex w-full items-center justify-between px-4 py-3.5 text-left disabled:opacity-50">
            <span className="flex items-center gap-3 text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>
              <Trash2 size={18} style={{ color: 'var(--pv-ink-3)' }} /> Clear PAL chat history
            </span>
            <span className="text-sm" style={{ color: 'var(--pv-ink-3)' }}>{cleared ? 'Cleared' : clearing ? '…' : ''}</span>
          </button>
        </Section>

        {/* About */}
        <Section title="About">
          <Row label="App" value="BrainPal Web" />
          <Row label="Version" value="1.0.0" />
          <a href="https://brainpal.com.au" target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>Terms &amp; Privacy</span>
            <ChevronRight size={16} style={{ color: 'var(--pv-ink-3)' }} />
          </a>
        </Section>

        {/* Sign out — the single, consistent logout */}
        {confirmOut ? (
          <Card className="pv-pop mt-2 p-4">
            <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>Sign out of BrainPal on this device?</p>
            <div className="mt-3 flex gap-2">
              <Button variant="soft" full onClick={() => setConfirmOut(false)}>Cancel</Button>
              <button onClick={signOut} className="pv-press-lg inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </Card>
        ) : (
          <button onClick={() => setConfirmOut(true)} className="pv-press mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
            <LogOut size={16} /> Sign out
          </button>
        )}

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="pv-label mb-2">{title}</h3>
      <Card flat className="overflow-hidden p-0">
        <div className="divide-y" style={{ borderColor: 'var(--pv-line)' }}>{children}</div>
      </Card>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
      <span className="text-sm" style={{ color: 'var(--pv-ink-3)' }}>{value}</span>
    </div>
  )
}

function SelectRow({ label, sub, emoji, selected, onClick }: { label: string; sub?: string; emoji?: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pv-press flex w-full items-center gap-3 px-4 py-3.5 text-left">
      {emoji && <span className="text-xl">{emoji}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
        {sub && <span className="block text-xs" style={{ color: 'var(--pv-ink-3)' }}>{sub}</span>}
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={selected ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { border: '2px solid var(--pv-line-strong)' }}>
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  )
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
      <button onClick={onToggle} aria-pressed={on} className="relative h-6 w-11 rounded-full transition-colors" style={{ background: on ? 'var(--pv-accent)' : 'var(--pv-surface-3)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} />
      </button>
    </div>
  )
}
