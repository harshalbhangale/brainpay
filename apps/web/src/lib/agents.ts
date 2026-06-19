/**
 * BrainPal agent roster.
 *
 * PAL is the orchestrator the user talks to; the three specialists chime in
 * when a topic is in their lane. Each has a distinct identity (emoji, accent
 * colour, gradient) so the chat reads as a genuine multi-agent council rather
 * than one generic assistant.
 */

export type AgentId = 'pal' | 'moneypal' | 'healthpal' | 'studypal'

export type Agent = {
  id: AgentId
  name: string
  emoji: string
  /** Solid accent (text, rings). */
  color: string
  /** Two-stop gradient for the avatar. */
  gradient: [string, string]
  blurb: string
}

export const AGENTS: Record<AgentId, Agent> = {
  pal: {
    id: 'pal',
    name: 'PAL',
    emoji: '✨',
    color: '#3ddc84',
    gradient: ['#3ddc84', '#16a07f'],
    blurb: 'Your money mentor',
  },
  moneypal: {
    id: 'moneypal',
    name: 'MoneyPAL',
    emoji: '💰',
    color: '#ffb627',
    gradient: ['#ffd152', '#f0920a'],
    blurb: 'Spending & saving',
  },
  healthpal: {
    id: 'healthpal',
    name: 'HealthPAL',
    emoji: '🥦',
    color: '#3ddc84',
    gradient: ['#5ef0a0', '#179f6b'],
    blurb: 'Food & wellbeing',
  },
  studypal: {
    id: 'studypal',
    name: 'StudyPAL',
    emoji: '📚',
    color: '#6aa3ff',
    gradient: ['#8fc0ff', '#3f74e0'],
    blurb: 'Homework & learning',
  },
}

export const SPECIALISTS: Agent[] = [AGENTS.moneypal, AGENTS.healthpal, AGENTS.studypal]

export function agentFor(id: string | undefined | null): Agent {
  return (id && (AGENTS as Record<string, Agent>)[id]) || AGENTS.pal
}
