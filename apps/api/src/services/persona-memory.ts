import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { familyRules, memoryFacts } from '../db/schema'
import { logger } from '../logger'

/**
 * Persona → memory seeding (Agent Foundation, Requirement 4/8/9 + persona seeding).
 *
 * Onboarding answers are facts the user STATED directly, so personal facts are
 * written `confirmed` (self-confirmed). Parent goals about the household are
 * written as `proposed` family_rules — the parent confirms them later in the
 * dashboard before any agent enforces them.
 *
 * Idempotent: clears prior onboarding-sourced facts for the account first.
 */

// persona keys that become stable personal memory (per role)
const PERSONAL_KEYS: Record<'parent' | 'kid', string[]> = {
  parent: ['name', 'parenting_style', 'style', 'primary_goal', 'money_value', 'concern', 'money_upbringing', 'kid_situation'],
  kid: ['name', 'age', 'voiceId', 'saving_for', 'loves'],
}

// parent primary_goal → a proposed family rule
function ruleFromGoal(goal: unknown): { kind: string; value: Record<string, unknown> } | null {
  switch (goal) {
    case 'food':
      return { kind: 'sugar_limit_g', value: { grams: 25 } }
    case 'save':
    case 'impulse':
      return { kind: 'savings_bias', value: { goal } }
    default:
      return null
  }
}

export async function seedPersonaMemory(opts: {
  accountId: string
  familyId: string | null
  role: 'parent' | 'kid'
  persona: Record<string, unknown>
}): Promise<void> {
  const { accountId, familyId, role, persona } = opts

  // Clear prior onboarding facts for this account (clean re-onboard).
  await db
    .delete(memoryFacts)
    .where(and(eq(memoryFacts.accountId, accountId), eq(memoryFacts.source, 'onboarding')))

  const facts = PERSONAL_KEYS[role]
    .filter((k) => persona[k] !== undefined && persona[k] !== null && persona[k] !== '')
    .map((k) => ({
      familyId,
      accountId,
      layer: 'personal' as const,
      key: k,
      value: { v: persona[k] },
      source: 'onboarding',
      status: 'confirmed' as const,
      confirmedBy: accountId,
      confirmedAt: new Date(),
    }))

  if (facts.length > 0) await db.insert(memoryFacts).values(facts)

  // Parent goal → proposed family rule (only with a family).
  if (role === 'parent' && familyId) {
    const rule = ruleFromGoal(persona.primary_goal)
    if (rule) {
      await db.insert(familyRules).values({
        familyId,
        kind: rule.kind,
        value: rule.value,
        status: 'proposed',
        createdBy: accountId,
      })
    }
  }

  logger.info({ accountId, role, facts: facts.length }, 'persona.memory_seeded')
}
