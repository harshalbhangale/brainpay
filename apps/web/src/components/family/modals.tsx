import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { COUNTRIES, isValidLocal, toE164, type Country } from '../../lib/phone'
import { GradientButton } from '../ui'
import { kidName, type Member } from './types'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise grad-border relative max-h-[90%] w-full max-w-md overflow-y-auto rounded-t-3xl p-6 shadow-pop sm:rounded-3xl"
        style={{ backgroundImage: 'var(--grad-card)' }}
      >
        <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-grad-aurora opacity-20 blur-2xl" />
        <div className="relative mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-ink">{title}</h3>
          <button onClick={onClose} className="press glass flex h-8 w-8 items-center justify-center rounded-full text-muted">
            ✕
          </button>
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  )
}

const fieldClass =
  'grad-border h-12 w-full rounded-2xl bg-transparent px-4 text-ink outline-none placeholder:text-faint'
const labelClass = 'mb-1 block text-xs font-extrabold uppercase tracking-widest text-muted'

export function AddKidModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [country, setCountry] = useState<Country>(COUNTRIES[0])
  const [local, setLocal] = useState('')
  const [topup, setTopup] = useState('0')

  const mutation = useMutation({
    mutationFn: () =>
      api('/join-requests', {
        method: 'POST',
        body: JSON.stringify({
          phone: toE164(country.dial, local),
          role: 'kid',
          kidSeed: { name: name.trim() },
          initialTopup: Math.max(0, parseInt(topup || '0', 10) || 0),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['join-outgoing'] })
      qc.invalidateQueries({ queryKey: ['family'] })
      onClose()
    },
  })

  const valid = name.trim().length > 0 && isValidLocal(local)

  return (
    <Modal title="Add a kid" onClose={onClose}>
      <label className={labelClass}>Name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className={`${fieldClass} mb-4`} />

      <label className={labelClass}>Phone</label>
      <div className="mb-4 flex gap-2">
        <select
          value={country.code}
          onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])}
          className="grad-border h-12 rounded-2xl bg-transparent px-3 text-ink outline-none"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-surface text-ink">
              {c.flag} {c.dial}
            </option>
          ))}
        </select>
        <input value={local} onChange={(e) => setLocal(e.target.value)} inputMode="tel" placeholder="412 345 678" className={`${fieldClass} flex-1`} />
      </div>

      <label className={labelClass}>Starting balance (optional)</label>
      <input value={topup} onChange={(e) => setTopup(e.target.value)} inputMode="numeric" className={`${fieldClass} mb-4`} />

      {mutation.isError && (
        <p className="mb-3 text-sm text-danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Could not send invite'}
        </p>
      )}

      <GradientButton onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="mt-2 w-full rounded-full py-3.5">
        {mutation.isPending ? 'Sending…' : 'Send invite'}
      </GradientButton>
      <p className="mt-3 text-center text-xs text-muted">Your kid joins by signing in with this number.</p>
    </Modal>
  )
}

export function TopupModal({ kid, onClose }: { kid: Member; onClose: () => void }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState('50')
  const [note, setNote] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({
          kidAccountId: kid.accountId,
          brainsDelta: Math.max(1, parseInt(amount || '0', 10) || 0),
          note: note.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
      onClose()
    },
  })

  const valid = (parseInt(amount || '0', 10) || 0) >= 1

  return (
    <Modal title={`Add money to ${kidName(kid)}'s wallet`} onClose={onClose}>
      <label className={labelClass}>Amount (AUD)</label>
      <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={`${fieldClass} mb-4`} />

      <label className={labelClass}>Note (optional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Great week!" className={`${fieldClass} mb-4`} />

      {mutation.isError && (
        <p className="mb-3 text-sm text-danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Could not send'}
        </p>
      )}

      <GradientButton onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="mt-2 w-full rounded-full py-3.5">
        {mutation.isPending ? 'Adding…' : `Add $${amount || 0}`}
      </GradientButton>
    </Modal>
  )
}

export function AddChoreModal({ kids, presetKidId, onClose }: { kids: Member[]; presetKidId?: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [assignedTo, setAssignedTo] = useState(presetKidId ?? kids[0]?.accountId ?? '')
  const [title, setTitle] = useState('')
  const [reward, setReward] = useState('50')

  const mutation = useMutation({
    mutationFn: () =>
      api('/chores', {
        method: 'POST',
        body: JSON.stringify({
          assignedTo,
          title: title.trim(),
          rewardBrains: Math.max(1, parseInt(reward || '50', 10) || 50),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] })
      onClose()
    },
  })

  const valid = assignedTo && title.trim().length > 0

  return (
    <Modal title="New chore" onClose={onClose}>
      <label className={labelClass}>For</label>
      <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="grad-border mb-4 h-12 w-full rounded-2xl bg-transparent px-3 text-ink outline-none">
        {kids.map((k) => (
          <option key={k.accountId} value={k.accountId} className="bg-surface text-ink">
            {kidName(k)}
          </option>
        ))}
      </select>

      <label className={labelClass}>Chore</label>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Take out the bins" className={`${fieldClass} mb-4`} />

      <label className={labelClass}>Reward (AUD)</label>
      <input value={reward} onChange={(e) => setReward(e.target.value)} inputMode="numeric" className={`${fieldClass} mb-4`} />

      {mutation.isError && (
        <p className="mb-3 text-sm text-danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Could not create chore'}
        </p>
      )}

      <GradientButton onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="mt-2 w-full rounded-full py-3.5">
        {mutation.isPending ? 'Creating…' : 'Create chore'}
      </GradientButton>
    </Modal>
  )
}
