/**
 * KidCardSheet + KidMapSheet (light) — per-kid card controls and live location.
 * Reuses lib/card (deterministic PAN + persisted controls) and lib/maps.
 */
import { useState } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, MapPin, Palette, Check, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { useCardSettings, cardNumber, cardExpiry, cardCvv, cardLast4, maskedNumber } from '../../../lib/card'
import { aud } from '../../../lib/format'
import { staticMapUrl, embedMapUrl } from '../../../lib/maps'
import { Card } from '../../components/primitives'
import { BottomSheet } from '../../components/BottomSheet'
import { cardSkin, CARD_SKINS } from '../../lib/cardSkins'

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      {children}
    </BottomSheet>
  )
}

/* ───────────────────────────────────────────────────────── Card controls */
export function KidCardSheet({ accountId, name, onClose }: { accountId: string; name: string; onClose: () => void }) {
  const [settings, update] = useCardSettings(accountId)
  const [revealed, setRevealed] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nameInput, setNameInput] = useState<string | null>(null)
  const skin = cardSkin(settings.design)
  const displayName = (settings.label || name).toUpperCase()

  return (
    <Sheet title={`${name}'s card`} onClose={onClose}>
      {/* Card face — renders the holder's chosen skin (artwork or gradient). */}
      <div className="pv-sheen relative mt-4 overflow-hidden rounded-[var(--pv-r-lg)] p-5" style={{ backgroundImage: skin.gradient, color: skin.fg, boxShadow: 'var(--pv-shadow-md)', aspectRatio: '1.586', textShadow: skin.image ? '0 1px 8px rgba(0,0,0,0.55)' : undefined }}>
        {skin.image ? (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${skin.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,9,12,0.44) 0%, rgba(8,9,12,0.05) 30%, rgba(8,9,12,0.10) 56%, rgba(8,9,12,0.68) 100%)' }} />
          </>
        ) : (
          <span aria-hidden className="pointer-events-none absolute -bottom-6 -right-3 select-none" style={{ fontSize: 128, lineHeight: 1, opacity: 0.16 }}>{skin.mascot}</span>
        )}

        <div className="relative flex items-start justify-between">
          <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ opacity: 0.7 }}>{settings.frozen ? 'Frozen' : 'Debit'}</span>
        </div>

        <div className="relative mt-4 flex items-center gap-3">
          <span className="h-8 w-11 rounded-md" style={{ background: skin.chip === 'gold' ? 'linear-gradient(135deg,#f7e08a,#b8860b)' : 'linear-gradient(135deg,#eef2f7,#9aa3af)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }} />
          <Nfc size={20} style={{ opacity: 0.85, transform: 'rotate(90deg)' }} />
          {skin.hero && !skin.image && <span className="ml-auto text-2xl leading-none">{skin.mascot}</span>}
        </div>

        <div className="pv-amount relative mt-3 text-lg tracking-[0.16em]">{revealed ? cardNumber(accountId) : maskedNumber(cardLast4(accountId))}</div>

        <div className="relative mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-wide">{displayName}</div>
            <div className="mt-0.5 flex gap-3 text-[11px] font-bold" style={{ opacity: 0.9 }}>
              <span>{revealed ? cardExpiry(accountId) : '••/••'}</span>
              <span>CVV {revealed ? cardCvv(accountId) : '•••'}</span>
            </div>
          </div>
          <span className="text-2xl font-black italic leading-none tracking-tight" style={{ color: skin.visa }}>VISA</span>
        </div>
      </div>

      {/* Primary actions — the card shows directly; freeze + controls live in Settings. */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <ActionPill Icon={revealed ? EyeOff : Eye} label={revealed ? 'Hide' : 'Show'} onClick={() => setRevealed((v) => !v)} />
        <ActionPill Icon={Palette} label="Customize" active={customizing} onClick={() => { setCustomizing((v) => !v); setSettingsOpen(false) }} />
        <ActionPill Icon={SlidersHorizontal} label="Settings" active={settingsOpen} dot={settings.frozen} onClick={() => { setSettingsOpen((v) => !v); setCustomizing(false) }} />
      </div>
      {customizing && (
        <Card flat className="pv-rise mt-3 p-4">
          <p className="pv-label mb-2">Design</p>
          <div className="grid grid-cols-4 gap-2">
            {CARD_SKINS.map((s) => {
              const on = (settings.design || 'ink') === s.id
              return (
                <button key={s.id} onClick={() => update({ design: s.id })} className="pv-press relative flex aspect-[1.586] items-end overflow-hidden rounded-xl p-1.5" style={{ backgroundImage: s.image ? `url(${s.image})` : s.gradient, backgroundSize: 'cover', backgroundPosition: 'center', color: s.fg, outline: on ? '2.5px solid var(--pv-accent)' : 'none', outlineOffset: 2 }}>
                  {s.image ? (
                    <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 38%, rgba(8,9,12,0.66) 100%)' }} />
                  ) : (
                    <span className="absolute right-1 top-1 text-sm">{s.mascot}</span>
                  )}
                  <span className="relative text-[9px] font-extrabold" style={{ textShadow: s.image ? '0 1px 3px rgba(0,0,0,0.7)' : undefined }}>{s.name}</span>
                  {on && <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full" style={{ background: 'var(--pv-accent)', color: 'var(--pv-on-accent)' }}><Check size={10} strokeWidth={3.4} /></span>}
                </button>
              )
            })}
          </div>
          <p className="pv-label mb-2 mt-4">Name on card</p>
          <input
            value={nameInput ?? settings.label}
            onChange={(e) => setNameInput(e.target.value.slice(0, 22))}
            onBlur={() => { const v = (nameInput ?? '').trim(); if (nameInput !== null && v !== settings.label) update({ label: v }) }}
            placeholder={name}
            maxLength={22}
            className="w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none"
            style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}
          />
        </Card>
      )}

      {settingsOpen && (
        <div className="pv-rise mt-3">
          {/* Freeze */}
          <button onClick={() => update({ frozen: !settings.frozen })} className="pv-press flex w-full items-center justify-between rounded-2xl px-4 py-3.5" style={settings.frozen ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
            <span className="flex items-center gap-2.5 text-sm font-bold"><Snowflake size={18} /> {settings.frozen ? 'Card frozen' : 'Freeze card'}</span>
            <span className="text-xs font-bold" style={{ opacity: 0.75 }}>{settings.frozen ? 'Tap to unfreeze' : 'Tap to freeze'}</span>
          </button>

          <Card flat className="mt-3 flex items-center gap-3 p-4">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: settings.frozen ? 'var(--pv-neg)' : 'var(--pv-pos)' }} />
            <span className="text-sm font-semibold">{settings.frozen ? 'Card is frozen' : 'Card is active'}</span>
          </Card>

          <p className="pv-label mt-5">Controls</p>
          <Card flat className="mt-2 overflow-hidden">
            <ToggleRow Icon={Globe} label="Online payments" on={settings.online} disabled={settings.frozen} onToggle={() => update({ online: !settings.online })} />
            <div className="h-px" style={{ background: 'var(--pv-line)' }} />
            <ToggleRow Icon={Banknote} label="ATM withdrawals" on={settings.atm} disabled={settings.frozen} onToggle={() => update({ atm: !settings.atm })} />
            <div className="h-px" style={{ background: 'var(--pv-line)' }} />
            <ToggleRow Icon={Nfc} label="Contactless (tap to pay)" on={settings.contactless} disabled={settings.frozen} onToggle={() => update({ contactless: !settings.contactless })} />
            <div className="h-px" style={{ background: 'var(--pv-line)' }} />
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3"><Gauge size={20} style={{ color: 'var(--pv-ink-3)' }} /><span className="text-sm font-medium">Daily spend limit</span></div>
              <div className="flex items-center gap-2">
                <button onClick={() => update({ dailyLimit: Math.max(0, settings.dailyLimit - 10) })} className="pv-press h-7 w-7 rounded-full font-bold" style={{ background: 'var(--pv-surface-2)' }}>−</button>
                <span className="w-16 text-right text-sm font-bold pv-text-accent">{aud(settings.dailyLimit)}</span>
                <button onClick={() => update({ dailyLimit: settings.dailyLimit + 10 })} className="pv-press h-7 w-7 rounded-full font-bold" style={{ background: 'var(--pv-surface-2)' }}>+</button>
              </div>
            </div>
          </Card>

          <button onClick={() => update({ frozen: true })} className="pv-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
            <ShieldAlert size={16} /> Report lost or stolen
          </button>
        </div>
      )}
    </Sheet>
  )
}

