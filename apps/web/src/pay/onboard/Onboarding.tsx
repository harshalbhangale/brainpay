/**
 * Onboarding (new) — the first-run experience:
 *   1. FeatureIntro    — a "Meet BrainPal" card deck (role-specific).
 *   2. CompanionPicker — choose your companion character + voice.
 *   3. PersonaChat     — build the persona in chat while an orb evolves.
 * Persistence happens inside PersonaChat (PATCH /me), then onDone fires.
 */
import { useState } from 'react'
import { FeatureIntro } from './FeatureIntro'
import { CompanionPicker } from './CompanionPicker'
import { PersonaChat } from './PersonaChat'

export function Onboarding({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const [stage, setStage] = useState<'intro' | 'choose' | 'persona'>('intro')

  if (stage === 'intro') {
    return <FeatureIntro role={role} onDone={() => setStage('choose')} />
  }
  if (stage === 'choose') {
    return <CompanionPicker role={role} onDone={() => setStage('persona')} />
  }
  return <PersonaChat role={role} onDone={onDone} />
}
