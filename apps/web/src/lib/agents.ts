import { Sparkles, Wallet, Apple, GraduationCap, type LucideIcon } from 'lucide-react'

/**
 * BrainPal agent roster.
 *
 * PAL is the orchestrator the user talks to; the three specialists chime in
 * when a topic is in their lane. Each has a distinct identity (icon, accent
 * colour, gradient) so the chat reads as a genuine multi-agent council.
 */

export type AgentId = 'pal' | 'moneypal' | 'healthpal' | 'studypal'

export type Agent = {
  id: AgentId
  name: string
  Icon: LucideIcon
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
    Icon: Sparkles,
    color: '#12b76a',
    gradient: ['#2bd98a', '#0f9d58'],
    blurb: 'Your money mentor',
  },
  moneypal: {
    id: 'moneypal',
    name: 'MoneyPAL',
    Icon: Wallet,
    color: '#f59e0b',
    gradient: ['#fbbf24', '#e08600'],
    blurb: 'Spending & saving',
  },
  healthpal: {
    id: 'healthpal',
    name: 'HealthPAL',
    Icon: Apple,
    color: '#12b76a',
    gradient: ['#34d399', '#0f9d58'],
    blurb: 'Food & wellbeing',
  },
  studypal: {
    id: 'studypal',
    name: 'StudyPAL',
    Icon: GraduationCap,
    color: '#6aa3ff',
    gradient: ['#8fc0ff', '#3f74e0'],
    blurb: 'Homework & learning',
  },
}

export const SPECIALISTS: Agent[] = [AGENTS.moneypal, AGENTS.healthpal, AGENTS.studypal]

export function agentFor(id: string | undefined | null): Agent {
  return (id && (AGENTS as Record<string, Agent>)[id]) || AGENTS.pal
}
