import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Users,
  Send,
  ListChecks,
  ChevronRight,
  Sparkles,
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
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { api } from '../../lib/api'
import { COUNTRIES, toE164, isValidLocal, type Country } from '../../lib/phone'
import { Avatar, Button, Card, IconBadge, PressButton, ProgressBar } from '../components/primitives'
import { BottomSheet } from '../components/BottomSheet'
import { TopBar } from '../components/shell'
import { fmt } from '../data'
import { useAuthStore } from '../../stores/auth'
import { useFamilyKids, useWallet, type FamilyKidVM } from '../useMoneyPal'
import { CARTOON_STYLES, cartoonAvatarUri, defaultStyleFor, isPhoto, type CartoonStyleId } from '../lib/cartoonAvatar'
import { useCartoonStyle } from '../lib/useCartoonStyle'
import type { FeedResponse, ChoresResponse } from '../../components/family/types'
import { ChoresSection, AddChoreSheet } from './family/Chores'
import { KidCardSheet, KidMapSheet } from './family/KidSheets'
import { TopUpSheet } from './TopUpSheet'

type PendingInvite = { id: string; phone: string | null; name: string | null; role: string; status: string }

// Chore statuses still awaiting a parent's review.
const AWAITING = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']

/** Earned / spent / net over the last 7 days for a kid, from the real ledger feed. */
function useKidWeek(kidId: string, enabled: boolean) {
  const q = useQuery({
    queryKey: ['family-feed', kidId],
    queryFn: () => api<FeedResponse>(`/family/feed?kidId=${kidId}&limit=80`),
    enabled,
    staleTime: 30_000,
  })
  const weekAgo = Date.now() - 7 * 864e5
  const recent = (q.data?.entries ?? []).filter((e) => new Date(e.createdAt).getTime() >= weekAgo)
  const earned = recent.filter((e) => e.brainsDelta > 0).reduce((s, e) => s + e.brainsDelta, 0)
  const spent = recent.filter((e) => e.brainsDelta < 0).reduce((s, e) => s + Math.abs(e.brainsDelta), 0)
  return { earned, spent, net: earned - spent, loading: q.isLoading }
}

