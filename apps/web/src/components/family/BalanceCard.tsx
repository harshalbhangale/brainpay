import { aud } from '../../lib/format'

/** Available-balance hero (AUD). */
export function BalanceCard({
  name,
  balance,
  familyName,
}: {
  name: string
  balance: number
  familyName?: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg"
      style={{ background: 'linear-gradient(135deg, #1f8a5b 0%, #0c5c3a 55%, #0a3f6b 100%)' }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm font-extrabold tracking-wide">BrainPal</span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          AUD
        </span>
      </div>

      <div className="mt-8 text-4xl font-extrabold leading-none">{aud(balance)}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-white/70">Available balance</div>

      <div className="mt-6 flex items-end justify-between">
        <span className="text-lg font-bold">{name}</span>
        {familyName && <span className="text-xs text-white/70">{familyName}</span>}
      </div>
    </div>
  )
}
