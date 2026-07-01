/**
 * Profile — the single place for who you are + all settings + sign out.
 * ───────────────────────────────────────────────────────────────────────────
 * Opened from the profile button beside the Pal rail. Built entirely from `.pv`
 * primitives so it matches MoneyPal / StudyPal. Logout lives ONLY here (and the
 * pre-onboarding role screen), so it's consistent across the app.
 *
 * Layout: a sticky translucent header (separated by a hairline so it never
 * collides with scrolling content) over calmly-spaced, grouped setting cards.
 */
import { useState, useRef, Children } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, LogOut, Trash2, ChevronRight, Check, Camera, Pencil, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { AVATARS, useAvatar } from '../../lib/avatar'
import { VOICE_OPTIONS, useVoicePrefs } from '../../lib/voicePrefs'
import { PALS, type PalDef } from '../pals/config'
import { usePalAvatars } from '../pals/usePalAvatars'
import { Avatar, Button } from '../components/primitives'
import { PersonaDetails } from './PersonaDetails'

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
  const updateAccount = useAuthStore((s) => s.updateAccount)
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

  // Editable identity (name + photo), persisted to persona via PATCH /me.
  const fileRef = useRef<HTMLInputElement>(null)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [savingId, setSavingId] = useState(false)

  async function savePersona(patch: Record<string, unknown>) {
    setSavingId(true)
    try {
      const next = { ...(account?.persona ?? {}), ...patch }
      const res = await api<{ account: NonNullable<typeof account> }>('/me', { method: 'PATCH', body: JSON.stringify({ persona: next }) })
      updateAccount(res.account)
    } catch { /* ignore — keep prior value */ } finally {
      setSavingId(false)
    }
  }

  function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') void savePersona({ avatar: reader.result }) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function commitName() {
    const n = draftName.trim()
    setEditingName(false)
    if (n && n !== name) void savePersona({ name: n })
    else setDraftName(name)
  }

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
      {/* Sticky translucent header — hairline keeps it off the scroll content. */}
      <header
        className="sticky top-0 z-10 flex flex-none items-center justify-between px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]"
        style={{ background: 'color-mix(in srgb, var(--pv-bg) 72%, transparent)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', borderBottom: '1px solid var(--pv-line)' }}
      >
        <h1 className="pv-h2">Profile</h1>
        <button onClick={onClose} aria-label="Close" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink-2)' }}>
          <X size={20} />
        </button>
      </header>

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-10 pt-5">
        {/* Identity card — editable photo + name */}
        <div className="pv-rise overflow-hidden rounded-[var(--pv-r-lg)] p-5" style={{ background: 'var(--pv-grad-ink)', boxShadow: 'var(--pv-shadow-md)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => fileRef.current?.click()} aria-label="Change photo" className="pv-press relative shrink-0 rounded-full">
              <Avatar name={name} src={photo} size={64} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--pv-accent)', color: 'var(--pv-on-accent)', boxShadow: '0 0 0 2px var(--pv-ink)' }}>
                <Camera size={12} strokeWidth={2.6} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitName() }}
                  maxLength={40}
                  className="w-full rounded-xl px-3 py-1.5 text-lg font-bold outline-none"
                  style={{ background: 'rgba(255,255,255,0.14)', color: 'var(--pv-on-dark)' }}
                />
              ) : (
                <button onClick={() => { setDraftName(name); setEditingName(true) }} className="pv-press flex max-w-full items-center gap-1.5 text-left">
                  <span className="truncate text-xl font-bold tracking-tight" style={{ color: 'var(--pv-on-dark)' }}>{name}</span>
                  {savingId ? <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: 'rgba(255,255,255,0.6)' }} /> : <Pencil size={13} className="shrink-0" style={{ color: 'rgba(255,255,255,0.55)' }} />}
                </button>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.16)', color: 'var(--pv-on-dark)' }}>{role}</span>
                {account?.phone && <span className="truncate text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>{account.phone}</span>}
              </div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoPick} />
        </div>

        {/* About you / your family — editable persona */}
        <PersonaDetails />

        {/* Pal companions — assign an avatar to each Pal (name follows the pick) */}
        <section className="mt-6">
          <h3 className="pv-label mb-2.5">Pal companions</h3>
          <div className="flex flex-col gap-3">
            {PALS.map((p) => <PalAvatarRow key={p.key} pal={p} />)}
          </div>
          <p className="mt-2.5 px-1 text-xs" style={{ color: 'var(--pv-ink-3)' }}>Choose which avatar fronts each Pal. VRM avatars (Shizuka, Nova) are higher-detail and load a little slower.</p>
        </section>

        {/* Your companion (used outside the Pals, e.g. onboarding) */}
        <Section title="Your companion">
          {AVATARS.map((a) => (
            <SelectRow key={a.id} label={a.name} sub={a.blurb} selected={avatar === a.id} onClick={() => setAvatar(a.id)} />
          ))}
        </Section>

        {/* PAL voice */}
        <Section title="PAL voice" caption="StudyPal interviews always use a warm tutor voice.">
          {VOICE_OPTIONS.map((v) => (
            <SelectRow key={v.key} label={v.label} sub={v.desc} emoji={v.emoji} selected={voice === v.key} onClick={() => setVoice(v.key)} />
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
          <button onClick={clearChat} disabled={clearing} className="pv-press flex min-h-[52px] w-full items-center justify-between px-4 py-3.5 text-left disabled:opacity-50">
            <span className="flex items-center gap-3 text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>
              <Trash2 size={18} style={{ color: 'var(--pv-ink-3)' }} /> Clear PAL chat history
            </span>
            <span className="text-sm font-semibold" style={{ color: cleared ? 'var(--pv-pos)' : 'var(--pv-ink-3)' }}>{cleared ? 'Cleared' : clearing ? '…' : ''}</span>
          </button>
        </Section>

        {/* About */}
        <Section title="About">
          <Row label="App" value="BrainPal Web" />
          <Row label="Version" value="1.0.0" />
          <a href="https://brainpal.com.au" target="_blank" rel="noreferrer" className="pv-press flex min-h-[52px] items-center justify-between px-4 py-3.5">
            <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>Terms &amp; Privacy</span>
            <ChevronRight size={16} style={{ color: 'var(--pv-ink-3)' }} />
          </a>
        </Section>

        {/* Sign out — the single, consistent logout */}
        <div className="mt-7">
          {confirmOut ? (
            <div className="pv-pop rounded-[var(--pv-r-lg)] p-4" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-md)' }}>
              <p className="pv-body" style={{ color: 'var(--pv-ink-2)' }}>Sign out of BrainPal on this device?</p>
              <div className="mt-3 flex gap-2">
                <Button variant="soft" full onClick={() => setConfirmOut(false)}>Cancel</Button>
                <button onClick={signOut} className="pv-press-lg inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmOut(true)} className="pv-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
              <LogOut size={16} /> Sign out
            </button>
          )}
        </div>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

function PalAvatarRow({ pal }: { pal: PalDef }) {
  const current = usePalAvatars((s) => s.avatars[pal.key])
  const setPalAvatar = usePalAvatars((s) => s.setPalAvatar)
  return (
    <div className="overflow-hidden rounded-[var(--pv-r-lg)] p-3" style={{ background: 'var(--pv-surface)', border: '1px solid var(--pv-line)' }}>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundImage: pal.gradient, color: pal.onAccent }}>
          <pal.Icon size={15} strokeWidth={2.4} />
        </span>
        <span className="pv-title text-sm">{pal.name}</span>
      </div>
      <div className="pv-no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {AVATARS.map((a) => {
          const on = a.id === current
          return (
            <button
              key={a.id}
              onClick={() => setPalAvatar(pal.key, a.id)}
              className="pv-press flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5"
              style={on ? { backgroundImage: pal.gradient, color: pal.onAccent, boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: on ? 'rgba(255,255,255,0.28)' : a.accent, color: '#fff' }}>
                {a.name.slice(0, 1)}
              </span>
              <span className="text-xs font-bold">{a.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  const items = Children.toArray(children)
  return (
    <section className="mt-6">
      <h3 className="pv-label mb-2.5">{title}</h3>
      <div className="overflow-hidden rounded-[var(--pv-r-lg)]" style={{ background: 'var(--pv-surface)', border: '1px solid var(--pv-line)' }}>
        {items.map((child, i) => (
          <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--pv-line)' }}>
            {child}
          </div>
        ))}
      </div>
      {caption && <p className="mt-2.5 px-1 text-xs" style={{ color: 'var(--pv-ink-3)' }}>{caption}</p>}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between px-4 py-3.5">
      <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
      <span className="text-sm" style={{ color: 'var(--pv-ink-3)' }}>{value}</span>
    </div>
  )
}

function SelectRow({ label, sub, emoji, selected, onClick }: { label: string; sub?: string; emoji?: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pv-press flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left">
      {emoji && <span className="shrink-0 text-xl">{emoji}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
        {sub && <span className="block truncate text-xs" style={{ color: 'var(--pv-ink-3)' }}>{sub}</span>}
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={selected ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)' } : { border: '2px solid var(--pv-line-strong)' }}>
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  )
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between px-4 py-3.5">
      <span className="text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{label}</span>
      <button onClick={onToggle} aria-pressed={on} aria-label={label} className="pv-press relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: on ? 'var(--pv-accent)' : 'var(--pv-surface-3)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} />
      </button>
    </div>
  )
}
