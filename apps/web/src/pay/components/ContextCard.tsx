/**
 * ContextCard — the sidebar anchor that scopes the whole chat.
 * ───────────────────────────────────────────────────────────────────────────
 * Parent: an active-child selector (Whole family + each kid) with the focused
 *         subject's avatar / name / balance. Switching re-scopes the chat.
 * Kid:    their own identity card (no selector).
 * Both:   tap the avatar/gear to open Profile & settings (folded in here, so
 *         the old bottom profile row is gone). Parent also gets a "Manage"
 *         button that summons the Family canvas.
 */
import { Settings, Users, ChevronRight } from 'lucide-react'
import { Avatar } from './primitives'
import { fmt } from '../data'
import { useAuthStore } from '../../stores/auth'
import { useActiveChild } from '../lib/activeChild'
import { useCanvas } from '../lib/canvasStore'
import { useWallet, useFamilyKids } from '../useMoneyPal'
import { useCardSettings, cardLast4, maskedNumber } from '../../lib/card'
import { cardSkin } from '../lib/cardSkins'

export function ContextCard({ onProfile, onAfterSwitch }: { onProfile: () => void; onAfterSwitch?: () => void }) {
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const { childId, setChild } = useActiveChild()
  const openCanvas = useCanvas((s) => s.open)
  const wallet = useWallet()
  const { kids } = useFamilyKids()

  const myName = ((account?.persona?.name as string) || 'You').split(' ')[0]
  const myPhoto = typeof account?.persona?.avatar === 'string' ? (account.persona.avatar as string) : undefined

  // Resolve the focused subject.
  const activeKid = !isKid && childId ? kids.find((k) => k.id === childId) ?? null : null
  const subjectName = isKid ? myName : activeKid ? activeKid.name : 'You'
  const subjectBalance = isKid ? wallet.balance : activeKid ? activeKid.balance : wallet.balance
  const balanceLabel = isKid ? 'Your money' : activeKid ? `${activeKid.name}'s balance` : 'Family wallet'

  // Your own card — always shown in the sidebar, masked.
  const myId = account?.id ?? 'preview'
  const cardId = myId
  const [cardSettings] = useCardSettings(cardId)
  const cardDesign = cardSkin(cardSettings.design)
  const maskedPan = maskedNumber(cardLast4(cardId))

  function pick(id: string | null) {
    setChild(id)
    onAfterSwitch?.()
  }

  return (
    <div className="pv-hairline relative overflow-hidden rounded-[var(--pv-r-lg)] p-4" style={{ backgroundImage: 'var(--pv-grad-ink)', color: 'var(--pv-on-dark)', boxShadow: 'var(--pv-shadow-lg)' }}>
      {/* soft aurora depth in the corner */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-[46px]" style={{ backgroundImage: 'var(--pv-grad-aurora)', opacity: 0.42 }} />

      {/* Identity / subject row */}
      <div className="relative flex items-center gap-3">
        <button onClick={onProfile} aria-label="Profile and settings" className="pv-press shrink-0 rounded-full">
          {activeKid ? (
            <Avatar name={activeKid.name} src={activeKid.avatar} tile={activeKid.tile} size={46} />
          ) : (
            <Avatar name={myName} src={myPhoto} size={46} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold tracking-tight" style={{ color: 'var(--pv-on-dark)' }}>{subjectName}</div>
          <div className="pv-amount text-lg leading-tight" style={{ color: '#7ef0b0' }}>{fmt(subjectBalance, { cents: false })}</div>
          <div className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>{balanceLabel}</div>
        </div>
        <button onClick={onProfile} aria-label="Settings" className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.14)', color: 'var(--pv-on-dark)' }}>
          <Settings size={17} strokeWidth={2.2} />
        </button>
      </div>

      {/* Parent: active-child selector + manage */}
      {!isKid && (
        <>
          <div className="pv-no-scrollbar relative -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
            <SelectorChip label="You" active={!childId} onClick={() => pick(null)} />
            {kids.map((k) => (
              <SelectorChip key={k.id} label={k.name} active={childId === k.id} onClick={() => pick(k.id)} />
            ))}
          </div>
          <button
            onClick={() => { openCanvas('family'); onAfterSwitch?.() }}
            className="pv-press relative mt-2.5 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left"
            style={{ background: 'rgba(255,255,255,0.10)' }}
          >
            <Users size={15} style={{ color: 'rgba(255,255,255,0.8)' }} />
            <span className="flex-1 text-sm font-bold" style={{ color: 'var(--pv-on-dark)' }}>Manage family</span>
            <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.7)' }} />
          </button>
        </>
      )}

      {/* Your card — masked; tap to open, freeze & customize */}
      <button
        onClick={() => { openCanvas('card'); onAfterSwitch?.() }}
        aria-label="Open your card"
        className="pv-press pv-hairline relative mt-3 block w-full overflow-hidden rounded-2xl p-3.5 text-left"
        style={{ backgroundImage: cardDesign.gradient, color: cardDesign.fg, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)', textShadow: cardDesign.image ? '0 1px 6px rgba(0,0,0,0.55)' : undefined }}
      >
        {cardDesign.image && (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${cardDesign.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,9,12,0.42), rgba(8,9,12,0.66))' }} />
          </>
        )}
        <span className="relative flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ opacity: 0.85 }}>Your card</span>
          <span className="text-[11px] font-black italic leading-none tracking-tight" style={{ color: cardDesign.visa }}>VISA</span>
        </span>
        <span className="pv-amount relative mt-1.5 block text-[15px] tracking-[0.16em]">{maskedPan}</span>
      </button>
    </div>
  )
}

function SelectorChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="pv-press flex-none rounded-full px-3 py-1.5 text-[13px] font-bold"
      style={active
        ? { background: 'var(--pv-on-dark)', color: 'var(--pv-ink)' }
        : { background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' }}
    >
      {label}
    </button>
  )
}
