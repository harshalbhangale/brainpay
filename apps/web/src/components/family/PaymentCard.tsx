import { Snowflake } from 'lucide-react'
import { cardCvv, cardExpiry, cardLast4, cardNumber, maskedNumber } from '../../lib/card'

/** Realistic debit-card visual with masked number + reveal + frozen state. */
export function PaymentCard({
  name,
  accountId,
  frozen,
  revealed,
}: {
  name: string
  accountId: string
  frozen: boolean
  revealed: boolean
}) {
  const number = revealed ? cardNumber(accountId) : maskedNumber(cardLast4(accountId))
  const expiry = cardExpiry(accountId)
  const cvv = revealed ? cardCvv(accountId) : '•••'

  return (
    <div
      className="relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl p-5 text-white shadow-pop"
      style={{ background: 'linear-gradient(120deg, #0d1830 0%, #1f5fa8 42%, #8b3fb0 78%, #d35bb8 100%)' }}
    >
      <div className="grad-border pointer-events-none absolute inset-0 rounded-2xl" />
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-30 animate-aurora"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      {/* top row: issuer + network */}
      <div className="relative flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-wide">BrainPal</span>
        <span className="text-base font-black italic tracking-tight">VISA</span>
      </div>

      {/* chip + contactless */}
      <div className="relative mt-4 flex items-center gap-3">
        <span className="h-7 w-9 rounded-md ring-1 ring-white/40" style={{ backgroundImage: 'var(--grad-gold)' }} />
        <span className="text-lg leading-none opacity-80">))) </span>
      </div>

      {/* number */}
      <div className="relative mt-4 font-mono text-lg tracking-[0.12em]">{number}</div>

      {/* bottom row */}
      <div className="relative mt-3 flex items-end justify-between text-xs">
        <div>
          <div className="uppercase tracking-wide text-white/60">Card holder</div>
          <div className="font-semibold uppercase">{name}</div>
        </div>
        <div className="text-center">
          <div className="uppercase tracking-wide text-white/60">Expires</div>
          <div className="font-semibold">{expiry}</div>
        </div>
        <div className="text-center">
          <div className="uppercase tracking-wide text-white/60">CVV</div>
          <div className="font-semibold">{cvv}</div>
        </div>
      </div>

      {frozen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold tracking-wide ring-1 ring-white/20">
            <Snowflake size={15} /> Frozen
          </span>
        </div>
      )}
    </div>
  )
}
