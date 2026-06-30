/**
 * Canvas — the summoned slide-over surface for heavy views.
 * ───────────────────────────────────────────────────────────────────────────
 * Chat-first: the ledger, family map and family management are no longer tabs —
 * they slide over the chat on demand (a chat card tap or PAL intent), then
 * dismiss. `Canvas` is the reusable shell (a slim back bar + the reused screen
 * underneath, which keeps its own header/actions). `CanvasHost` reads the
 * canvasStore and renders the right surface; sheets (top-up, card, chore)
 * portal themselves and ride the same switch.
 */
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronLeft } from 'lucide-react'
import { useCanvas } from '../lib/canvasStore'
import { Activity } from '../screens/Activity'
import { FamilyMap } from '../screens/FamilyMap'
import { Family } from '../screens/Family'
import { CardSheet } from '../screens/Card'
import { TopUpSheet } from '../screens/TopUpSheet'
import { ChorePickerSheet } from '../chores/verify'
import { StudyPal } from '../pals/StudyPal'

/* ── Slide-over shell ───────────────────────────────────────────────────── */
export function Canvas({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="pv fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(11,12,15,0.32)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col"
        style={{ background: 'var(--pv-bg)', boxShadow: 'var(--pv-shadow-lg)' }}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <div
          className="flex flex-none items-center gap-2 px-4 pb-2"
          style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
        >
          <button
            onClick={onClose}
            aria-label="Back to chat"
            className="pv-press flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)', color: 'var(--pv-ink-2)' }}
          >
            <ChevronLeft size={20} />
          </button>
          <span className="pv-label">{title}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </motion.div>
    </div>,
    document.body,
  )
}

/* ── Host: one switch, mounted once at the shell ────────────────────────── */
export function CanvasHost() {
  const kind = useCanvas((s) => s.kind)
  const param = useCanvas((s) => s.param)
  const close = useCanvas((s) => s.close)

  // Sheets portal + animate themselves; just mount them on the matching kind.
  if (kind === 'topup') return <TopUpSheet presetKidId={param} onClose={close} />
  if (kind === 'card') return <CardSheet onClose={close} />
  if (kind === 'chore') return <ChorePickerSheet onClose={close} />

  return (
    <AnimatePresence>
      {kind === 'activity' && (
        <Canvas key="activity" title="Activity" onClose={close}><Activity /></Canvas>
      )}
      {kind === 'map' && (
        <Canvas key="map" title="Family map" onClose={close}><FamilyMap /></Canvas>
      )}
      {kind === 'family' && (
        <Canvas key="family" title="Family" onClose={close}><Family /></Canvas>
      )}
      {kind === 'study' && (
        <Canvas key="study" title="StudyPal" onClose={close}><StudyPal /></Canvas>
      )}
    </AnimatePresence>
  )
}