function ActionPill({ Icon, label, active, dot, onClick }: { Icon: LucideIcon; label: string; active?: boolean; dot?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pv-press relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3" style={active ? { background: 'var(--pv-accent-soft)', color: 'var(--pv-accent-2)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
      {dot && <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: 'var(--pv-neg)' }} aria-hidden />}
      <Icon size={18} />
      <span className="text-xs font-bold">{label}</span>
    </button>
  )
}

function ToggleRow({ Icon, label, on, disabled, onToggle }: { Icon: LucideIcon; label: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  const effectiveOn = on && !disabled
  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div className="flex items-center gap-3"><Icon size={20} style={{ color: 'var(--pv-ink-3)' }} /><span className="text-sm font-medium">{label}</span></div>
      <button onClick={() => !disabled && onToggle()} disabled={disabled} aria-pressed={effectiveOn} className="relative h-6 w-11 rounded-full transition-all duration-300" style={{ background: effectiveOn ? 'var(--pv-accent)' : 'var(--pv-surface-3)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300" style={{ left: effectiveOn ? '22px' : '2px' }} />
      </button>
    </div>
  )
}

/* ───────────────────────────────────────────────────────── Location map */
function mockLatLng(seed: string): { lat: number; lng: number; place: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const lat = -33.87 + ((h % 200) - 100) / 2000
  const lng = 151.21 + (((h >> 8) % 200) - 100) / 2000
  const places = ['Near school', 'At home', 'Westfield Mall', 'Bondi Beach', 'Local park', 'Library']
  return { lat, lng, place: places[h % places.length] }
}

export function KidMapSheet({ name, accountId, location, onClose }: { name: string; accountId: string; location?: { lat: number; lng: number; place?: string | null; at?: string } | null; onClose: () => void }) {
  const hasReal = !!location && typeof location.lat === 'number' && typeof location.lng === 'number'
  const mock = mockLatLng(accountId)
  const lat = hasReal ? location!.lat : mock.lat
  const lng = hasReal ? location!.lng : mock.lng
  const place = hasReal ? location!.place || 'Live location' : mock.place

  return (
    <Sheet title={`Where is ${name}`} onClose={onClose}>
      <div className="mt-4 overflow-hidden rounded-[var(--pv-r-lg)]" style={{ boxShadow: 'var(--pv-shadow-sm)' }}>
        <img src={staticMapUrl([{ lat, lng }], { width: 720, height: 320, zoom: 15 })} alt={`${name} location`} className="h-40 w-full object-cover" loading="lazy" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <MapPin size={16} style={{ color: 'var(--pv-accent)' }} />
        <span className="text-sm font-semibold">{place}</span>
        {!hasReal && <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>sample</span>}
      </div>
      <div className="mt-4 overflow-hidden rounded-[var(--pv-r-lg)]" style={{ height: 320, boxShadow: 'var(--pv-shadow-sm)' }}>
        <iframe title={`${name} map`} className="h-full w-full border-0" src={embedMapUrl({ lat, lng }, 16)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    </Sheet>
  )
}
