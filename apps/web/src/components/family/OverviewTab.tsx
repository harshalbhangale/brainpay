import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { aud, audSigned, relativeTime } from '../../lib/format'
import { BalanceCard } from './BalanceCard'
import { AddKidModal, TopupModal } from './modals'
import {
  initial,
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
    />
  )
}

function KidOverview({ kid, familyName, onGoTab }: { kid: Member; familyName?: string; onGoTab: (t: FamilyTab) => void }) {
  const navigate = useNavigate()
  const [topup, setTopup] = useState(false)

  const feedQ = useQuery({
    queryKey: ['feed', kid.accountId],
    queryFn: () => api<FeedResponse>(`/family/feed?kidId=${kid.accountId}&limit=50`),
  })
  const entries = feedQ.data?.entries ?? []
  const earned = entries.filter((e) => e.brainsDelta > 0).reduce((s, e) => s + e.brainsDelta, 0)
  const spent = entries.filter((e) => e.brainsDelta < 0).reduce((s, e) => s + Math.abs(e.brainsDelta), 0)

  return (
    <div className="space-y-5 p-5">
      <BalanceCard name={kidName(kid)} balance={kid.cachedBalance ?? 0} familyName={familyName} accountId={kid.accountId} />

      <button
        onClick={() => setTopup(true)}
        className="w-full rounded-full bg-accent py-3.5 font-bold text-black active:scale-[0.99]"
      >
        Send money
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Earned" value={aud(earned)} accent="#3ddc84" />
        <Tile label="Spent" value={aud(spent)} accent="#ff5c5c" />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Recent activity</h3>
          <button onClick={() => onGoTab('activity')} className="text-sm font-bold text-accent">
            See all
          </button>
        </div>
        {entries.length === 0 ? (
          <Empty text="No activity yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {entries.slice(0, 3).map((e) => (
              <MiniEntry key={e.id} entry={e} />
            ))}
          </div>
        )}
      </section>

      <button
        onClick={() => navigate('/live')}
        className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left active:scale-[0.99]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-xl">📷</span>
        <span className="flex-1">
          <span className="block font-bold text-ink">Live scan</span>
          <span className="block text-sm text-muted">Real-time PAL verdict on a product</span>
        </span>
        <span className="text-muted">›</span>
      </button>

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
}: {
  members: Member[]
  familyName?: string
  meAccountId?: string
  parentName: string
  onSelectSubject: (s: Subject) => void
}) {
  const [addKid, setAddKid] = useState(false)
  const me = members.find((m) => m.accountId === meAccountId)
  const kids = members.filter(isKid).filter((m) => m.accountId !== meAccountId)

  const outgoingQ = useQuery({
    queryKey: ['join-outgoing'],
    queryFn: () => api<OutgoingResponse>('/join-requests/outgoing'),
  })
  const pending = outgoingQ.data?.requests ?? []

  return (
    <div className="space-y-5 p-5">
      <BalanceCard name={parentName} balance={me?.cachedBalance ?? 0} familyName={familyName} accountId={meAccountId} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Kids</h3>
          <button onClick={() => setAddKid(true)} className="text-sm font-bold text-accent">
            + Add kid
          </button>
        </div>

        {kids.length === 0 && pending.length === 0 && (
          <Empty text="No kids yet. Add one to assign chores and send money." />
        )}

        <div className="grid grid-cols-2 gap-3">
          {kids.map((k) => (
            <button
              key={k.accountId}
              onClick={() => onSelectSubject({ kind: 'kid', accountId: k.accountId })}
              className="rounded-2xl bg-surface p-4 text-left active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 font-extrabold text-ink">
                {initial(kidName(k))}
              </span>
              <div className="mt-2 truncate font-bold text-ink">{kidName(k)}</div>
              <div className="text-sm text-accent">{aud(k.cachedBalance)}</div>
            </button>
          ))}
          {pending.map((p) => (
            <div key={p.id} className="rounded-2xl border border-dashed border-surface2 p-4 opacity-70">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-lg">⏳</span>
              <div className="mt-2 truncate font-bold text-ink">{p.name || 'Invited'}</div>
              <div className="text-xs text-muted">Waiting · {p.phone}</div>
            </div>
          ))}
        </div>
      </section>

      {addKid && <AddKidModal onClose={() => setAddKid(false)} />}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-extrabold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  )
}

function MiniEntry({ entry }: { entry: LedgerEntry }) {
  const positive = entry.brainsDelta >= 0
  const md = (entry.metadata ?? {}) as Record<string, unknown>
  const label =
    (md.choreTitle as string) || (md.itemName as string) || (md.note as string) || entry.kind.replace(/_/g, ' ')
  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{label}</div>
        <div className="text-xs text-muted">{relativeTime(entry.createdAt)}</div>
      </div>
      <div className={`text-sm font-bold ${positive ? 'text-accent' : 'text-danger'}`}>
        {audSigned(entry.brainsDelta)}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-surface px-4 py-5 text-center text-sm text-muted">{text}</p>
}
