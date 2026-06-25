/**
 * Pal registry — the three BrainPal sections, each with a signature accent.
 * ───────────────────────────────────────────────────────────────────────────
 * AI is the orchestrator the user talks to (the multi-agent council + live
 * camera); MoneyPal is the family bank; StudyPal is learning. The accent /
 * gradient values mirror the per-Pal palettes in theme.css (`.pv[data-pal='…']`).
 * Keeping them here too lets the animated switch (the circular color flood)
 * paint with the *incoming* Pal's color before the `.pv` root re-points its CSS
 * variables underneath.
 */
import type { LucideIcon } from 'lucide-react'
import { Sparkles, Wallet, GraduationCap } from 'lucide-react'

export type PalKey = 'ai' | 'moneypal' | 'studypal'

export type PalDef = {
  key: PalKey
  name: string
  short: string
  tagline: string
  Icon: LucideIcon
  /** Solid signature accent (matches --pv-accent for this Pal). */
  accent: string
  /** Gradient used by the switch flood + hero fills. */
  gradient: string
  /** Readable text color on the accent/gradient. */
  onAccent: string
}

export const PALS: PalDef[] = [
  {
    key: 'ai',
    name: 'BrainPal AI',
    short: 'AI',
    tagline: 'Ask anything — your money council',
    Icon: Sparkles,
    accent: '#19c37d',
    gradient: 'linear-gradient(150deg, #34e89e 0%, #0f9d58 100%)',
    onAccent: '#04130c',
  },
  {
    key: 'moneypal',
    name: 'MoneyPal',
    short: 'Money',
    tagline: 'Grow, save & spend together',
    Icon: Wallet,
    accent: '#c5f441',
    gradient: 'linear-gradient(150deg, #d4fb5b 0%, #b4ec2a 100%)',
    onAccent: '#0b0c0f',
  },
  {
    key: 'studypal',
    name: 'StudyPal',
    short: 'Study',
    tagline: 'Learn, revise & level up',
    Icon: GraduationCap,
    accent: '#8b7cff',
    gradient: 'linear-gradient(150deg, #a99bff 0%, #6f5cf0 100%)',
    onAccent: '#ffffff',
  },
]

export const PAL_MAP: Record<PalKey, PalDef> = Object.fromEntries(
  PALS.map((p) => [p.key, p]),
) as Record<PalKey, PalDef>
