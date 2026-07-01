/**
 * Profile — who you are (Profile tab) + all app settings (Settings tab).
 * ───────────────────────────────────────────────────────────────────────────
 * Two clear tabs so identity/personalisation and app settings never blur into
 * one long list. The Companion studio shows a LIVE 3D preview of the exact
 * character you're choosing (per surface), so picking an avatar is never a
 * guess. Built from `.pv` primitives. Logout lives only here.
 */
import { useState, useRef, Children, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, LogOut, Trash2, ChevronRight, Check, Camera, Pencil, Loader2, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { AVATARS, avatarDef, useAvatar, type AvatarId } from '../../lib/avatar'
import { VOICE_OPTIONS, useVoicePrefs } from '../../lib/voicePrefs'
import { PALS, type PalKey } from '../pals/config'
import { usePalAvatars } from '../pals/usePalAvatars'
import { palAvatar } from '../pals/palCharacters'
import { Avatar, Button } from '../components/primitives'
import { PersonaDetails } from './PersonaDetails'

const Companion = lazy(() => import('../../components/Companion').then((m) => ({ default: m.Companion })))

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
  const { voice, setVoice } = useVoicePrefs()

  const [tab, setTab] = useState<'profile' | 'settings'>('profile')
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
  }

  return (
    <div className="pv fixed inset-0 z-[70] flex flex-col" style={{ background: 'var(--pv-bg)' }} role="dialog" aria-modal="true">
      {/* Sticky translucent header + tab switcher */}
      <header
        className="sticky top-0 z-10 flex-none px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]"
        style={{ background: 'color-mix(in srgb, var(--pv-bg) 72%, transparent)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', borderBottom: '1px solid var(--pv-line)' }}
      >
        <div className="flex items-center justify-between">
          <h1 className="pv-h2">{tab === 'profile' ? 'Profile' : 'Settings'}</h1>
          <button onClick={onClose} aria-label="Close" className="pv-press flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink-2)' }}>
            <X size={20} />
          </button>
        </div>
        <div className="mt-3 flex gap-1 rounded-full p-1" style={{ background: 'var(--pv-surface-2)' }}>
          {(['profile', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="pv-press flex-1 rounded-full py-2 text-sm font-bold capitalize"
              style={tab === t ? { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' } : { color: 'var(--pv-ink-3)' }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5">
        {tab === 'profile' ? (
          <>
            {/* Identity card — editable photo + name */}
            <div className="pv-rise overflow-hidden rounded-[var(--pv-r-lg)] p-5" style={{ background: 'var(--pv-grad-ink)', boxShadow: 'var(--pv-shadow-md)' }}>
              <div className="flex items-center gap-4">
                <button onClick={() => fileRef.current?.click()} aria-label="Change photo" className="pv-press relative shrink-0 rounded-full">
                  <Avatar name={name} src={photo} size={64} fun />
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
              <p className="mt-3 text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Tap your photo to upload one, or the name to rename.</p>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoPick} />
            </div>

            {/* About you / your family — editable persona */}
            <PersonaDetails />

            {/* Companion studio — live preview so you SEE who you pick */}
            <CompanionStudio />
          </>
        ) : (
          <>
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
          </>
        )}

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────── Companion studio (live 3D preview) */
function CompanionStudio() {
  const { avatar: globalAvatar, setAvatar: setGlobalAvatar } = useAvatar()
  const palAvatars = usePalAvatars((s) => s.avatars)
  const setPalAvatar = usePalAvatars((s) => s.setPalAvatar)
  const [target, setTarget] = useState<'global' | PalKey>('global')

  const currentId: AvatarId = target === 'global' ? globalAvatar : (palAvatars[target] ?? palAvatar(target))
  const def = avatarDef(currentId)

  const setForTarget = (id: AvatarId) => {
    if (target === 'global') setGlobalAvatar(id)
    else setPalAvatar(target, id)
  }

  const targets: { key: 'global' | PalKey; label: string }[] = [
    { key: 'global', label: 'Everywhere' },
    ...PALS.map((p) => ({ key: p.key, label: p.short })),
  ]

  return (
    <section className="mt-6">
      <h3 className="pv-label mb-2.5">Companion</h3>
      <div className="overflow-hidden rounded-[var(--pv-r-lg)]" style={{ background: 'var(--pv-surface)', border: '1px solid var(--pv-line)' }}>
        {/* Which surface this companion fronts */}
        <div className="pv-no-scrollbar flex gap-1.5 overflow-x-auto p-3">
          {targets.map((t) => {
            const on = t.key === target
            return (
              <button key={t.key} onClick={() => setTarget(t.key)} className="pv-press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold" style={on ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Live preview of the selected character */}
        <div className="relative mx-4 overflow-hidden rounded-[var(--pv-r-md)]" style={{ height: 248, background: 'var(--pv-grad-ink)' }}>
          <Suspense fallback={<PreviewLoading />}>
            <Companion key={currentId} avatar={currentId} mood="happy" className="h-full w-full" />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5" style={{ background: 'linear-gradient(0deg, rgba(11,12,15,0.72), transparent)' }}>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold" style={{ color: 'var(--pv-on-dark)' }}>{def.name}</span>
              {def.kind === 'vrm' && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>High detail</span>}
            </div>
            <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>{def.blurb}</div>
          </div>
        </div>

        {/* Character chips */}
        <div className="pv-no-scrollbar flex gap-2 overflow-x-auto px-4 pb-4 pt-3">
          {AVATARS.map((a) => {
            const on = a.id === currentId
            return (
              <button
                key={a.id}
                onClick={() => setForTarget(a.id)}
                className="pv-press relative flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3.5 py-2.5"
                style={on ? { background: 'var(--pv-accent-soft)', boxShadow: 'inset 0 0 0 2px var(--pv-accent)' } : { background: 'var(--pv-surface-2)' }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: a.accent }}>{a.name.slice(0, 1)}</span>
                <span className="text-[11px] font-bold" style={{ color: 'var(--pv-ink)' }}>{a.name}</span>
                {on && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-sm)' }}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-2.5 px-1 text-xs" style={{ color: 'var(--pv-ink-3)' }}>
        Pick a surface, then a character — the preview shows exactly who you'll see. <b style={{ color: 'var(--pv-ink-2)' }}>Everywhere</b> sets your default; each Pal can have its own.
      </p>
    </section>
  )
}

function PreviewLoading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <Sparkles size={22} className="animate-pulse" style={{ color: 'rgba(255,255,255,0.6)' }} />
      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>Loading character…</span>
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
