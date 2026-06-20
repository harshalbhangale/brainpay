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
      className="relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl p-5 text-white shadow-xl"
      style={{ background: 'linear-gradient(120deg, #14233b 0%, #1f5fa8 45%, #d35bb8 100%)' }}
    >
      {/* top row: issuer + network */}
      <div className="flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-wide">BrainPal</span>
        <span className="text-base font-black italic tracking-tight">VISA</span>
      </div>

      {/* chip + contactless */}
      <div className="mt-4 flex items-center gap-3">
        <span className="h-7 w-9 rounded-md bg-yellow-300/90 ring-1 ring-white/40" />
        <span className="text-lg leading-none opacity-80">))) </span>
      </div>

      {/* number */}
      <div className="mt-4 font-mono text-lg tracking-[0.12em]">{number}</div>

      {/* bottom row */}
      <div className="mt-3 flex items-end justify-between text-xs">
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
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold tracking-wide">
            <Snowflake size={15} /> Frozen
          </span>
        </div>
      )}
    </div>
  )
}