export function Family() {
  const { live, loading, kids: baseKids, give } = useFamilyKids()
  const wallet = useWallet()
  const account = useAuthStore((s) => s.account)
  const parentName = (((account?.persona?.name as string) || 'there').trim().split(' ')[0])
  const qc = useQueryClient()

  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [bumps, setBumps] = useState<Record<string, number>>({}) // preview-only local credits
  const [givingId, setGivingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addChoreOpen, setAddChoreOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null)

  // Per-kid sheets (all wired to real features).
  const [topUpKid, setTopUpKid] = useState<FamilyKidVM | null>(null)
  const [cardKid, setCardKid] = useState<FamilyKidVM | null>(null)
  const [mapKid, setMapKid] = useState<FamilyKidVM | null>(null)

  const outgoingQ = useQuery({
    queryKey: ['join-outgoing'],
    queryFn: () => api<{ requests: PendingInvite[] }>('/join-requests/outgoing'),
    enabled: live,
  })
  const pendingInvites = (outgoingQ.data?.requests ?? []).filter((r) => r.status === 'pending')

  const choresQ = useQuery({ queryKey: ['chores'], queryFn: () => api<ChoresResponse>('/chores'), enabled: live })
  const allChores = choresQ.data?.chores ?? []

  const kids = useMemo(() => {
    return baseKids.map((k) => {
      const ov = avatars[k.id]
      return {
        ...k,
        avatar: ov === undefined ? k.avatar : ov || undefined,
        balance: k.balance + (live ? 0 : bumps[k.id] ?? 0),
      }
    })
  }, [baseKids, avatars, bumps, live])

  const selectedKid = kids.find((k) => k.id === selectedKidId) ?? null

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
          onSuccess: () => { flash(`Sent ${fmt(kid.allowance)} allowance to ${kid.name}`); setGivingId(null) },
          onError: () => { flash(`Couldn't reach ${kid.name}'s wallet — try again`); setGivingId(null) },
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

  const setKidStyle = useCartoonStyle((s) => s.setStyle)

  // Drop any locally-uploaded photo so the cartoon (from the VM) shows again.
  function clearAvatar(id: string) {
    setAvatars((a) => {
      const next = { ...a }
      delete next[id]
      return next
    })
  }

  // Pick a cartoon look: persist the style and remove any local photo override.
  function pickStyle(id: string, style: CartoonStyleId) {
    clearAvatar(id)
    setKidStyle(id, style)
  }

  function onInvited(childName: string) {
    setAddOpen(false)
    flash(`Invite sent to ${childName} — they'll join when they sign in`)
    qc.invalidateQueries({ queryKey: ['join-outgoing'] })
    qc.invalidateQueries({ queryKey: ['pay', 'family'] })
  }

  async function revokeInvite(r: PendingInvite) {
    if (revokingId) return
    setRevokingId(r.id)
    try {
      await api(`/join-requests/${r.id}/revoke`, { method: 'POST' })
      flash(`Cancelled the invite to ${r.name || 'your kid'}`)
      qc.invalidateQueries({ queryKey: ['join-outgoing'] })
    } catch {
      flash(`Couldn't cancel that invite — try again`)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        leading={
          <div className="flex items-center gap-2.5">
            <h1 className="pv-h1">Family</h1>
            <span
              className="rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide"
              style={live ? { background: 'var(--pv-pos-soft)', color: 'var(--pv-pos)' } : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)' }}
            >
              {live ? '● Live' : 'Preview'}
            </span>
          </div>
        }
        trailing={<Button variant="soft" size="sm" leadingIcon={Plus} onClick={() => setAddOpen(true)}>Add child</Button>}
      />

      {/* Avatar rail — Family overview + each kid + Add */}
      {!loading && kids.length > 0 && (
        <AvatarRail kids={kids} selectedKidId={selectedKidId} onSelect={setSelectedKidId} onAdd={() => setAddOpen(true)} />
      )}

      <div className="pv-no-scrollbar flex-1 overflow-y-auto px-5 pb-40">
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
              <Button variant="primary" leadingIcon={Plus} onClick={() => setAddOpen(true)}>Add a child</Button>
            </div>
          </Card>
        )}

        {!loading && kids.length > 0 && (
          selectedKid ? (
            <KidDetail
              key={selectedKid.id}
              kid={selectedKid}
              live={live}
              giving={givingId === selectedKid.id}
              onGive={() => giveAllowance(selectedKid)}
              onTopUp={() => setTopUpKid(selectedKid)}
              onCard={() => setCardKid(selectedKid)}
              onMap={() => setMapKid(selectedKid)}
              onPhoto={(url) => setAvatar(selectedKid.id, url)}
              onPickStyle={(style) => pickStyle(selectedKid.id, style)}
              onRemovePhoto={() => clearAvatar(selectedKid.id)}
            />
          ) : (
            <FamilyOverview
              parentName={parentName}
              parentBalance={wallet.balance}
              kids={kids}
              live={live}
              toApprove={allChores.filter((c) => AWAITING.includes(c.status)).length}
              pendingInvites={pendingInvites}
              revokingId={revokingId}
              onSelectKid={setSelectedKidId}
              onSendMoney={() => setSendOpen(true)}
              onAddChore={() => setAddChoreOpen(true)}
              onAddChild={() => setAddOpen(true)}
              onRevoke={revokeInvite}
            />
          )
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-5">
          <div className="pv-pop flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-lg)' }}>
            <Check size={16} strokeWidth={3} style={{ color: '#7ef0b0' }} />
            {toast}
          </div>
        </div>
      )}

      {addOpen && <AddChildSheet onClose={() => setAddOpen(false)} onInvited={onInvited} />}
      {sendOpen && <TopUpSheet onClose={() => setSendOpen(false)} />}
      {addChoreOpen && (
        <AddChoreSheet
          kids={kids.map((k) => ({ id: k.id, name: k.name }))}
          onClose={() => setAddChoreOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['chores'] })}
        />
      )}
      {topUpKid && <TopUpSheet presetKidId={topUpKid.id} onClose={() => setTopUpKid(null)} />}
      {cardKid && <KidCardSheet accountId={cardKid.id} name={cardKid.name} onClose={() => setCardKid(null)} />}
      {mapKid && <KidMapSheet accountId={mapKid.id} name={mapKid.name} location={mapKid.lastLocation} onClose={() => setMapKid(null)} />}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── Avatar rail */
