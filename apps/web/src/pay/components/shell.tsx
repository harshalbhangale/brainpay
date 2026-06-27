/**
 * MoneyPal app shell.
 * ───────────────────────────────────────────────────────────────────────────
 *  PhoneCanvas  centered, app-width column on an ambient light backdrop
 *               (mirrors the product mock; scales up gracefully on desktop)
 *  TopBar       greeting / title row with leading + trailing slots
 *  BottomNav    floating glass tab bar with a center action
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { PressButton } from './primitives'

export type TabKey = 'home' | 'family' | 'chores' | 'activity' | 'cards' | 'map'

/* ─────────────────────────────────────────────────────────────── PhoneCanvas */
export function PhoneCanvas({ children, pal }: { children: ReactNode; pal?: string }) {
  return (
    <div
      data-pal={pal}
      className="pv pv-aurora relative flex min-h-[100dvh] w-full justify-center"
      style={{
        background:
          'radial-gradient(900px 520px at 12% -8%, var(--pv-accent-soft), transparent 60%),' +
          'linear-gradient(180deg, var(--pv-bg) 0%, var(--pv-bg-2) 100%)',
      }}
    >
      {/* App-width column. Reads as a phone on desktop, full-bleed on mobile. */}
      <div
        className="relative flex min-h-[100dvh] w-full max-w-[460px] flex-col"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        {children}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────── TopBar */
export function TopBar({ leading, trailing }: { leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pb-2 pt-4">
      <div className="flex items-center gap-3">{leading}</div>
      <div className="flex items-center gap-2.5">{trailing}</div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────── BottomNav */
export function BottomNav({
  active,
  onChange,
  onCenter,
  tabs,
  centerIcon: CenterIcon,
}: {
  active: TabKey
  onChange: (t: TabKey) => void
  onCenter: () => void
  tabs: { key: TabKey; label: string; Icon: LucideIcon }[]
  centerIcon: LucideIcon
}) {
  const left = tabs.slice(0, 2)
  const right = tabs.slice(2)
  return (
    <div className="pointer-events-none sticky bottom-0 z-30 flex justify-center px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
      <nav
        className="pointer-events-auto flex items-center gap-1 rounded-full p-1.5"
        style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: 'var(--pv-shadow-lg)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}
      >
        {left.map((t) => (
          <NavItem key={t.key} Icon={t.Icon} label={t.label} active={active === t.key} onClick={() => onChange(t.key)} />
        ))}

        <PressButton
          spring="lg"
          onClick={onCenter}
          ariaLabel="New payment"
          style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' }}
          className="pv-sheen mx-0.5 flex h-12 w-12 items-center justify-center rounded-full"
        >
          <CenterIcon size={24} strokeWidth={2.6} />
        </PressButton>

        {right.map((t) => (
          <NavItem key={t.key} Icon={t.Icon} label={t.label} active={active === t.key} onClick={() => onChange(t.key)} />
        ))}
      </nav>
    </div>
  )
}

function NavItem({ Icon, label, active, onClick }: { Icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <PressButton
      onClick={onClick}
      ariaLabel={label}
      className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-full px-4"
      style={{ color: active ? 'var(--pv-ink)' : 'var(--pv-ink-3)' }}
    >
      <Icon size={21} strokeWidth={active ? 2.6 : 2.2} />
      <span className="text-[0.625rem] font-bold tracking-tight">{label}</span>
    </PressButton>
  )
}
