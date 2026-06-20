import { useState } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, type LucideIcon } from 'lucide-react'
import { useCardSettings } from '../../lib/card'
import { aud } from '../../lib/format'
import { PaymentCard } from './PaymentCard'
import { kidName, type Member, type Subject } from './types'

export function CardTab({
  subject,
  members,
  meAccountId,
  parentName,
}: {
  subject: Subject
  members: Member[]
  meAccountId?: string
  parentName: string
}) {
  const target: Member | undefined =
    subject.kind === 'kid' ? members.find((m) => m.accountId === subject.accountId) : undefined
  const accountId = subject.kind === 'kid' ? subject.accountId : meAccountId
  const name = subject.kind === 'kid' ? (target ? kidName(target) : 'Kid') : parentName

  const [settings, update] = useCardSettings(accountId ?? 'none')
  const [revealed, setRevealed] = useState(false)

  if (!accountId) {
    return <p className="p-5 text-center text-sm text-muted">No card available.</p>
  }

  return (
    <div className="space-y-5 p-5">
      <PaymentCard name={name} accountId={accountId} frozen={settings.frozen} revealed={revealed} />

      <div className="flex gap-3">
        <button
          onClick={() => setRevealed((v) => !v)}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-surface2 py-3 text-sm font-bold text-ink active:scale-[0.98]"
        >
          {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          {revealed ? 'Hide details' : 'Show number'}
        </button>
        <button
          onClick={() => update({ frozen: !settings.frozen })}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold active:scale-[0.98] ${
            settings.frozen ? 'bg-accent text-on-accent' : 'bg-surface2 text-ink'
          }`}
        >
          <Snowflake size={16} />
          {settings.frozen ? 'Unfreeze' : 'Freeze card'}
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: settings.frozen ? 'var(--color-danger)' : 'var(--color-accent)' }}
        />
        <span className="text-sm font-semibold text-ink">
          {settings.frozen ? 'Card is frozen' : 'Card is active'}
        </span>
      </div>

      {/* Controls */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Controls</h3>
        <div className="overflow-hidden rounded-2xl bg-surface">
          <ToggleRow
            Icon={Globe}
            label="Online payments"
            on={settings.online}
            disabled={settings.frozen}
            onToggle={() => update({ online: !settings.online })}
          />
          <ToggleRow
            Icon={Banknote}
            label="ATM withdrawals"
            on={settings.atm}
            disabled={settings.frozen}
            onToggle={() => update({ atm: !settings.atm })}
          />
          <ToggleRow
            Icon={Nfc}
            label="Contactless (tap to pay)"
            on={settings.contactless}
            disabled={settings.frozen}
            onToggle={() => update({ contactless: !settings.contactless })}
          />

          {/* Daily limit */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Gauge size={20} className="text-muted" />
              <span className="text-sm font-medium text-ink">Daily spend limit</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => update({ dailyLimit: Math.max(0, settings.dailyLimit - 10) })}
                className="h-7 w-7 rounded-full bg-surface2 font-bold text-ink"
              >
                −
              </button>
              <span className="w-16 text-right text-sm font-bold text-ink">{aud(settings.dailyLimit)}</span>
              <button
                onClick={() => update({ dailyLimit: settings.dailyLimit + 10 })}
                className="h-7 w-7 rounded-full bg-surface2 font-bold text-ink"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>

      <button
        onClick={() => update({ frozen: true })}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-danger/10 py-3.5 text-sm font-bold text-danger active:scale-[0.99]"
      >
        <ShieldAlert size={16} />
        Report lost or stolen
      </button>
    </div>
  )
}

function ToggleRow({
  Icon,
  label,
  on,
  disabled,
  onToggle,
}: {
  Icon: LucideIcon
  label: string
  on: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  const effectiveOn = on && !disabled
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <Icon size={20} className="text-muted" />
        <span className="text-sm font-medium text-ink">{label}</span>
      </div>
      <button
        onClick={() => !disabled && onToggle()}
        disabled={disabled}
        className="relative h-6 w-11 rounded-full transition"
        style={{ backgroundColor: effectiveOn ? '#3ddc84' : '#3a3a45' }}
        aria-pressed={effectiveOn}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: effectiveOn ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}
