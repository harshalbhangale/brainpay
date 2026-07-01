/**
 * Card (light) — labelled, multi-holder card view.
 * ───────────────────────────────────────────────────────────────────────────
 * A parent can flip between their own card and each kid's card from one place
 * (Greenlight-style "you + your kids"), with every card clearly labelled —
 * whose it is and whether it's a kid's card. A kid only ever sees their own.
 * Card details (PAN/expiry/CVV) are deterministic per holder, and every control
 * (freeze, online, ATM, contactless, daily limit) is real and persisted.
 */
import { useState, useEffect } from 'react'
import { Globe, Banknote, Nfc, Gauge, Snowflake, Eye, EyeOff, ShieldAlert, Ban, Palette, Check, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useCardSettings, cardNumber, cardExpiry, cardCvv, cardLast4, maskedNumber, blockLabel } from '../../lib/card'
import { aud } from '../../lib/format'
import { Avatar, Button, Card, PressButton } from '../components/primitives'
import { BottomSheet } from '../components/BottomSheet'
import { cardSkin, CARD_SKINS } from '../lib/cardSkins'
import { familyFace } from '../lib/cartoonAvatar'
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
    { id: myId, name: myName, balance: wallet.balance, you: true, avatar: familyFace(myId, myPhoto) },
    ...(isKid ? [] : kids.map((k) => ({ id: k.id, name: k.name, balance: k.balance, you: false, avatar: k.avatar, initials: k.initials }))),
  ]

  const [selId, setSelId] = useState(myId)
  const holder = holders.find((h) => h.id === selId) ?? holders[0]
  const [settings, update] = useCardSettings(holder.id)
  const [revealed, setRevealed] = useState(false)
  const skin = cardSkin(settings.design)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [customizing, setCustomizing] = useState(false)
  const [nameInput, setNameInput] = useState<string | null>(null)
  useEffect(() => { setNameInput(null); setTilt({ x: 0, y: 0 }) }, [holder.id])
  const nameValue = nameInput ?? settings.label
  const displayName = (nameValue || holder.name).toUpperCase()

  function onTilt(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: -py * 10, y: px * 12 })
  }

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

      {/* Card face — customizable Visa hero card with a 3D tilt. */}
      <div className="mt-3" style={{ perspective: '900px' }}>
        <div
          onPointerMove={onTilt}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
          className="pv-sheen relative overflow-hidden rounded-[var(--pv-r-xl)] p-5"
          style={{ backgroundImage: skin.gradient, color: skin.fg, boxShadow: 'var(--pv-shadow-lg)', aspectRatio: '1.586', transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: tilt.x || tilt.y ? 'none' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)', transformStyle: 'preserve-3d', touchAction: 'none', textShadow: skin.image ? '0 1px 8px rgba(0,0,0,0.55)' : undefined }}
        >
          {/* Real card artwork (cover) + legibility scrim, else the mascot watermark. */}
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
            <span className="pv-amount text-base" style={{ opacity: 0.95 }}>{aud(holder.balance)}</span>
          </div>

          <div className="relative mt-4 flex items-center gap-3">
            <span className="h-8 w-11 rounded-md" style={{ background: skin.chip === 'gold' ? 'linear-gradient(135deg,#f7e08a,#b8860b)' : 'linear-gradient(135deg,#eef2f7,#9aa3af)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }} />
            <Nfc size={20} style={{ opacity: 0.85, transform: 'rotate(90deg)' }} />
            {skin.hero && !skin.image && <span className="ml-auto text-2xl leading-none">{skin.mascot}</span>}
          </div>

          <div className="pv-amount relative mt-3 text-lg tracking-[0.16em]">
            {revealed ? cardNumber(holder.id) : maskedNumber(cardLast4(holder.id))}
          </div>

          <div className="relative mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-wide">{displayName}</div>
              <div className="mt-0.5 flex gap-3 text-[11px] font-bold" style={{ opacity: 0.9 }}>
                <span>{revealed ? cardExpiry(holder.id) : '••/••'}</span>
                <span>CVV {revealed ? cardCvv(holder.id) : '•••'}</span>
              </div>
            </div>
            <span className="text-2xl font-black italic leading-none tracking-tight" style={{ color: skin.visa }}>VISA</span>
          </div>
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

      {/* Customize — pick a hero skin + the name printed on the card. */}
      <button onClick={() => setCustomizing((v) => !v)} className="pv-press mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}>
        <Palette size={16} /> {customizing ? 'Done customizing' : 'Customize card'}
      </button>
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
            value={nameValue}
            onChange={(e) => setNameInput(e.target.value.slice(0, 22))}
            onBlur={() => { const v = (nameInput ?? '').trim(); if (nameInput !== null && v !== settings.label) update({ label: v }) }}
            placeholder={holder.name}
            maxLength={22}
            className="w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none"
            style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}
          />
        </Card>
      )}

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
