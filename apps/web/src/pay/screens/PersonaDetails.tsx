/**
 * PersonaDetails — the editable "About you / your family" section in Profile.
 * Renders every persona field from the same plan that builds it (planFor), so
 * the two never drift, and lets the user edit each one in a tidy sheet (chips
 * for choices, an input for text). Saves via PATCH /me. Name lives on the
 * identity card, so it's omitted here.
 */
import { useState } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { planFor, type Question, type Choice } from '../onboard/personaPlan'
import { BottomSheet } from '../components/BottomSheet'
import { Button } from '../components/primitives'

const LABELS: Record<string, string> = {
  age: 'Age',
  interests: 'Loves',
  savingGoal: 'Saving for',
  spend_style: 'Money style',
  money_upbringing: 'Money upbringing',
  parenting_style: 'Parenting style',
  kid_situation: 'Family',
  primary_goal: 'Main goal',
}

export function PersonaDetails() {
  const account = useAuthStore((s) => s.account)
  const updateAccount = useAuthStore((s) => s.updateAccount)
  const role: 'parent' | 'kid' = account?.accountType === 'kid' ? 'kid' : 'parent'
  const persona = (account?.persona ?? {}) as Record<string, unknown>
  const plan = planFor(role).filter((q) => q.key !== 'name')

  const [editing, setEditing] = useState<Question | null>(null)
  const [saving, setSaving] = useState(false)

  function valueLabel(q: Question): string | null {
    const v = persona[q.key] as string | string[] | undefined
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return null
    try { return q.summarise(v) } catch { return String(v) }
  }

  async function save(q: Question, value: string | string[]) {
    setSaving(true)
    try {
      const next = { ...persona, [q.key]: value }
      const res = await api<{ account: NonNullable<typeof account> }>('/me', { method: 'PATCH', body: JSON.stringify({ persona: next }) })
      updateAccount(res.account)
    } catch { /* keep prior value */ } finally {
      setSaving(false)
      setEditing(null)
    }
  }

  return (
    <>
      <section className="mt-6">
        <h3 className="pv-label mb-2">{role === 'kid' ? 'About you' : 'About your family'}</h3>
        <div className="pv-card-flat overflow-hidden p-0">
          {plan.map((q, i) => {
            const val = valueLabel(q)
            return (
              <button
                key={q.key}
                onClick={() => setEditing(q)}
                className="pv-press flex w-full items-center gap-3 px-4 py-3.5 text-left"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--pv-line)' }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--pv-ink)' }}>{LABELS[q.key] ?? q.key}</span>
                  <span className="block truncate text-xs font-semibold" style={{ color: val ? 'var(--pv-ink-3)' : 'var(--pv-accent)' }}>{val ?? 'Add'}</span>
                </span>
                <ChevronRight size={16} style={{ color: 'var(--pv-ink-3)' }} />
              </button>
            )
          })}
        </div>
      </section>

      {editing && (
        <EditSheet
          q={editing}
          current={persona[editing.key] as string | string[] | undefined}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </>
  )
}

function EditSheet({
  q,
  current,
  saving,
  onClose,
  onSave,
}: {
  q: Question
  current?: string | string[]
  saving: boolean
  onClose: () => void
  onSave: (q: Question, value: string | string[]) => void
}) {
  const [text, setText] = useState(typeof current === 'string' ? current : '')
  const [multi, setMulti] = useState<string[]>(Array.isArray(current) ? current : [])
  const single = typeof current === 'string' ? current : ''

  const footer =
    q.kind === 'text' ? (
      <Button full disabled={!text.trim() || saving} onClick={() => onSave(q, text.trim())}>Save</Button>
    ) : q.kind === 'multi' ? (
      <Button full disabled={multi.length === 0 || saving} onClick={() => onSave(q, multi)}>Save{multi.length ? ` · ${multi.length}` : ''}</Button>
    ) : undefined

  return (
    <BottomSheet title={LABELS[q.key] ?? q.key} subtitle={q.prompt} onClose={onClose} footer={footer}>
      {q.kind === 'text' && (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={q.placeholder ?? 'Type your answer…'}
          maxLength={40}
          className="h-14 w-full rounded-2xl px-4 text-[0.95rem] font-semibold outline-none"
          style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}
        />
      )}

      {q.kind === 'single' && (
        <div className="flex flex-wrap gap-2 pb-2">
          {(q.options ?? []).map((o: Choice) => {
            const active = o.id === single
            return (
              <button
                key={o.id}
                onClick={() => onSave(q, o.id)}
                disabled={saving}
                className={`pv-press flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-bold ${active ? '' : 'pv-glass pv-hairline'}`}
                style={active ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { color: 'var(--pv-ink)' }}
              >
                <o.Icon size={16} strokeWidth={2.2} />
                <span className="text-left">
                  {o.label}
                  {o.sub && <span className="block text-[10px] font-medium opacity-70">{o.sub}</span>}
                </span>
                {active && <Check size={15} strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      )}

      {q.kind === 'multi' && (
        <div className="flex flex-wrap gap-2 pb-2">
          {(q.options ?? []).map((o: Choice) => {
            const active = multi.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => setMulti((m) => (m.includes(o.id) ? m.filter((x) => x !== o.id) : [...m, o.id]))}
                className={`pv-press flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-bold ${active ? '' : 'pv-glass pv-hairline'}`}
                style={active ? { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' } : { color: 'var(--pv-ink)' }}
              >
                <o.Icon size={16} strokeWidth={2.2} />
                {o.label}
                {active && <Check size={15} strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
