/**
 * Card (light) — the signed-in account's real BrainPal card.
 * ───────────────────────────────────────────────────────────────────────────
 * Replaces the old mock "Peter Marshall" card carousel. Uses lib/card for a
 * deterministic PAN/expiry/CVV and persisted controls (freeze, online, ATM,
 * contactless, daily limit) — every control does something real and survives
 * reloads. Parents manage each child's card from the Family tab (KidCardSheet).
 */
import { useState } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useCardSettings, cardNumber, cardExpiry, cardCvv, cardLast4, maskedNumber } from '../../lib/card'
import { aud } from '../../lib/format'
import { Button, Card } from '../components/primitives'
import { TopBar } from '../components/shell'
import { useWallet } from '../useMoneyPal'

export function CardScreen() {
  const account = useAuthStore((s) => s.account)
  const accountId = account?.id ?? 'preview'
  const name = (account?.persona?.name as string) || 'You'
  const wallet = useWallet()

  const [settings, update] = useCardSettings(accountId)
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="flex flex-1 flex-col">
      <TopBar leading={<h1 className="pv-h1">Card</h1>} />

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
        {/* Card face */}
        <div
          className="pv-sheen mt-2 overflow-hidden rounded-[var(--pv-r-xl)] p-6"
          style={{ backgroundImage: 'var(--pv-grad-ink)', color: '#fff', boxShadow: 'var(--pv-shadow-lg)', aspectRatio: '1.586', position: 'relative' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
              <div className="pv-amount mt-2 text-2xl">{aud(wallet.balance)}</div>
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {settings.frozen ? 'Frozen' : 'Debit'}
            </span>
          </div>
          <div className="mt-5 h-8 w-11 rounded-md" style={{ background: 'rgba(255,255,255,0.22)' }} />
          <div className="pv-amount mt-4 text-lg tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.95)' }}>
            {revealed ? cardNumber(accountId) : maskedNumber(cardLast4(accountId))}
          </div>
          <div className="mt-3 flex items-end justify-between text-xs font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            <span className="truncate">{name.toUpperCase()}</span>
            <span>{revealed ? cardExpiry(accountId) : '••/••'}</span>
            <span>CVV {revealed ? cardCvv(accountId) : '•••'}</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-5 flex gap-3">
          <Button variant="soft" full leadingIcon={revealed ? EyeOff : Eye} onClick={() => setRevealed((v) => !v)}>
            {revealed ? 'Hide details' : 'Show number'}
          </Button>
          <Button
            variant={settings.frozen ? 'accent' : 'soft'}
            full
            leadingIcon={Snowflake}
            onClick={() => update({ frozen: !settings.frozen })}
          >
            {settings.frozen ? 'Unfreeze' : 'Freeze'}
          </Button>
        </div>

        {/* Status */}
        <Card flat className="mt-4 flex items-center gap-3 p-4">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: settings.frozen ? 'var(--pv-neg)' : 'var(--pv-pos)' }} />
          <span className="text-sm font-semibold">{settings.frozen ? 'Card is frozen' : 'Card is active'}</span>
        </Card>

        {/* Controls */}
        <p className="pv-label mt-6">Controls</p>
        <Card flat className="mt-2 overflow-hidden">
          <ToggleRow Icon={Globe} label="Online payments" on={settings.online} disabled={settings.frozen} onToggle={() => update({ online: !settings.online })} />
          <div className="h-px" style={{ background: 'var(--pv-line)' }} />
          <ToggleRow Icon={Banknote} label="ATM withdrawals" on={settings.atm} disabled={settings.frozen} onToggle={() => update({ atm: !settings.atm })} />
          <div className="h-px" style={{ background: 'var(--pv-line)' }} />
          <ToggleRow Icon={Nfc} label="Contactless (tap to pay)" on={settings.contactless} disabled={settings.frozen} onToggle={() => update({ contactless: !settings.contactless })} />
          <div className="h-px" style={{ background: 'var(--pv-line)' }} />
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Gauge size={20} style={{ color: 'var(--pv-ink-3)' }} />
              <span className="text-sm font-medium">Daily spend limit</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => update({ dailyLimit: Math.max(0, settings.dailyLimit - 10) })} className="pv-press h-7 w-7 rounded-full font-bold" style={{ background: 'var(--pv-surface-2)' }}>−</button>
              <span className="w-16 text-right text-sm font-bold pv-text-accent">{aud(settings.dailyLimit)}</span>
              <button onClick={() => update({ dailyLimit: settings.dailyLimit + 10 })} className="pv-press h-7 w-7 rounded-full font-bold" style={{ background: 'var(--pv-surface-2)' }}>+</button>
            </div>
          </div>
        </Card>

        <button
          onClick={() => update({ frozen: true })}
          className="pv-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold"
          style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}
        >
          <ShieldAlert size={16} /> Report lost or stolen
        </button>
      </div>
    </div>
  )
}

function ToggleRow({ Icon, label, on, disabled, onToggle }: { Icon: LucideIcon; label: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  const effectiveOn = on && !disabled
  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div className="flex items-center gap-3">
        <Icon size={20} style={{ color: 'var(--pv-ink-3)' }} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <button
        onClick={() => !disabled && onToggle()}
        disabled={disabled}
        aria-pressed={effectiveOn}
        className="relative h-6 w-11 rounded-full transition-all duration-300"
        style={{ background: effectiveOn ? 'var(--pv-accent)' : 'var(--pv-surface-3)' }}
      >
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300" style={{ left: effectiveOn ? '22px' : '2px' }} />
      </button>
    </div>
  )
}
