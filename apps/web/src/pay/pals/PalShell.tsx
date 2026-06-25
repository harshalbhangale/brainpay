/**
 * PalShell — the authenticated home: the animated Pal switcher.
 * ───────────────────────────────────────────────────────────────────────────
 * A slim Pal rail at the top switches between MoneyPal / StudyPal / HealthPal /
 * ParentPal. Switching plays a circular color flood in the incoming Pal's accent,
 * re-points the whole `.pv` theme underneath, and rises the new Pal into place.
 */
import { useCallback, useState } from 'react'
import { useLocationReporter } from '../../lib/useLocationReporter'
import { useAuthStore } from '../../stores/auth'
import { PhoneCanvas } from '../components/shell'
import { PALS, PAL_MAP, type PalKey } from './config'
import { AIPal } from './AIPal'
import { MoneyPal } from './MoneyPal'
import { StudyPal } from './StudyPal'

type Reveal = { key: PalKey; x: number; y: number; leaving: boolean }

export function PalShell() {
  const [pal, setPal] = useState<PalKey>('ai')
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const account = useAuthStore((s) => s.account)

  // Kids report their device location so parents see them on the family maps.
  useLocationReporter(account?.accountType === 'kid')

  function switchPal(next: PalKey, e: React.MouseEvent) {
    if (next === pal || reveal) return
    const x = (e.clientX / window.innerWidth) * 100
    const y = (e.clientY / window.innerHeight) * 100
    setReveal({ key: next, x, y, leaving: false })
    window.setTimeout(() => setPal(next), 330)
    window.setTimeout(() => setReveal((r) => (r ? { ...r, leaving: true } : null)), 390)
    window.setTimeout(() => setReveal(null), 730)
  }

  // Programmatic switch (e.g. an "Ask AI" shortcut inside MoneyPal) without a
  // pointer event — flood from the top-center where the Pal rail lives.
  const goPal = useCallback(
    (next: PalKey) => {
      setPal((cur) => {
        if (next === cur) return cur
        setReveal({ key: next, x: 50, y: 6, leaving: false })
        window.setTimeout(() => setPal(next), 330)
        window.setTimeout(() => setReveal((r) => (r ? { ...r, leaving: true } : null)), 390)
        window.setTimeout(() => setReveal(null), 730)
        return cur
      })
    },
    [],
  )

  return (
    <PhoneCanvas pal={pal}>
      <PalRail active={pal} onSwitch={switchPal} />

      {pal === 'ai' && <AIPal />}
      {pal === 'moneypal' && <MoneyPal goPal={goPal} />}
      {pal === 'studypal' && <StudyPal />}

      {reveal && <PalReveal reveal={reveal} />}
    </PhoneCanvas>
  )
}

/* ───────────────────────────────────────────────────────────────── Pal rail */
function PalRail({ active, onSwitch }: { active: PalKey; onSwitch: (k: PalKey, e: React.MouseEvent) => void }) {
  return (
    <div className="flex justify-center px-4 pb-1 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <div
        className="pv-no-scrollbar flex items-center gap-1 rounded-full p-1.5"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: 'var(--pv-shadow-sm)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}
      >
        {PALS.map((p) => {
          const on = p.key === active
          return (
            <button
              key={p.key}
              onClick={(e) => onSwitch(p.key, e)}
              aria-label={p.name}
              aria-pressed={on}
              className="pv-pal-chip flex items-center gap-1.5 rounded-full px-3 py-2 text-[0.8125rem] font-extrabold tracking-tight"
              style={on ? { background: p.accent, color: p.onAccent, boxShadow: 'var(--pv-shadow-sm)' } : { color: 'var(--pv-ink-3)' }}
            >
              <p.Icon size={17} strokeWidth={2.5} />
              <span>{p.short}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── Animated switch flood */
function PalReveal({ reveal }: { reveal: Reveal }) {
  const d = PAL_MAP[reveal.key]
  const Icon = d.Icon
  return (
    <div
      className="pv-reveal"
      data-leaving={reveal.leaving ? 'true' : undefined}
      style={{
        ['--px' as string]: `${reveal.x}%`,
        ['--py' as string]: `${reveal.y}%`,
        backgroundImage: d.gradient,
      }}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4" style={{ color: d.onAccent }}>
        <div className="pv-pal-badge flex h-24 w-24 items-center justify-center rounded-[30px]" style={{ background: 'rgba(255,255,255,0.18)' }}>
          <Icon size={50} strokeWidth={2} />
        </div>
        <div className="pv-pal-badge text-[1.7rem] font-extrabold tracking-tight">{d.name}</div>
      </div>
    </div>
  )
}