function AvatarRail({
  kids,
  selectedKidId,
  onSelect,
  onAdd,
}: {
  kids: FamilyKidVM[]
  selectedKidId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
}) {
  return (
    <div className="pv-no-scrollbar flex items-start gap-5 overflow-x-auto px-5 pb-1 pt-1">
      <RailItem label="Family" active={selectedKidId === null} onClick={() => onSelect(null)}>
        <FamilyGlyph kids={kids} />
      </RailItem>
      {kids.map((k) => (
        <RailItem key={k.id} label={k.name} active={selectedKidId === k.id} onClick={() => onSelect(k.id)}>
          <Avatar name={k.name} src={k.avatar} tile={k.tile} size={56} fun />
        </RailItem>
      ))}
      <RailItem label="Add" onClick={onAdd}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed" style={{ borderColor: 'var(--pv-line-strong)', color: 'var(--pv-ink-3)' }}>
          <Plus size={22} strokeWidth={2.4} />
        </span>
      </RailItem>
    </div>
  )
}

function RailItem({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="pv-press flex w-16 shrink-0 flex-col items-center gap-1.5">
      <span className="rounded-full" style={active ? { boxShadow: '0 0 0 2.5px var(--pv-primary)' } : undefined}>
        {children}
      </span>
      <span className="max-w-full truncate text-xs font-bold" style={{ color: active ? 'var(--pv-ink)' : 'var(--pv-ink-3)' }}>
        {label}
      </span>
      <span className="h-0.5 w-6 rounded-full" style={{ background: active ? 'var(--pv-primary)' : 'transparent' }} />
    </button>
  )
}

