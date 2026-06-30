/**
 * Card (light) — labelled, multi-holder card view.
 * ───────────────────────────────────────────────────────────────────────────
 * A parent can flip between their own card and each kid's card from one place
 * (Greenlight-style "you + your kids"), with every card clearly labelled —
 * whose it is and whether it's a kid's card. A kid only ever sees their own.
 * Card details (PAN/expiry/CVV) are deterministic per holder, and every control
 * (freeze, online, ATM, contactless, daily limit) is real and persisted.
 */
import { useState } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, Sparkles, Ban, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useCardSettings, cardNumber, cardExpiry, cardCvv, cardLast4, maskedNumber, blockLabel } from '../../lib/card'
import { aud } from '../../lib/format'
import { Avatar, Button, Card, PressButton } from '../components/primitives'
import { BottomSheet } from '../components/BottomSheet'
import { useWallet, useFamilyKids } from '../useMoneyPal'

type Holder = { id: string; name: string; balance: number; you: boolean; avatar?: string; initials?: string }

export function CardSheet({ onClose }: { onClose: () => void }) {
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const myId = account?.id ?? 'preview'
  const myName = (account?.persona?.name as string) || 'You'
  const myPhoto = typeof account?.persona?.avatar === 'string' ? (account.persona.avatar as string) : undefined
  const wallet = useWallet()
  const { kids } = useFamilyKids()

  const holders: Holder[] = [
    { id: myId, name: myName, balance: wallet.balance, you: true, avatar: myPhoto },
    ...(isKid ? [] : kids.map((k) => ({ id: k.id, name: k.name, balance: k.balance, you: false, avatar: k.avatar, initials: k.initials }))),
  ]

  const [selId, setSelId] = useState(myId)
  const holder = holders.find((h) => h.id === selId) ?? holders[0]
  const [settings, update] = useCardSettings(holder.id)
  const [revealed, setRevealed] = useState(false)

  return (
    <BottomSheet onClose={onClose} title={isKid ? 'My card' : 'Cards'}>
      {/* Cardholder switcher (parent with kids) */}
      {holders.length > 1 && (
        <div className="pv-no-scrollbar -mx-6 mt-1 flex gap-2.5 overflow-x-auto px-6 pb-1">
          {holders.map((h) => {
            const on = h.id === selId
            return (
              <PressButton
                key={h.id}
                onClick={() => { setSelId(h.id); setRevealed(false) }}
                className="flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4"
                style={on ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}
              >
                <Avatar name={h.name} initials={h.initials} src={h.avatar} size={28} />
                <span className="text-sm font-bold">{h.you ? 'You' : h.name.split(' ')[0]}</span>
              </PressButton>
            )
          })}
        </div>
      )}

      {/* Whose card */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="pv-title">{holder.you ? 'Your card' : `${holder.name}'s card`}</div>
          <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            {holder.you ? 'Use anywhere · tap to pay' : "Your child's card — you control it"}
          </div>
        </div>
        {!holder.you && (
          <span className="rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide" style={{ background: 'var(--pv-lilac)', color: 'var(--pv-lilac-ink)' }}>
            Kid card
          </span>
        )}
      </div>

      {/* Card face */}
      <div
        className="pv-sheen mt-3 overflow-hidden rounded-[var(--pv-r-xl)] p-6"
        style={{ backgroundImage: holder.you ? 'var(--pv-grad-ink)' : 'var(--pv-grad-accent)', color: holder.you ? '#fff' : 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-lg)', aspectRatio: '1.586', position: 'relative' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: holder.you ? 'rgba(255,255,255,0.2)' : 'rgba(11,12,15,0.14)' }}>
              <Sparkles size={15} strokeWidth={2.4} />
            </span>
            <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
          </div>
          <span className="text-[0.625rem] font-bold uppercase tracking-widest" style={{ opacity: 0.7 }}>
            {settings.frozen ? 'Frozen' : settings.issued ? 'Virtual' : 'Not issued'}
          </span>
        </div>
        <div className="pv-amount mt-3 text-2xl">{aud(holder.balance)}</div>
        <div className="mt-4 h-8 w-11 rounded-md" style={{ background: holder.you ? 'rgba(255,255,255,0.22)' : 'rgba(11,12,15,0.18)' }} />
        <div className="pv-amount mt-4 text-lg tracking-[0.14em]">
          {revealed ? cardNumber(holder.id) : maskedNumber(cardLast4(holder.id))}
        </div>
        <div className="mt-3 flex items-end justify-between text-xs font-bold" style={{ opacity: 0.92 }}>
          <span className="truncate">{holder.name.toUpperCase()}</span>
          <span>{revealed ? cardExpiry(holder.id) : '••/••'}</span>
          <span>CVV {revealed ? cardCvv(holder.id) : '•••'}</span>
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
        <span className="text-sm font-semibold">{settings.frozen ? `${holder.you ? 'Your' : holder.name + '’s'} card is frozen` : `${holder.you ? 'Your' : holder.name + '’s'} card is active`}</span>
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

      {/* Blocked categories — real, persisted spend blocks */}
      <p className="pv-label mt-6">Blocked categories</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {['gambling', 'in_app', 'crypto', 'alcohol'].map((b) => {
          const on = settings.blocks.includes(b)
          return (
            <button
              key={b}
              onClick={() => update({ blocks: on ? settings.blocks.filter((x) => x !== b) : [...settings.blocks, b] })}
              className="pv-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold"
              style={on ? { background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}
            >
              {on && <Ban size={13} strokeWidth={2.6} />} {blockLabel(b)}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => update({ frozen: true })}
        className="pv-press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold"
        style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}
      >
        <ShieldAlert size={16} /> Report lost or stolen
      </button>
    </BottomSheet>
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
