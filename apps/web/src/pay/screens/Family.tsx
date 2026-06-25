import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Target,
  CheckCircle2,
  CalendarClock,
  Wallet,
  ArrowUpRight,
  X,
  PiggyBank,
  Check,
  Loader2,
  CreditCard,
  MapPin,
  ChevronDown,
  Clock,
  Camera,
} from 'lucide-react'
import { api } from '../../lib/api'
import { COUNTRIES, toE164, isValidLocal, type Country } from '../../lib/phone'
import { Avatar, Button, Card, IconBadge, Pill, PressButton, ProgressBar } from '../components/primitives'
import { TopBar } from '../components/shell'
import { fmt } from '../data'
import { useFamilyKids, type FamilyKidVM } from '../useMoneyPal'
import type { Pastel } from '../tokens'
import { ChoresSection } from './family/Chores'
import { KidCardSheet, KidMapSheet } from './family/KidSheets'
import { TopUpSheet } from './TopUpSheet'

type PendingInvite = { id: string; phone: string | null; name: string | null; role: string; status: string }

export function Family() {
  const { live, loading, kids: baseKids, give } = useFamilyKids()
  const qc = useQueryClient()
  const [extra, setExtra] = useState<FamilyKidVM[]>([]) // mock-only added kids
  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [bumps, setBumps] = useState<Record<string, number>>({}) // mock-only local credits
  const [givingId, setGivingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Per-kid sheets (all wired to real features).
  const [topUpKid, setTopUpKid] = useState<FamilyKidVM | null>(null)
  const [cardKid, setCardKid] = useState<FamilyKidVM | null>(null)
  const [mapKid, setMapKid] = useState<FamilyKidVM | null>(null)

  // Pending kid invites (parent has invited, kid hasn't joined yet).
  const outgoingQ = useQuery({
    queryKey: ['join-outgoing'],
    queryFn: () => api<{ requests: PendingInvite[] }>('/join-requests/outgoing'),
    enabled: live,
  })
  const pendingInvites = (outgoingQ.data?.requests ?? []).filter((r) => r.status === 'pending')

  const kids = useMemo(() => {
    const merged = live ? baseKids : [...baseKids, ...extra]
    return merged.map((k) => {
      const ov = avatars[k.id]
      return {
        ...k,
        avatar: ov === undefined ? k.avatar : ov || undefined,
        balance: k.balance + (live ? 0 : bumps[k.id] ?? 0),
      }
    })
  }, [live, baseKids, extra, avatars, bumps])

  const totals = useMemo(() => {
    const pocket = kids.reduce((s, k) => s + k.balance, 0)
    const dueWeekly = kids.filter((k) => k.cadence === 'weekly').reduce((s, k) => s + k.allowance, 0)
    const tasks = kids.reduce((s, k) => s + k.tasksDue, 0)
    return { pocket, dueWeekly, tasks }
  }, [kids])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400)
  }

  function giveAllowance(kid: FamilyKidVM) {
    if (kid.live) {
      setGivingId(kid.id)
      give.mutate(
        { kidAccountId: kid.id, amount: kid.allowance, note: 'Allowance' },
        {
          onSuccess: () => {
            flash(`Sent ${fmt(kid.allowance)} allowance to ${kid.name}`)
            setGivingId(null)
          },
          onError: () => {
            flash(`Couldn't reach ${kid.name}'s wallet — try again`)
            setGivingId(null)
          },
        },
      )
    } else {
      setBumps((b) => ({ ...b, [kid.id]: (b[kid.id] ?? 0) + kid.allowance }))
      flash(`Sent ${fmt(kid.allowance)} allowance to ${kid.name}`)
    }
  }

  function setAvatar(id: string, url: string) {
    setAvatars((a) => ({ ...a, [id]: url }))
  }

  function onInvited(childName: string) {
    setAddOpen(false)
    flash(`Invite sent to ${childName} — they'll join when they sign in`)
    qc.invalidateQueries({ queryKey: ['join-outgoing'] })
    qc.invalidateQueries({ queryKey: ['pay', 'family'] })
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        leading={
          <div className="flex items-center gap-2.5">
            <h1 className="pv-h1">Family</h1>
            <span
              className="rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide"
              style={
                live
                  ? { background: 'var(--pv-pos-soft)', color: 'var(--pv-pos)' }
                  : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }
              }
            >
              {live ? '● Live' : 'Preview'}
            </span>
          </div>
        }
        trailing={<Button variant="soft" size="sm" leadingIcon={Plus} onClick={() => setAddOpen(true)}>Add child</Button>}
      />

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
        {/* Parent overview */}
        <Card className="pv-rise mt-2 p-5" style={{ background: 'var(--pv-grad-ink)' }}>
          <div className="pv-label" style={{ color: 'rgba(255,255,255,0.55)' }}>
            In the kids' pockets
          </div>
          <div className="pv-amount mt-1.5 text-[2.4rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>
            {fmt(totals.pocket)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <OverviewStat Icon={CalendarClock} label="Allowance / wk" value={fmt(totals.dueWeekly, { cents: false })} />
            <OverviewStat Icon={CheckCircle2} label="To approve" value={`${totals.tasks} ${totals.tasks === 1 ? 'task' : 'tasks'}`} />
          </div>
        </Card>

        {loading && (
          <div className="mt-10 flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            <Loader2 size={16} className="animate-spin" /> Loading your family…
          </div>
        )}

        {!loading && kids.length === 0 && (
          <Card className="mt-6 p-8 text-center">
            <IconBadge Icon={PiggyBank} tile="mint" size={48} />
            <div className="pv-h2 mt-4">No kids yet</div>
            <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>
              Add your first child to start allowances, savings goals, and chores.
            </p>
            <div className="mt-5">
              <Button variant="primary" leadingIcon={Plus} onClick={() => setAddOpen(true)}>
                Add a child
              </Button>
            </div>
          </Card>
        )}

        {/* Kid cards */}
        <div className="mt-6 space-y-4">
          {kids.map((k, i) => (
            <Card key={k.id} className="pv-stagger p-5" style={{ ['--i' as string]: i }}>
              <div className="flex items-center gap-4">
                <KidAvatar name={k.name} src={k.avatar} onPhoto={(url) => setAvatar(k.id, url)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="pv-h2 truncate">{k.name}</span>
                    {k.age != null && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                        {k.age}
                      </span>
                    )}
                  </div>
                  <div className="pv-amount mt-0.5 text-2xl">{fmt(k.balance)}</div>
                </div>
                {k.tasksDue > 0 && (
                  <Pill leadingIcon={CheckCircle2} onClick={() => flash(`${k.tasksDue} updates from ${k.name}`)}>
                    {k.tasksDue}
                  </Pill>
                )}
              </div>

              {/* Savings goal (only when we have one) */}
              {k.goal && (
                <div className="mt-5 rounded-[var(--pv-r-md)] p-4" style={{ background: 'var(--pv-surface-2)' }}>
                  <div className="flex items-center gap-2.5">
                    <IconBadge Icon={Target} tile={k.goal.tile} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="pv-title truncate text-sm">{k.goal.title}</div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                        {fmt(k.goal.saved, { cents: false })} of {fmt(k.goal.target, { cents: false })}
                      </div>
                    </div>
                    <span className="pv-amount text-sm" style={{ color: 'var(--pv-accent)' }}>
                      {Math.round((k.goal.saved / k.goal.target) * 100)}%
                    </span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={k.goal.saved} max={k.goal.target} />
                  </div>
                </div>
              )}

              {/* Allowance + give now */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <IconBadge Icon={Wallet} tile="mint" size={36} />
                  <div>
                    <div className="pv-title text-sm">{fmt(k.allowance)} allowance</div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                      every {k.cadence === 'weekly' ? 'week' : 'month'}
                    </div>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={givingId === k.id ? undefined : ArrowUpRight}
                  disabled={givingId === k.id}
                  onClick={() => giveAllowance(k)}
                >
                  {givingId === k.id ? <Loader2 size={16} className="animate-spin" /> : 'Give now'}
                </Button>
              </div>

              {/* Per-kid actions — all real */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Button variant="soft" size="sm" leadingIcon={Plus} onClick={() => setTopUpKid(k)}>
                  Add money
                </Button>
                <Button variant="soft" size="sm" leadingIcon={CreditCard} onClick={() => setCardKid(k)}>
                  Card
                </Button>
                <Button variant="soft" size="sm" leadingIcon={MapPin} onClick={() => setMapKid(k)}>
                  Locate
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Pending invites — kids you've invited who haven't joined yet */}
        {pendingInvites.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="pv-label">Invited</p>
            {pendingInvites.map((r) => (
              <Card key={r.id} flat className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}>
                  <Clock size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="pv-title truncate text-sm">{r.name || 'Invited'}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Waiting to join · {r.phone}</div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-warn)' }}>Pending</span>
              </Card>
            ))}
          </div>
        )}

        {kids.length > 0 && (
          <PressButton
            onClick={() => setAddOpen(true)}
            spring="lg"
            className="pv-dropzone mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--pv-r-lg)] py-5 text-sm font-bold"
            style={{ color: 'var(--pv-ink-2)' }}
          >
            <Plus size={18} strokeWidth={2.6} /> Add another child
          </PressButton>
        )}

        {/* Real chores: assign, AI/parent approval, payout */}
        <ChoresSection kids={kids.map((k) => ({ id: k.id, name: k.name }))} enabled={live} />
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-5">
          <div
            className="pv-pop flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold"
            style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-lg)' }}
          >
            <Check size={16} strokeWidth={3} style={{ color: '#7ef0b0' }} />
            {toast}
          </div>
        </div>
      )}

      {addOpen && <AddChildSheet onClose={() => setAddOpen(false)} onInvited={onInvited} />}
      {topUpKid && <TopUpSheet presetKidId={topUpKid.id} onClose={() => setTopUpKid(null)} />}
      {cardKid && <KidCardSheet accountId={cardKid.id} name={cardKid.name} onClose={() => setCardKid(null)} />}
      {mapKid && <KidMapSheet accountId={mapKid.id} name={mapKid.name} location={mapKid.lastLocation} onClose={() => setMapKid(null)} />}
    </div>
  )
}

