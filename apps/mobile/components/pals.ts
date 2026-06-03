/** The BrainPal council. BrainPal orchestrates; specialists collaborate. */
export type PalId = 'brainpal' | 'moneypal' | 'healthpal' | 'studypal'

export type Pal = {
  id: PalId
  name: string
  emoji: string
  color: string
  blurb: string
}

export const PALS: Record<PalId, Pal> = {
  brainpal: { id: 'brainpal', name: 'BrainPal', emoji: '🧠', color: '#0E7C66', blurb: 'Your family guide' },
  moneypal: { id: 'moneypal', name: 'MoneyPal', emoji: '💰', color: '#23C08A', blurb: 'Money manager' },
  healthpal: { id: 'healthpal', name: 'HealthPal', emoji: '🍎', color: '#FF5FA2', blurb: 'Health coach' },
  studypal: { id: 'studypal', name: 'StudyPal', emoji: '📚', color: '#7B61FF', blurb: 'Study buddy' },
}

export const PAL_LIST: Pal[] = Object.values(PALS)

export function getPal(id: string): Pal {
  return PALS[id as PalId] ?? PALS.brainpal
}
