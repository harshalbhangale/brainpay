/**
 * KidCardSheet + KidMapSheet (light) — per-kid card controls and live location.
 * Reuses lib/card (deterministic PAN + persisted controls) and lib/maps.
 */
import { useState } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, X, MapPin, type LucideIcon } from 'lucide-react'
import { useCardSettings, cardNumber, cardExpiry, cardCvv, cardLast4, maskedNumber } from '../../../lib/card'
import { aud } from '../../../lib/format'
import { staticMapUrl, embedMapUrl } from '../../../lib/maps'
import { Button, Card } from '../../components/primitives'

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)' }} onClick={onClose} />
      <div className="pv-rise relative max-h-[92%] w-full max-w-[460px] overflow-y-auto rounded-t-[var(--pv-r-2xl)] p-6 pb-[max(24px,env(safe-area-inset-bottom))]" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
        <div className="flex items-center justify-between">
          <h2 className="pv-h2">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────── Card controls */
export function KidCardSheet({ accountId, name, onClose }: { accountId: string; name: string; onClose: () => void }) {
  const [settings, update] = useCardSettings(accountId)
  const [revealed, setRevealed] = useState(false)

  return (
    <Sheet title={`${name}'s card`} onClose={onClose}>
      {/* Card face — lime, like the reference debit card */}
      <div className="mt-4 overflow-hidden rounded-[var(--pv-r-lg)] p-5" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-md)', aspectRatio: '1.586', position: 'relative' }}>
        <div className="flex items-start justify-between">
          <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">{settings.frozen ? 'Frozen' : 'Debit'}</span>
        </div>
        <div className="mt-7 h-7 w-10 rounded-md" style={{ background: 'rgba(11,12,15,0.18)' }} />
        <div className="pv-amount mt-3 text-lg tracking-[0.12em]">{revealed ? cardNumber(accountId) : maskedNumber(cardLast4(accountId))}</div>
        <div className="mt-3 flex items-end justify-between text-xs font-bold">
          <span className="truncate">{name.toUpperCase()}</span>
          <span>{revealed ? cardExpiry(accountId) : '••/••'}</span>
          <span>CVV {revealed ? cardCvv(accountId) : '•••'}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <Button variant="soft" full leadingIcon={revealed ? EyeOff : Eye} onClick={() => setRevealed((v) => !v)}>{revealed ? 'Hide details' : 'Show number'}</Button>
        <Button variant={settings.frozen ? 'accent' : 'soft'} full leadingIcon={Snowflake} onClick={() => update({ frozen: !settings.frozen })}>{settings.frozen ? 'Unfreeze' : 'Freeze'}</Button>
      </div>

      <Card flat className="mt-4 flex items-center gap-3 p-4">
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
    </Sheet>
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
