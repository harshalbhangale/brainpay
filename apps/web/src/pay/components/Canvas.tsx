/**
 * SheetHost — mounts the true modal overlays (top-up, card, chore picker).
 * ───────────────────────────────────────────────────────────────────────────
 * Full views (activity, family, map, study, chores) now own the main pane via
 * useNav, so they are no longer slide-overs. Only these portaled sheets overlay
 * the app. Mounted once at the shell.
 */
import { useCanvas } from '../lib/canvasStore'
import { CardSheet } from '../screens/Card'
import { TopUpSheet } from '../screens/TopUpSheet'
import { ChorePickerSheet } from '../chores/verify'

export function SheetHost() {
  const kind = useCanvas((s) => s.kind)
  const param = useCanvas((s) => s.param)
  const close = useCanvas((s) => s.close)

  if (kind === 'topup') return <TopUpSheet presetKidId={param} onClose={close} />
  if (kind === 'card') return <CardSheet onClose={close} />
  if (kind === 'chore') return <ChorePickerSheet onClose={close} />
  return null
}