function FamilyGlyph({ kids }: { kids: FamilyKidVM[] }) {
  if (kids.length === 0) {
    return (
      <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
        <Users size={22} strokeWidth={2.2} />
      </span>
    )
  }
  return (
    <span className="relative block h-14 w-14">
      <span className="absolute left-0 top-0" style={{ boxShadow: '0 0 0 2px var(--pv-bg)', borderRadius: 9999 }}>
        <Avatar name={kids[0].name} src={kids[0].avatar} tile={kids[0].tile} size={38} fun />
      </span>
      {kids[1] ? (
        <span className="absolute bottom-0 right-0" style={{ boxShadow: '0 0 0 2px var(--pv-bg)', borderRadius: 9999 }}>
          <Avatar name={kids[1].name} src={kids[1].avatar} tile={kids[1].tile} size={38} fun />
        </span>
      ) : (
        <span className="absolute bottom-0 right-0 flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-3)', boxShadow: '0 0 0 2px var(--pv-bg)' }}>
          <Users size={16} strokeWidth={2.4} />
        </span>
      )}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────── Family overview */
function FamilyOverview({
  parentName,
  parentBalance,
  kids,
  live,
  toApprove,
  pendingInvites,
  revokingId,
  onSelectKid,
  onSendMoney,
  onAddChore,
  onAddChild,
  onRevoke,
}: {
  parentName: string
  parentBalance: number
  kids: FamilyKidVM[]
  live: boolean
  toApprove: number
  pendingInvites: PendingInvite[]
  revokingId: string | null
  onSelectKid: (id: string) => void
  onSendMoney: () => void
  onAddChore: () => void
  onAddChild: () => void
  onRevoke: (r: PendingInvite) => void
}) {
  const totalPocket = kids.reduce((s, k) => s + k.balance, 0)
  const allowanceDue = kids.filter((k) => k.cadence === 'weekly').reduce((s, k) => s + k.allowance, 0)

  return (
    <div className="pt-2">
      <div className="pv-rise mt-1">
        <span className="pv-eyebrow">Your family</span>
        <h1 className="pv-display mt-1">Hi {parentName}</h1>
      </div>

      <DailySummary
        kids={kids}
        kidsCount={kids.length}
        totalPocket={totalPocket}
        toApprove={toApprove}
        allowanceDue={allowanceDue}
        pendingCount={pendingInvites.length}
      />

      {/* Quick actions */}
      <div className="pv-rise mt-6 grid grid-cols-3 gap-3">
        <CircleAction Icon={Send} label="Send money" tone="accent" onClick={onSendMoney} />
        <CircleAction Icon={ListChecks} label="Add a chore" onClick={onAddChore} />
        <CircleAction Icon={Plus} label="Add child" onClick={onAddChild} />
      </div>

      {/* Accounts */}
      <div className="pv-rise mt-7 space-y-2.5">
        <p className="pv-label">Accounts</p>

        <Card className="flex items-center gap-3.5 p-4">
          <IconBadge Icon={Wallet} ink size={48} />
          <div className="min-w-0 flex-1">
            <div className="pv-title truncate">Parent&apos;s Wallet</div>
            <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>Your balance</div>
          </div>
          <div className="pv-amount text-[0.95rem]">{fmt(parentBalance)}</div>
        </Card>

        {kids.map((k) => (
          <KidListRow key={k.id} kid={k} enabled={live} onClick={() => onSelectKid(k.id)} />
        ))}
      </div>

      {/* Pending invites */}
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
              <button
                onClick={() => onRevoke(r)}
                disabled={revokingId === r.id}
                aria-label={`Cancel invite to ${r.name || 'your kid'}`}
                className="pv-press flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}
              >
                {revokingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <><X size={14} strokeWidth={2.6} /> Revoke</>}
              </button>
            </Card>
          ))}
        </div>
      )}

      <PressButton
        onClick={onAddChild}
        spring="lg"
        className="pv-dropzone mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--pv-r-lg)] py-5 text-sm font-bold"
        style={{ color: 'var(--pv-ink-2)' }}
      >
        <Plus size={18} strokeWidth={2.6} /> Add another child
      </PressButton>
    </div>
  )
}

