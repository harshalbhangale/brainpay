import { useState } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, type LucideIcon } from 'lucide-react'
import { useCardSettings } from '../../lib/card'
import { Card, SectionTitle, PressButton } from '../ui'
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
        <PressButton
          onClick={() => setRevealed((v) => !v)}
          className="glass flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-ink"
        >
          {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          {revealed ? 'Hide details' : 'Show number'}
        </PressButton>
        <PressButton
          onClick={() => update({ frozen: !settings.frozen })}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold ${
            settings.frozen ? 'text-on-accent glow-accent' : 'glass text-ink'
          }`}
          style={settings.frozen ? { backgroundImage: 'var(--grad-accent-bright)' } : undefined}
        >
          <Snowflake size={16} />
          {settings.frozen ? 'Unfreeze' : 'Freeze card'}
        </PressButton>
      </div>

      {/* Status */}
      <Card className="flex items-center gap-3 p-4">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: settings.frozen ? 'var(--color-danger)' : 'var(--color-accent)', boxShadow: settings.frozen ? '0 0 8px var(--danger)' : '0 0 8px var(--accent)' }}
        />
        <span className="text-sm font-semibold text-ink">
          {settings.frozen ? 'Card is frozen' : 'Card is active'}
        </span>
      </Card>

      {/* Controls */}
      <section>
        <SectionTitle>Controls</SectionTitle>
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
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
              <PressButton
                onClick={() => update({ dailyLimit: Math.max(0, settings.dailyLimit - 10) })}
                className="glass h-7 w-7 rounded-full font-bold text-ink"
              >
                −
              </PressButton>
              <span className="w-16 text-right text-sm font-bold text-grad-accent">{aud(settings.dailyLimit)}</span>
              <PressButton
                onClick={() => update({ dailyLimit: settings.dailyLimit + 10 })}
                className="glass h-7 w-7 rounded-full font-bold text-ink"
              >
                +
              </PressButton>
            </div>
          </div>
        </Card>
      </section>

      <PressButton
        onClick={() => update({ frozen: true })}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-danger/10 py-3.5 text-sm font-bold text-danger ring-1 ring-danger/20"
      >
        <ShieldAlert size={16} />
        Report lost or stolen
      </PressButton>
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
        className="relative h-6 w-11 rounded-full transition-all duration-300"
        style={{ backgroundImage: effectiveOn ? 'var(--grad-accent-bright)' : undefined, backgroundColor: effectiveOn ? undefined : 'var(--surface-2)', boxShadow: effectiveOn ? 'var(--glow-accent)' : undefined }}
        aria-pressed={effectiveOn}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300"
          style={{ left: effectiveOn ? '22px' : '2px' }}
        />
      </button>
    </div>
  )
}
