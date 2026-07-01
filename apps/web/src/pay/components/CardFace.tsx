/**
 * CardFace — the presentational Visa hero card face, reused wherever the card
 * needs to appear (the full Card sheet and inline in MoneyPal chat).
 * ───────────────────────────────────────────────────────────────────────────
 * Details (PAN / expiry / CVV) are deterministic per holder and presentation-
 * only — BrainPal has no card processor and never stores real credentials.
 * The skin + name follow the holder's saved card settings.
 */
import { Nfc } from 'lucide-react'
import { useCardSettings, cardNumber, cardExpiry, cardCvv, cardLast4, maskedNumber } from '../../lib/card'
import { aud } from '../../lib/format'
import { cardSkin } from '../lib/cardSkins'

export function CardFace({
  accountId,
  name,
  balance,
  revealed = false,
}: {
  accountId: string
  name: string
  balance: number
  revealed?: boolean
}) {
  const [settings] = useCardSettings(accountId)
  const skin = cardSkin(settings.design)
  const displayName = ((settings.label || name) || 'You').toUpperCase()

  return (
    <div
      className="pv-sheen relative overflow-hidden rounded-[var(--pv-r-xl)] p-5"
      style={{ backgroundImage: skin.gradient, color: skin.fg, boxShadow: 'var(--pv-shadow-lg)', aspectRatio: '1.586' }}
    >
      {/* mascot watermark */}
      <span aria-hidden className="pointer-events-none absolute -bottom-6 -right-3 select-none" style={{ fontSize: 128, lineHeight: 1, opacity: 0.16 }}>{skin.mascot}</span>

      <div className="relative flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-tight">BrainPal</span>
        <span className="pv-amount text-base" style={{ opacity: 0.95 }}>{aud(balance)}</span>
      </div>

      <div className="relative mt-4 flex items-center gap-3">
        <span className="h-8 w-11 rounded-md" style={{ background: skin.chip === 'gold' ? 'linear-gradient(135deg,#f7e08a,#b8860b)' : 'linear-gradient(135deg,#eef2f7,#9aa3af)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }} />
        <Nfc size={20} style={{ opacity: 0.85, transform: 'rotate(90deg)' }} />
        {skin.hero && <span className="ml-auto text-2xl leading-none">{skin.mascot}</span>}
      </div>

      <div className="pv-amount relative mt-3 text-lg tracking-[0.16em]">
        {revealed ? cardNumber(accountId) : maskedNumber(cardLast4(accountId))}
      </div>

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
  )
}