function DailySummary({
  kids,
  kidsCount,
  totalPocket,
  toApprove,
  allowanceDue,
  pendingCount,
}: {
  kids: FamilyKidVM[]
  kidsCount: number
  totalPocket: number
  toApprove: number
  allowanceDue: number
  pendingCount: number
}) {
  const recs: string[] = []
  if (toApprove > 0) recs.push(`${toApprove} chore${toApprove > 1 ? 's' : ''} waiting for your review`)
  if (allowanceDue > 0) recs.push(`${fmt(allowanceDue, { cents: false })} in allowances due this week`)
  if (pendingCount > 0) recs.push(`${pendingCount} invite${pendingCount > 1 ? 's' : ''} still waiting to be accepted`)
  const allGood = recs.length === 0

  return (
    <Card className="pv-rise pv-sheen relative mt-4 overflow-hidden p-5" style={{ background: 'var(--pv-grad-ink)' }}>
      {/* ambient accent glow */}
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full" style={{ backgroundImage: 'var(--pv-grad-accent)', opacity: 0.22, filter: 'blur(26px)' }} />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="pv-eyebrow" style={{ color: 'rgba(255,255,255,0.5)' }}>Today</span>
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ background: 'rgba(255,255,255,0.12)', color: allGood ? '#7ef0b0' : '#ffd76b' }}>
            <Sparkles size={12} strokeWidth={2.6} /> {allGood ? 'All caught up' : 'Needs you'}
          </span>
        </div>

        <div className="pv-label mt-4" style={{ color: 'rgba(255,255,255,0.55)' }}>In their pockets</div>
        <div className="pv-amount text-[2.7rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>{fmt(totalPocket)}</div>

        <div className="mt-3 flex items-center gap-2.5">
          <AvatarStack kids={kids} />
          <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>
            across {kidsCount} {kidsCount === 1 ? 'kid' : 'kids'}
          </span>
        </div>

        {allGood ? (
          <p className="mt-4 text-sm font-semibold leading-snug" style={{ color: 'rgba(255,255,255,0.72)' }}>
            Nothing needs you right now. 🎉
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {recs.map((r, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#7ef0b0' }} />
                <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }}>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/** Overlapping avatar cluster on a dark hero. */
function AvatarStack({ kids }: { kids: FamilyKidVM[] }) {
  const shown = kids.slice(0, 4)
  const extra = kids.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((k, i) => (
        <span key={k.id} className="rounded-full" style={{ marginLeft: i === 0 ? 0 : -10, boxShadow: '0 0 0 2px #16181f', zIndex: shown.length - i }}>
          <Avatar name={k.name} src={k.avatar} tile={k.tile} size={30} fun />
        </span>
      ))}
      {extra > 0 && (
        <span className="ml-[-10px] flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', boxShadow: '0 0 0 2px #16181f' }}>
          +{extra}
        </span>
      )}
    </div>
  )
}

function CircleAction({ Icon, label, tone = 'light', onClick }: { Icon: typeof Send; label: string; tone?: 'light' | 'dark' | 'accent'; onClick: () => void }) {
  const isAccent = tone === 'accent'
  const style = tone === 'dark'
    ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }
    : isAccent
      ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }
      : { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }
  return (
    <button onClick={onClick} className={`pv-press-lg ${isAccent ? 'pv-sheen' : ''} pv-hairline flex flex-col items-center gap-2.5 rounded-[var(--pv-r-lg)] py-4`} style={style}>
      <Icon size={23} strokeWidth={2.3} />
      <span className="text-center text-xs font-bold leading-tight">{label}</span>
    </button>
  )
}

function KidListRow({ kid, enabled, onClick }: { kid: FamilyKidVM; enabled: boolean; onClick: () => void }) {
  const wk = useKidWeek(kid.id, enabled)
  const sub = !enabled
    ? `${fmt(kid.balance)} balance`
    : wk.net > 0
      ? `Saved ${fmt(wk.net)} this week`
      : wk.spent > 0
        ? `Spent ${fmt(wk.spent)} this week`
        : 'No activity yet'
  const showTrend = enabled && (wk.earned > 0 || wk.spent > 0)
  const up = wk.net >= 0
  return (
    <Card onClick={onClick} className="pv-hairline p-4">
      <div className="flex items-center gap-3.5">
        <span className="rounded-full" style={{ boxShadow: `0 0 0 2.5px var(--pv-${kid.tile})` }}>
          <Avatar name={kid.name} src={kid.avatar} tile={kid.tile} size={46} fun />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="pv-title truncate">{kid.name}</span>
            {kid.tasksDue > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide" style={{ background: 'var(--pv-accent-soft)', color: 'var(--pv-accent-2)' }}>
                {kid.tasksDue} to review
              </span>
            )}
          </div>
          <div className="truncate text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{sub}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="pv-amount text-[0.95rem]">{fmt(kid.balance)}</div>
          {showTrend && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.625rem] font-extrabold" style={{ background: up ? 'var(--pv-pos-soft)' : 'var(--pv-neg-soft)', color: up ? 'var(--pv-pos)' : 'var(--pv-neg)' }}>
              {up ? <TrendingUp size={11} strokeWidth={2.6} /> : <TrendingDown size={11} strokeWidth={2.6} />}
              {fmt(Math.abs(wk.net), { cents: false })}
            </span>
          )}
        </div>
        <ChevronRight size={18} style={{ color: 'var(--pv-ink-3)' }} />
      </div>

      {kid.goal && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--pv-ink-3)' }}>
            <span className="truncate">🎯 {kid.goal.title}</span>
            <span className="pv-text-accent">{Math.round((kid.goal.saved / kid.goal.target) * 100)}%</span>
          </div>
          <ProgressBar value={kid.goal.saved} max={kid.goal.target} />
        </div>
      )}
    </Card>
  )
}

