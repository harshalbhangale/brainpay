import { useState } from 'react'
import { Clock, Plus, ListChecks, Receipt, Send, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { aud, audSigned, relativeTime } from '../../lib/format'
import { Card, StatCard, ActionCircle, Avatar, SectionTitle, KidMapCard, FamilyMapCard } from '../ui'
import { BalanceCard } from './BalanceCard'
import { AddKidModal, TopupModal } from './modals'
import {
  isKid,
  kidName,
  type FamilyTab,
  type FeedResponse,
  type LedgerEntry,
  type Member,
  type OutgoingResponse,
  type Subject,
} from './types'

export function OverviewTab({
  subject,
  members,
  familyName,
  meAccountId,
  parentName,
  onSelectSubject,
  onGoTab,
}: {
  subject: Subject
  members: Member[]
  familyName?: string
  meAccountId?: string
  parentName: string
  onSelectSubject: (s: Subject) => void
  onGoTab: (t: FamilyTab) => void
}) {
  if (subject.kind === 'kid') {
    const kid = members.find((m) => m.accountId === subject.accountId)
    if (!kid) return <Empty text="Kid not found." />
    return <KidOverview kid={kid} familyName={familyName} onGoTab={onGoTab} />
  }
  return (
    <FamilyOverview
      members={members}
      familyName={familyName}
      meAccountId={meAccountId}
      parentName={parentName}
      onSelectSubject={onSelectSubject}
      onGoTab={onGoTab}
    />
  )
}

function KidOverview({ kid, familyName, onGoTab }: { kid: Member; familyName?: string; onGoTab: (t: FamilyTab) => void }) {
  const [topup, setTopup] = useState(false)
  const feedQ = useQuery({
    queryKey: ['feed', kid.accountId],
    queryFn: () => api<FeedResponse>(`/family/feed?kidId=${kid.accountId}&limit=50`),
  })
  const entries = feedQ.data?.entries ?? []
  const earned = entries.filter((e) => e.brainsDelta > 0).reduce((s, e) => s + e.brainsDelta, 0)
  const spent = entries.filter((e) => e.brainsDelta < 0).reduce((s, e) => s + Math.abs(e.brainsDelta), 0)

  return (
    <div className="space-y-6 p-5">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{kidName(kid)}</h1>

      <BalanceCard name={kidName(kid)} balance={kid.cachedBalance ?? 0} familyName={familyName} accountId={kid.accountId} />

      <div className="flex justify-around">
        <ActionCircle Icon={Send} label="Add money" variant="filled" onClick={() => setTopup(true)} />
        <ActionCircle Icon={ListChecks} label="Chores" onClick={() => onGoTab('chores')} />
        <ActionCircle Icon={Receipt} label="Activity" onClick={() => onGoTab('activity')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard Icon={TrendingUp} label="Earned" value={aud(earned)} sub="recent" subColor="var(--color-accent)" />
        <StatCard Icon={TrendingDown} label="Spent" value={aud(spent)} sub="recent" subColor="var(--color-danger)" />
      </div>

      <section>
        <SectionTitle action={<button onClick={() => onGoTab('activity')} className="text-sm font-bold text-accent">See all</button>}>
          Where they are
        </SectionTitle>
        <KidMapCard name={kidName(kid)} accountId={kid.accountId} location={kid.lastLocation} />
      </section>

      <section>
        <SectionTitle action={<button onClick={() => onGoTab('activity')} className="text-sm font-bold text-accent">See all</button>}>
          Recent activity
        </SectionTitle>
        {entries.length === 0 ? (
          <Empty text="No activity yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {entries.slice(0, 4).map((e) => (
              <MiniEntry key={e.id} entry={e} />
            ))}
          </div>
        )}
      </section>

      {topup && <TopupModal kid={kid} onClose={() => setTopup(false)} />}
    </div>
  )
}

