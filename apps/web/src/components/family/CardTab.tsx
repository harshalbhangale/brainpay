import { useState } from 'react'
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
          className="flex-1 rounded-full bg-surface2 py-3 text-sm font-bold text-ink active:scale-[0.98]"
        >
          {revealed ? 'Hide details' : 'Show card number'}
        </button>
        <button
          onClick={() => update({ frozen: !settings.frozen })}
          className={`flex-1 rounded-full py-3 text-sm font-bold active:scale-[0.98] ${
            settings.frozen ? 'bg-accent text-black' : 'bg-surface2 text-ink'
          }`}
        >
          {settings.frozen ? 'Unfreeze card' : 'Freeze card'}
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: settings.frozen ? '#ff5c5c' : '#3ddc84' }}
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
            icon="🌐"
            label="Online payments"
            on={settings.online}
            disabled={settings.frozen}
            onToggle={() => update({ online: !settings.online })}
          />
          <ToggleRow
            icon="🏧"
            label="ATM withdrawals"
            on={settings.atm}
            disabled={settings.frozen}
            onToggle={() => update({ atm: !settings.atm })}
          />
          <ToggleRow
            icon="📶"
            label="Contactless (tap to pay)"
            on={settings.contactless}
            disabled={settings.frozen}
            onToggle={() => update({ contactless: !settings.contactless })}
          />

          {/* Daily limit */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-lg">📊</span>
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
        className="w-full rounded-2xl bg-danger/10 py-3.5 text-sm font-bold text-danger active:scale-[0.99]"
      >
        Report lost or stolen
      </button>
    </div>
  )
}

function ToggleRow({
  icon,
  label,
  on,
  disabled,
  onToggle,
}: {
  icon: string
  label: string
  on: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  const effectiveOn = on && !disabled
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
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