/* ─────────────────────────────────────────────────────────────── Kid detail */
function KidDetail({
  kid,
  live,
  giving,
  onGive,
  onTopUp,
  onCard,
  onMap,
  onPhoto,
  onPickStyle,
  onRemovePhoto,
}: {
  kid: FamilyKidVM
  live: boolean
  giving: boolean
  onGive: () => void
  onTopUp: () => void
  onCard: () => void
  onMap: () => void
  onPhoto: (dataUrl: string) => void
  onPickStyle: (style: CartoonStyleId) => void
  onRemovePhoto: () => void
}) {
  const wk = useKidWeek(kid.id, live)
  return (
    <div className="pt-2">
      {/* Hero */}
      <Card className="pv-rise pv-sheen relative overflow-hidden p-5" style={{ background: 'var(--pv-grad-ink)' }}>
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full" style={{ background: `var(--pv-${kid.tile})`, opacity: 0.24, filter: 'blur(26px)' }} />
        <div className="relative flex items-center gap-4">
          <KidAvatar
            name={kid.name}
            src={kid.avatar}
            seed={kid.id || kid.name}
            onPhoto={onPhoto}
            onPickStyle={onPickStyle}
            onRemovePhoto={onRemovePhoto}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-extrabold" style={{ color: 'var(--pv-on-dark)' }}>{kid.name}</span>
              {kid.age != null && (
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' }}>{kid.age}</span>
              )}
            </div>
            <div className="pv-label mt-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Balance</div>
            <div className="pv-amount text-[2.2rem] leading-none" style={{ color: 'var(--pv-on-dark)' }}>{fmt(kid.balance)}</div>
          </div>
        </div>
      </Card>

      {/* Saving + this week */}
      <div className="mt-4 grid grid-cols-2 gap-3.5">
        <Card className="p-4">
          <IconBadge Icon={PiggyBank} tile="mint" size={40} />
          <div className="pv-label mt-3">Saving</div>
          {kid.goal ? (
            <>
              <div className="pv-amount text-xl">{fmt(kid.goal.saved, { cents: false })}</div>
              <div className="mt-2"><ProgressBar value={kid.goal.saved} max={kid.goal.target} /></div>
              <div className="mt-1.5 truncate text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
                {kid.goal.title} · {Math.round((kid.goal.saved / kid.goal.target) * 100)}%
              </div>
            </>
          ) : (
            <>
              <div className="pv-amount text-xl">{fmt(0, { cents: false })}</div>
              <div className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>No savings goal yet</div>
            </>
          )}
        </Card>

        <Card className="p-4">
          <IconBadge Icon={wk.net >= 0 ? TrendingUp : TrendingDown} tile="sky" size={40} />
          <div className="pv-label mt-3">This week</div>
          <div className="pv-amount text-xl" style={{ color: wk.net > 0 ? 'var(--pv-pos)' : wk.net < 0 ? 'var(--pv-neg)' : 'var(--pv-ink)' }}>
            {wk.net > 0 ? '+' : wk.net < 0 ? '−' : ''}{fmt(Math.abs(wk.net), { cents: false })}
          </div>
          <div className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            {fmt(wk.earned, { cents: false })} in · {fmt(wk.spent, { cents: false })} out
          </div>
        </Card>
      </div>

      {/* Allowance + give */}
      <Card className="mt-3.5 flex items-center justify-between p-4">
        <div className="flex items-center gap-2.5">
          <IconBadge Icon={Wallet} tile="butter" size={40} />
          <div>
            <div className="pv-title text-sm">{fmt(kid.allowance)} allowance</div>
            <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>every {kid.cadence === 'weekly' ? 'week' : 'month'}</div>
          </div>
        </div>
        <Button variant="primary" size="sm" leadingIcon={giving ? undefined : ArrowUpRight} disabled={giving} onClick={onGive}>
          {giving ? <Loader2 size={16} className="animate-spin" /> : 'Give now'}
        </Button>
      </Card>

      {/* Per-kid actions */}
      <div className="mt-3.5 grid grid-cols-3 gap-3">
        <Button variant="soft" size="sm" leadingIcon={Plus} onClick={onTopUp}>Add money</Button>
        <Button variant="soft" size="sm" leadingIcon={CreditCard} onClick={onCard}>Card</Button>
        <Button variant="soft" size="sm" leadingIcon={MapPin} onClick={onMap}>Locate</Button>
      </div>

      {/* This kid's chores, nested right here */}
      <ChoresSection kids={[{ id: kid.id, name: kid.name }]} enabled={live} onlyKidId={kid.id} />
    </div>
  )
}

