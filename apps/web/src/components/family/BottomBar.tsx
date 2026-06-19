import type { FamilyTab } from './types'

const TABS: { id: FamilyTab; icon: string; label: string }[] = [
  { id: 'overview', icon: '🏠', label: 'Overview' },
  { id: 'card', icon: '💳', label: 'Card' },
  { id: 'chores', icon: '✅', label: 'Chores' },
  { id: 'activity', icon: '🧾', label: 'Activity' },
]

export function BottomBar({ tab, onTab }: { tab: FamilyTab; onTab: (t: FamilyTab) => void }) {
  return (
    <nav
      className="flex shrink-0 border-t border-surface2 bg-canvas"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
          >
            <span className={`text-xl transition ${active ? '' : 'opacity-50 grayscale'}`}>{t.icon}</span>
            <span className={`text-[11px] font-semibold ${active ? 'text-accent' : 'text-muted'}`}>
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
