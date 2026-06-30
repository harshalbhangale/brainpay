import { llm } from './llm'
import { logger } from '../logger'
import type { PalContext } from './pal-context'

/**
 * PAL Intent Parser — detects actionable intents in a user message.
 *
 * When PAL detects an action (add chore, top up, set goal), it returns
 * a structured intent object instead of just a text reply. The mobile
 * client shows a preview card and the user confirms before execution.
 *
 * Intents that require confirmation:
 *   add_chore    — parent creates a chore for a kid
 *   topup        — parent tops up a kid's wallet
 *   set_goal     — set a savings goal for a kid
 *
 * Intents that execute immediately (no confirmation):
 *   query        — just a question, no action needed
 */

export type IntentKind = 'add_chore' | 'topup' | 'set_goal' | 'contribute_goal' | 'send_note' | 'create_rule' | 'remember' | 'verify_chore' | 'query'

export type AddChoreIntent = {
  kind: 'add_chore'
  kidName: string
  kidAccountId?: string
  title: string
  rewardBrains: number
}

export type TopupIntent = {
  kind: 'topup'
  kidName: string
  kidAccountId?: string
  brainsDelta: number
  note?: string
}

export type SetGoalIntent = {
  kind: 'set_goal'
  kidName: string
  kidAccountId?: string
  goalName: string
  targetBrains: number
}

export type ContributeGoalIntent = {
  kind: 'contribute_goal'
  kidName: string
  kidAccountId?: string
  goalName?: string
  brainsDelta: number
}

export type SendNoteIntent = {
  kind: 'send_note'
  kidName: string
  kidAccountId?: string
  message: string
}

export type CreateRuleIntent = {
  kind: 'create_rule'
  ruleText: string
}

export type RememberIntent = {
  kind: 'remember'
  fact: string
  kidName?: string
  kidAccountId?: string
}

export type VerifyChoreIntent = {
  kind: 'verify_chore'
  /** The chore the kid claims to have done, if named (e.g. "the dishes"). */
  title?: string
}

export type QueryIntent = {
  kind: 'query'
}

export type ParsedIntent =
  | AddChoreIntent
  | TopupIntent
  | SetGoalIntent
  | ContributeGoalIntent
  | SendNoteIntent
  | CreateRuleIntent
  | RememberIntent
  | VerifyChoreIntent
  | QueryIntent

const INTENT_SYSTEM = `You are an intent parser for a family money app called MoneyPal.

Given a user message and family context, extract the user's intent as JSON.

Return one of these shapes:
1. { "kind": "add_chore", "kidName": string, "title": string, "rewardBrains": number }
2. { "kind": "topup", "kidName": string, "brainsDelta": number, "note": string | null }
3. { "kind": "set_goal", "kidName": string, "goalName": string, "targetBrains": number }
4. { "kind": "contribute_goal", "kidName": string, "goalName": string | null, "brainsDelta": number }
5. { "kind": "send_note", "kidName": string, "message": string }
6. { "kind": "create_rule", "ruleText": string }
7. { "kind": "remember", "fact": string, "kidName": string | null }
8. { "kind": "verify_chore", "title": string | null }
9. { "kind": "query" }

Rules:
- Use "query" for anything that is just a question or conversation (no action needed).
- add_chore: create a chore/task for a kid to earn a reward.
- topup: add money to a kid's wallet/balance.
- set_goal: create a NEW savings goal for a kid.
- contribute_goal: add money/progress TOWARD a kid's EXISTING goal (e.g. "put $5 toward Mia's bike"). goalName is the goal it targets, or null for their current goal.
- send_note: send a short message/note to a kid (e.g. "tell Sam I'm proud of him").
- create_rule: set a family rule or limit (e.g. "no spending over $20", "sugar limit 30g a day"). Put the whole rule in ruleText.
- remember: store a fact PAL should remember (e.g. "remember Mia loves dinosaurs", "remember I get paid on the 1st"). kidName is who it's about, or null if about the speaker/family.
- verify_chore: the speaker (a kid) says they DID/finished/completed a chore and wants credit (e.g. "I did the dishes", "finished cleaning my room", "done with homework"). title = the chore named, or null if unspecified.
- Extract kid names from the message. Match to the family context if possible.
- Money: 1 AUD = 100 Brains. "$10" → 1000. Applies to topup, contribute_goal, rewards, and targets.
- Defaults: chore reward = 50; new goal target = 500.
- Never invent kids that aren't in the family context.
- Return ONLY valid JSON. No explanation.`