/** Kid avatar with a tap-to-edit badge → choose a cute cartoon look or upload a photo. */
function KidAvatar({
  name,
  src,
  seed,
  onPhoto,
  onPickStyle,
  onRemovePhoto,
}: {
  name: string
  src?: string
  seed: string
  onPhoto: (dataUrl: string) => void
  onPickStyle: (style: CartoonStyleId) => void
  onRemovePhoto: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const savedStyle = useCartoonStyle((s) => s.styles[seed])
  const activeStyle = savedStyle ?? defaultStyleFor(seed)
  const hasPhoto = isPhoto(src)

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = () => {
      if (typeof r.result === 'string') {
        onPhoto(r.result)
        setOpen(false)
      }
    }
    r.readAsDataURL(f)
    e.target.value = ''
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Change ${name}'s avatar`} className="pv-press relative shrink-0 rounded-full">
        <Avatar name={name} src={src} size={64} fun />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--pv-accent)', color: 'var(--pv-on-accent)', boxShadow: '0 0 0 2px var(--pv-surface)' }}>
          <Camera size={12} strokeWidth={2.6} />
        </span>
      </button>

      {open && (
        <BottomSheet onClose={() => setOpen(false)} title={`${name}'s avatar`}>
          <p className="pv-label mb-2">Pick a character</p>
          <div className="grid grid-cols-3 gap-3">
            {CARTOON_STYLES.map((s) => {
              const on = !hasPhoto && activeStyle === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => { onPickStyle(s.id); setOpen(false) }}
                  className="pv-press flex flex-col items-center gap-1.5 rounded-[var(--pv-r-lg)] p-2"
                  style={{ background: on ? 'var(--pv-accent-soft)' : 'var(--pv-surface-2)', outline: on ? '2.5px solid var(--pv-accent)' : 'none', outlineOffset: -1 }}
                >
                  <img src={cartoonAvatarUri(seed, s.id)} alt={s.label} className="h-14 w-14 rounded-full" />
                  <span className="text-[11px] font-bold" style={{ color: on ? 'var(--pv-accent-2)' : 'var(--pv-ink-2)' }}>{s.label}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex gap-3">
            <Button variant="soft" full leadingIcon={Camera} onClick={() => ref.current?.click()}>Upload photo</Button>
            {hasPhoto && (
              <Button variant="ghost" full leadingIcon={X} onClick={() => { onRemovePhoto(); setOpen(false) }}>Remove photo</Button>
            )}
          </div>
          <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
        </BottomSheet>
      )}
    </>
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
    <BottomSheet
      onClose={onClose}
      title="Add a child"
      subtitle="We'll invite them by phone — they join by signing in with this number."
      footer={<Button variant="primary" size="lg" full disabled={!valid || busy} onClick={submit}>{busy ? 'Sending…' : 'Send invite'}</Button>}
    >
      <label className="block">
        <span className="pv-label">Child&apos;s name</span>
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
    </BottomSheet>
  )
}
