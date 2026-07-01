/**
 * PalSurface — the one avatar-first surface, driven by a single PalKey.
 * ───────────────────────────────────────────────────────────────────────────
 * This is the conversational home: one screen that shows the chosen Pal's
 * character (the reused `<Companion>` avatar via `PalHero`, rendered by `Chat`'s
 * empty state), talks to the real multi-agent backend (`/chat`), and opens the
 * live voice/camera session (`LiveSession`) — all from one composer. Switching
 * character is a single tap that re-points the `.pv` accent and floods the new
 * color in via `PalPicker`.
 *
 * First run: if the user has never picked a Pal, the picker opens automatically
 * as a lightweight onboarding step ("who do you want to talk to?").
 */
import { useEffect, useState } from 'react'
import { useAvatar } from '../../lib/avatar'
import { Chat } from '../screens/Chat'
import { StudyPal } from './StudyPal'
import { MoneyChat } from './MoneyChat'
import { PalPicker } from './PalPicker'
import { palAvatar } from './palCharacters'
import { usePalSelection } from './usePalSelection'

export function PalSurface() {
  const pal = usePalSelection((s) => s.pal)
  const chosen = usePalSelection((s) => s.chosen)
  const setPal = usePalSelection((s) => s.setPal)
  const setAvatar = useAvatar((s) => s.setAvatar)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Keep the live voice/camera session's companion in sync with the chosen
  // character, so "talk to your Pal" shows the same face as the surface.
  useEffect(() => { setAvatar(palAvatar(pal)) }, [pal, setAvatar])

  // One-time onboarding: greet with the picker until a Pal is chosen.
  useEffect(() => {
    if (!chosen) setPickerOpen(true)
  }, [chosen])

  const openPicker = () => setPickerOpen(true)

  return (
    <div data-pal={pal} className="pv pv-pal-enter flex min-h-0 flex-1 flex-col">
      {pal === 'studypal'
        ? <StudyPal onSwitchPal={openPicker} />
        : pal === 'moneypal'
          ? <MoneyChat onSwitchPal={openPicker} />
          : <Chat pal={pal} onSwitchPal={openPicker} />}
      {pickerOpen && (
        <PalPicker
          current={pal}
          title={chosen ? 'Who do you want to talk to?' : 'Pick your Pal to begin'}
          onSelect={(p) => { setPal(p); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
