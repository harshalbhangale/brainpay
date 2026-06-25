import { aud } from '../../lib/format'
import { cardLast4 } from '../../lib/card'

/**
 * Available-balance hero (AUD).
 *
 * Shares the PaymentCard's gradient + BrainPal/VISA branding so the card
 * identity is visually consistent everywhere it appears (overview balance,
 * card tab, kid detail). Same person → same card look.
 */
export function BalanceCard({
  name,
  balance,
  familyName,
  accountId,
}: {
  name: string
  balance: number
  familyName?: string
  accountId?: string
}) {
  return (
    <div
      className="animate-pop-in relative flex aspect-[1.586/1] w-full flex-col overflow-hidden rounded-2xl p-5 text-white shadow-pop"
      style={{ background: 'linear-gradient(120deg, #0d1830 0%, #1f5fa8 42%, #8b3fb0 78%, #d35bb8 100%)' }}
    >
      {/* gradient hairline edge */}
      <div className="grad-border pointer-events-none absolute inset-0 rounded-2xl" />
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-30 animate-aurora"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #5ad7ff 0%, transparent 70%)' }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-wide">BrainPal</span>
        <span className="text-base font-black italic tracking-tight">VISA</span>
      </div>

      <div className="relative mt-5 text-4xl font-extrabold leading-none drop-shadow">{aud(balance)}</div>
      <div className="relative mt-1 text-xs uppercase tracking-wide text-white/70">Available balance</div>

      <div className="relative mt-auto flex items-end justify-between pt-6 text-xs">
        <div>
          <div className="uppercase tracking-wide text-white/60">Card holder</div>
          <div className="font-semibold uppercase">{name}</div>
        </div>
        <div className="text-right">
          {accountId ? (
            <div className="font-mono tracking-[0.12em]">•••• {cardLast4(accountId)}</div>
          ) : (
            familyName && <div className="text-white/70">{familyName}</div>
          )}
        </div>
      </div>
    </div>
  )
}