function OverviewStat({ Icon, label, value }: { Icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
        <Icon size={14} strokeWidth={2.4} /> {label}
      </span>
      <div className="pv-amount mt-1 text-lg" style={{ color: 'var(--pv-on-dark)' }}>
        {value}
      </div>
    </div>
  )
}

/** Kid avatar that shows the photo cleanly, with a small camera badge to change it. */
function KidAvatar({ name, src, onPhoto }: { name: string; src?: string; onPhoto: (dataUrl: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = () => { if (typeof r.result === 'string') onPhoto(r.result) }
    r.readAsDataURL(f)
    e.target.value = ''
  }
  return (
    <button onClick={() => ref.current?.click()} aria-label={`Change ${name}'s photo`} className="pv-press relative shrink-0 rounded-full">
      <Avatar name={name} src={src} size={64} />
      <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--pv-accent)', color: 'var(--pv-on-accent)', boxShadow: '0 0 0 2px var(--pv-surface)' }}>
        <Camera size={12} strokeWidth={2.6} />
      </span>
      <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
    </button>
  )
}

function AddChildSheet({ onClose, onInvited }: { onClose: () => void; onInvited: (name: string) => void }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState<Country>(COUNTRIES[0])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [local, setLocal] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim().length > 0 && isValidLocal(local)

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/join-requests', {
        method: 'POST',
        body: JSON.stringify({
          phone: toE164(country.dial, local),
          role: 'kid',
          kidSeed: { name: name.trim() },
          initialTopup: Math.max(0, Math.min(10000, parseInt(amount || '0', 10) || 0)),
        }),
      })
      onInvited(name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the invite')
      setBusy(false)
    }
  }

  const field = 'mt-2 h-12 w-full rounded-2xl px-4 text-base font-semibold outline-none'
  const fieldStyle = { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(11,12,15,0.45)' }} onClick={onClose} />
      <div className="pv-rise relative w-full max-w-[460px] rounded-t-[var(--pv-r-2xl)] p-6 pb-[max(24px,env(safe-area-inset-bottom))]" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
        <div className="flex items-center justify-between">
          <h2 className="pv-h2">Add a child</h2>
          <button onClick={onClose} aria-label="Close" className="pv-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}><X size={18} /></button>
        </div>
        <p className="pv-body mt-1.5" style={{ color: 'var(--pv-ink-2)' }}>We'll invite them by phone — they join by signing in with this number.</p>

        <label className="mt-5 block">
          <span className="pv-label">Child's name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mila" className={field} style={fieldStyle} />
        </label>

        <div className="mt-4">
          <span className="pv-label">Their phone</span>
          <div className="mt-2 flex gap-2">
            <div className="relative">
              <button type="button" onClick={() => setPickerOpen((v) => !v)} className="pv-press flex h-12 items-center gap-1.5 rounded-2xl px-3 font-bold" style={fieldStyle}>
                <span className="text-lg">{country.flag}</span><span>{country.dial}</span><ChevronDown size={14} style={{ color: 'var(--pv-ink-3)' }} />
              </button>
              {pickerOpen && (
                <div className="pv-pop absolute left-0 top-14 z-10 w-52 overflow-hidden rounded-2xl" style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)' }}>
                  {COUNTRIES.map((cc) => (
                    <button key={cc.code} type="button" onClick={() => { setCountry(cc); setPickerOpen(false) }} className="pv-press flex w-full items-center gap-3 px-4 py-3 text-left">
                      <span className="text-lg">{cc.flag}</span><span className="flex-1 font-semibold">{cc.name}</span><span className="text-sm" style={{ color: 'var(--pv-ink-3)' }}>{cc.dial}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input type="tel" inputMode="tel" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="412 345 678" className="h-12 flex-1 rounded-2xl px-4 text-base font-semibold outline-none" style={fieldStyle} />
          </div>
        </div>

        <label className="mt-4 block">
          <span className="pv-label">Starting balance (optional)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} inputMode="numeric" placeholder="0" className={field} style={fieldStyle} />
        </label>

        {error && <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--pv-neg)' }}>{error}</p>}

        <div className="mt-6">
          <Button variant="primary" size="lg" full disabled={!valid || busy} onClick={submit}>{busy ? 'Sending…' : 'Send invite'}</Button>
        </div>
      </div>
    </div>
  )
}
