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
      className="flex shrink-0 border-t border-border bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 transition active:scale-95"
          >
            <span
              className="flex h-8 w-12 items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent' }}
            >
              <t.Icon
                size={20}
                strokeWidth={active ? 2.6 : 2}
                style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
              />
            </span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
