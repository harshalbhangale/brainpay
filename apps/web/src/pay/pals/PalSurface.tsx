/**
 * PalSurface — the conversational chat surface (the "Chat" section).
 * ───────────────────────────────────────────────────────────────────────────
 * Chat is for the two *conversational* Pals — BrainPal AI (Kirra) and MoneyPal
 * (Mika). StudyPal is NOT a chat pal: it owns the dedicated "Study" section, so
 * it never renders inside chat (that only duplicated the Study tab and left
 * parents — who have no Money tab — stranded on a study portal).
 *
 * Picking StudyPal from the radial picker therefore navigates to the Study
 * section instead of embedding it here. Switching character is a single tap
 * that re-points the `.pv` accent and floods the new colour in via `PalPicker`.
 *
 * First run: if the user has never picked a Pal, the picker opens automatically
 * as a lightweight onboarding step ("who do you want to talk to?").
 */
import { useEffect, useState } from 'react'
import { useAvatar } from '../../lib/avatar'
import { BrainChat } from './BrainChat'
import { MoneyChat } from './MoneyChat'
import { PalPicker } from './PalPicker'
import { palAvatar } from './palCharacters'
import { usePalAvatars } from './usePalAvatars'
import { usePalSelection } from './usePalSelection'
import { useNav } from '../lib/useNav'
import type { PalKey } from './config'

export function PalSurface() {
  const pal = usePalSelection((s) => s.pal)
  const chosen = usePalSelection((s) => s.chosen)
  const setPal = usePalSelection((s) => s.setPal)
  const setAvatar = useAvatar((s) => s.setAvatar)
  const setSection = useNav((s) => s.setSection)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Chat is conversational-only. Any non-money selection (incl. a stale
  // persisted 'studypal') falls back to BrainPal AI so Chat is never a study
  // portal.
  const chatPal: PalKey = pal === 'moneypal' ? 'moneypal' : 'ai'

  // Keep the live voice/camera session's companion in sync with the shown pal.
  const palAvatarId = usePalAvatars((s) => s.avatars[chatPal])
  useEffect(() => { setAvatar(palAvatarId ?? palAvatar(chatPal)) }, [chatPal, palAvatarId, setAvatar])

  // One-time onboarding: greet with the picker until a Pal is chosen.
  useEffect(() => {
    if (!chosen) setPickerOpen(true)
  }, [chosen])

  const openPicker = () => setPickerOpen(true)

  function choose(p: PalKey) {
    setPickerOpen(false)
    if (p === 'studypal') {
      // StudyPal has its own home — seed a conversational default for Chat and
      // jump to the dedicated Study section rather than embedding it here.
      setPal(chatPal)
      setSection('study')
      return
    }
    setPal(p)
  }

  return (
    <div data-pal={chatPal} className="pv pv-pal-enter flex min-h-0 flex-1 flex-col">
      {chatPal === 'moneypal'
        ? <MoneyChat onSwitchPal={openPicker} />
        : <BrainChat onSwitchPal={openPicker} />}
      {pickerOpen && (
        <PalPicker
          current={pal}
          title={chosen ? 'Who do you want to talk to?' : 'Pick your Pal to begin'}
          onSelect={choose}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
