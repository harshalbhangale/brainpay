/**
 * Onboarding (new) — the first-run experience:
 *   1. FeatureIntro     — a "Meet BrainPal" card deck (role-specific).
 *   2. CompanionPicker  — choose your companion character + voice.
 *   3. NameCard         — type your name, watch it print on a BrainPal card.
 *   4. VoiceOnboarding  — your chosen companion interviews you by voice and
 *                         fills the persona (save_persona). "Type instead"
 *                         falls back to:
 *   5. PersonaChat      — the tap-based persona builder.
 * The name captured at step 3 is threaded into 4 & 5 so it's never re-asked.
 * Persistence happens inside VoiceOnboarding / PersonaChat (PATCH /me), then
 * onDone fires.
 */
import { useState } from 'react'
import { FeatureIntro } from './FeatureIntro'
import { CompanionPicker } from './CompanionPicker'
import { NameCard } from './NameCard'
import { VoiceOnboarding } from './VoiceOnboarding'
import { PersonaChat } from './PersonaChat'

export function Onboarding({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const [stage, setStage] = useState<'intro' | 'choose' | 'name' | 'voice' | 'persona'>('intro')
  const [name, setName] = useState('')

  if (stage === 'intro') {
    return <FeatureIntro role={role} onDone={() => setStage('choose')} />
  }
  if (stage === 'choose') {
    return <CompanionPicker role={role} onDone={() => setStage('name')} />
  }
  if (stage === 'name') {
    return <NameCard role={role} onDone={(n) => { setName(n); setStage('voice') }} />
  }
  if (stage === 'voice') {
    return <VoiceOnboarding role={role} name={name} onDone={onDone} onTypeInstead={() => setStage('persona')} />
  }
  return <PersonaChat role={role} initialName={name} onDone={onDone} />
}
