/**
 * Onboarding (new) — the first-run experience:
 *   1. FeatureIntro     — a "Meet BrainPal" card deck (role-specific).
 *   2. CompanionPicker  — choose your companion character + voice (hear each).
 *   3. NameCard         — type your name, watch it print on a BrainPal card.
 *   4. VoiceOnboarding  — your chosen companion interviews you by voice and
 *                         fills the persona (save_persona), then completes.
 * The name captured at step 3 is threaded into step 4 so it's never re-asked.
 */
import { useState } from 'react'
import { FeatureIntro } from './FeatureIntro'
import { CompanionPicker } from './CompanionPicker'
import { NameCard } from './NameCard'
import { VoiceOnboarding } from './VoiceOnboarding'

export function Onboarding({ role, onDone }: { role: 'parent' | 'kid'; onDone: () => void }) {
  const [stage, setStage] = useState<'intro' | 'choose' | 'name' | 'voice'>('intro')
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
  return <VoiceOnboarding role={role} name={name} onDone={onDone} />
}
