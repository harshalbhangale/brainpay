import { Home, CreditCard, ListChecks, Receipt, type LucideIcon } from 'lucide-react'
import type { FamilyTab } from './types'

const TABS: { id: FamilyTab; Icon: LucideIcon; label: string }[] = [
  { id: 'overview', Icon: Home, label: 'Overview' },
  { id: 'card', Icon: CreditCard, label: 'Card' },
  { id: 'chores', Icon: ListChecks, label: 'Chores' },
  { id: 'activity', Icon: Receipt, label: 'Activity' },
]

export function BottomBar({ tab, onTab }: { tab: FamilyTab; onTab: (t: FamilyTab) => void }) {
  return (
    <nav
      className="glass flex shrink-0 border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className="press flex flex-1 flex-col items-center gap-1 py-2.5"
          >
            <span
              className="flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300"
              style={{ backgroundImage: active ? 'var(--grad-accent-bright)' : undefined, boxShadow: active ? 'var(--glow-accent)' : undefined }}
            >
              <t.Icon
                size={20}
                strokeWidth={active ? 2.6 : 2}
                style={{ color: active ? 'var(--on-accent)' : 'var(--muted)' }}
              />
            </span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