/**
 * An action intent is only worth surfacing as a confirm card if it actually has
 * what it needs to execute. Otherwise we treat the message as a plain query so
 * PAL asks for the missing details conversationally (no dead-end card).
 */
function intentIsActionable(i: ParsedIntent): boolean {
  switch (i.kind) {
    case 'add_chore': return !!(i.kidAccountId && i.title)
    case 'topup': return !!(i.kidAccountId && i.brainsDelta)
    case 'set_goal': return !!(i.kidAccountId && i.goalName)
    case 'contribute_goal': return !!(i.kidAccountId && i.brainsDelta)
    case 'send_note': return !!(i.kidAccountId && i.message)
    case 'create_rule': return !!i.ruleText
    case 'remember': return !!i.fact
    case 'verify_chore': return true // opening the camera verifier never dead-ends
    default: return true // query
  }
}

export async function parseIntent(
  message: string,
  ctx: PalContext,
): Promise<ParsedIntent> {
  // Quick heuristic — skip LLM call for obvious queries.
  const lower = message.toLowerCase()
  const actionWords = [
    'add chore', 'create chore', 'chore', 'top up', 'topup', 'send', 'set goal', 'add goal', 'new goal',
    'goal', 'save', 'saving', 'contribute', 'toward', 'towards', 'put $', 'message', 'tell ', 'note',
    'remember', 'remind', 'rule', 'limit', 'allowance',
    'i did', 'i finished', 'finished', 'completed', 'done with', 'did my', 'did the', 'cleaned', 'i cleaned',
  ]
  const hasAction = actionWords.some((w) => lower.includes(w))

  if (!hasAction) return { kind: 'query' }

  const kidNames = ctx.kids.map((k) => k.name).join(', ')
  const contextLine = ctx.kids.length > 0
    ? `Family kids: ${kidNames}`
    : 'No kids in family yet.'

  try {
    const resp = await llm.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 150,
      messages: [
        { role: 'system', content: INTENT_SYSTEM },
        { role: 'user', content: `${contextLine}\n\nMessage: "${message}"` },
      ],
    })

    const raw = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as ParsedIntent

    // Resolve kidAccountId from name (for any intent that names a kid).
    if ('kidName' in raw && raw.kidName) {
      const want = String(raw.kidName).toLowerCase().trim()
      const match = ctx.kids.find((k) => {
        const name = k.name.toLowerCase().trim()
        return name === want || name.startsWith(want) || want.startsWith(name) || name.split(' ')[0] === want
      })
      if (match) {
        (raw as AddChoreIntent | TopupIntent | SetGoalIntent | ContributeGoalIntent | SendNoteIntent | RememberIntent).kidAccountId = match.accountId
      }
    }

    // Don't surface a confirmation card we can't actually fulfil — fall back to
    // a conversational reply that asks for the missing piece.
    if (!intentIsActionable(raw)) {
      logger.info({ kind: raw.kind, message: message.slice(0, 50) }, 'pal.intent_incomplete')
      return { kind: 'query' }
    }

    logger.info({ kind: raw.kind, message: message.slice(0, 50) }, 'pal.intent_parsed')
    return raw
  } catch (err) {
    logger.warn({ err: String(err) }, 'pal.intent_parse_failed')
    return { kind: 'query' }
  }
}
