/**
 * Onboarding (new) — the first-run experience:
 *   1. FeatureIntro     — a "Meet BrainPal" card deck (role-specific).
 *   2. CompanionPicker  — choose your companion character + voice.
 *   3. VoiceOnboarding  — your chosen companion interviews you by voice and
 *                         fills the persona (save_persona). "Type instead"
 *                         falls back to:
 *   4. PersonaChat      — the tap-based persona builder.
 * Persistence happens inside VoiceOnboarding / PersonaChat (PATCH /me), then
 * onDone fires.
 */
import { useState } from 'react'
import { FeatureIntro } from './FeatureIntro'
import { CompanionPicker } from './CompanionPicker'
import { VoiceOnboarding } from './VoiceOnboarding'
import { PersonaChat } from './PersonaChat'

export function Onboarding({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const [stage, setStage] = useState<'intro' | 'choose' | 'voice' | 'persona'>('intro')

  if (stage === 'intro') {
    return <FeatureIntro role={role} onDone={() => setStage('choose')} />
  }
  if (stage === 'choose') {
    return <CompanionPicker role={role} onDone={() => setStage('voice')} />
  }
  if (stage === 'voice') {
    return <VoiceOnboarding role={role} onDone={onDone} onTypeInstead={() => setStage('persona')} />
  }
  return <PersonaChat role={role} onDone={onDone} />
}
