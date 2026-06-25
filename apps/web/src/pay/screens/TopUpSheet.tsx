/**
 * TopUpSheet — real money movement.
 * ───────────────────────────────────────────────────────────────────────────
 * A parent picks a child and an amount; "Add money" moves REAL value through
 * the server-side ledger (POST /wallet/topup via useFamilyKids().give). Honors
 * the "no dead-ends" principle: every control does something real, with loading
 * and success states. When signed-out (public preview) it credits the local
 * mock so the flow still demonstrates end-to-end.
 */
import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Avatar, Button, PressButton } from '../components/primitives'
import { fmt } from '../data'
import { useFamilyKids, type FamilyKidVM } from '../useMoneyPal'

const QUICK = [5, 10, 20, 50]

export function TopUpSheet({ onClose, presetKidId }: { onClose: () => void; presetKidId?: string }) {
  const { kids, give } = useFamilyKids()
  const [kidId, setKidId] = useState<string | null>(presetKidId ?? kids[0]?.id ?? null)
  const [amount, setAmount] = useState(10)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kid: FamilyKidVM | undefined = kids.find((k) => k.id === kidId)

  function submit() {
    if (!kid || amount <= 0 || give.isPending) return
    setError(null)
    give.mutate(
      { kidAccountId: kid.id, amount, note: 'Top-up' },
      {
        onSuccess: () => {
          setDone(true)
          window.setTimeout(onClose, 1400)
        },
        onError: () => setError(`Couldn't reach ${kid.name}'s wallet — try again`),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)' }} onClick={onClose} />
      <div
        className="pv-rise relative w-full max-w-[460px] rounded-t-[var(--pv-r-2xl)] p-6 pb-[max(24px,env(safe-area-inset-bottom))]"
        style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}
      >
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />

        {done ? (
          <div className="py-8 text-center">
            <div
              className="pv-scale-in mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'var(--pv-pos)', color: '#fff', boxShadow: '0 16px 40px -14px rgba(18,161,80,0.6)' }}
            >
              <Check size={32} strokeWidth={3} />
            </div>
            <div className="pv-h2">Added {fmt(amount)}</div>
            <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>
              to {kid?.name}'s wallet
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="pv-h2">Add money</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="pv-press flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}
              >
                <X size={18} />
              </button>
            </div>

            {kids.length === 0 ? (
              <p className="pv-body mt-6 text-center" style={{ color: 'var(--pv-ink-2)' }}>
                Add a child in the Family tab first, then you can top up their wallet.
              </p>
            ) : (
              <>
                {/* Who */}
                {!presetKidId && (
                  <>
                    <p className="pv-label mb-2 mt-5">To</p>
                    <div className="pv-no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-1">
                      {kids.map((k) => (
                        <PressButton
                          key={k.id}
                          onClick={() => setKidId(k.id)}
                          className="flex w-16 shrink-0 flex-col items-center gap-2"
                        >
                          <span
                            className="rounded-full"
                            style={{ boxShadow: kidId === k.id ? '0 0 0 3px var(--pv-accent)' : 'none' }}
                          >
                            <Avatar initials={k.initials} tile={k.tile} size={56} src={k.avatar} />
                          </span>
                          <span className="truncate text-xs font-bold" style={{ color: 'var(--pv-ink)' }}>
                            {k.name}
                          </span>
                        </PressButton>
                      ))}
                    </div>
                  </>
                )}

                {/* Amount */}
                <div className="mt-6 flex flex-col items-center">
                  <div className="pv-amount text-5xl">{fmt(amount, { cents: false })}</div>
                  {kid && (
                    <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                      {kid.name}'s balance: {fmt(kid.balance)}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-4 gap-2.5">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      onClick={() => setAmount(q)}
                      className="pv-press rounded-2xl py-3 text-sm font-bold"
                      style={
                        amount === q
                          ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
                          : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }
                      }
                    >
                      {fmt(q, { cents: false })}
                    </button>
                  ))}
                </div>

                {error && (
                  <p className="mt-4 text-center text-sm font-semibold" style={{ color: 'var(--pv-neg)' }}>
                    {error}
                  </p>
                )}

                <div className="mt-6">
                  <Button
                    variant="primary"
                    size="lg"
                    full
                    disabled={!kid || amount <= 0 || give.isPending}
                    onClick={submit}
                  >
                    {give.isPending ? <Loader2 size={18} className="animate-spin" /> : `Add ${fmt(amount, { cents: false })}`}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