function FamilyOverview({
  members,
  familyName,
  meAccountId,
  parentName,
  onSelectSubject,
  onGoTab,
}: {
  members: Member[]
  familyName?: string
  meAccountId?: string
  parentName: string
  onSelectSubject: (s: Subject) => void
  onGoTab: (t: FamilyTab) => void
}) {
  const [addKid, setAddKid] = useState(false)
  const [topupKid, setTopupKid] = useState<Member | null>(null)
  const me = members.find((m) => m.accountId === meAccountId)
  const kids = members.filter(isKid).filter((m) => m.accountId !== meAccountId)

  const outgoingQ = useQuery({
    queryKey: ['join-outgoing'],
    queryFn: () => api<OutgoingResponse>('/join-requests/outgoing'),
  })
  const pending = outgoingQ.data?.requests ?? []

  return (
    <div className="space-y-6 p-5">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Hi, {parentName}</h1>

      <div className="flex justify-around">
        <ActionCircle Icon={Send} label="Send money" variant="filled" onClick={() => (kids[0] ? setTopupKid(kids[0]) : setAddKid(true))} />
        <ActionCircle Icon={ListChecks} label="Add a chore" onClick={() => onGoTab('chores')} />
        <ActionCircle Icon={Receipt} label="Activity" onClick={() => onGoTab('activity')} />
      </div>

      {/* Parent wallet */}
      <Card className="flex items-center gap-3 p-4">
        <Avatar name={parentName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">Your wallet</div>
          {familyName && <div className="truncate text-sm text-muted">{familyName}</div>}
        </div>
        <div className="text-xl font-extrabold text-ink">{aud(me?.cachedBalance ?? 0)}</div>
      </Card>

      {kids.length > 0 && (
        <section>
          <SectionTitle>Where everyone is</SectionTitle>
          <FamilyMapCard kids={kids.map((k) => ({ name: kidName(k), accountId: k.accountId, location: k.lastLocation }))} />
        </section>
      )}

      <section>
        <SectionTitle action={<button onClick={() => setAddKid(true)} className="flex items-center gap-1 text-sm font-bold text-accent"><Plus size={15} /> Add kid</button>}>
          Kids
        </SectionTitle>

        {kids.length === 0 && pending.length === 0 && (
          <Empty text="No kids yet. Add one to assign chores and send money." />
        )}

        <div className="space-y-5">
          {kids.map((k) => (
            <div key={k.accountId} className="space-y-3">
              <Card onClick={() => onSelectSubject({ kind: 'kid', accountId: k.accountId })} className="flex items-center gap-3 p-4">
                <Avatar name={kidName(k)} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink">{kidName(k)}</div>
                  <div className="text-sm text-muted">Tap to manage</div>
                </div>
                <div className="text-lg font-extrabold text-accent">{aud(k.cachedBalance)}</div>
              </Card>
              <KidMapCard name={kidName(k)} accountId={k.accountId} location={k.lastLocation} onClick={() => onSelectSubject({ kind: 'kid', accountId: k.accountId })} />
            </div>
          ))}

          {pending.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 p-4 opacity-80">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-muted"><Clock size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-ink">{p.name || 'Invited'}</div>
                <div className="text-xs text-muted">Waiting to join · {p.phone}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {addKid && <AddKidModal onClose={() => setAddKid(false)} />}
      {topupKid && <TopupModal kid={topupKid} onClose={() => setTopupKid(null)} />}
    </div>
  )
}

function MiniEntry({ entry }: { entry: LedgerEntry }) {
  const positive = entry.brainsDelta >= 0
  const md = (entry.metadata ?? {}) as Record<string, unknown>
  const label =
    (md.choreTitle as string) || (md.itemName as string) || (md.note as string) || entry.kind.replace(/_/g, ' ')
  return (
    <Card className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{label}</div>
        <div className="text-xs text-muted">{relativeTime(entry.createdAt)}</div>
      </div>
      <div className={`text-sm font-bold ${positive ? 'text-accent' : 'text-danger'}`}>{audSigned(entry.brainsDelta)}</div>
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-surface px-4 py-5 text-center text-sm text-muted ring-1 ring-border">{text}</p>
}
