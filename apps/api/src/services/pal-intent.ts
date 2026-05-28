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

export type IntentKind = 'add_chore' | 'topup' | 'set_goal' | 'query'

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

export type QueryIntent = {
  kind: 'query'
}

export type ParsedIntent = AddChoreIntent | TopupIntent | SetGoalIntent | QueryIntent

const INTENT_SYSTEM = `You are an intent parser for a family money app called MoneyPal.

Given a user message and family context, extract the user's intent as JSON.

Return one of these shapes:
1. { "kind": "add_chore", "kidName": string, "title": string, "rewardBrains": number }
2. { "kind": "topup", "kidName": string, "brainsDelta": number, "note": string | null }
3. { "kind": "set_goal", "kidName": string, "goalName": string, "targetBrains": number }
4. { "kind": "query" }

Rules:
- Use "query" for anything that is just a question or conversation (no action needed).
- Extract kid names from the message. Match to the family context if possible.
- For topup: 1 AUD = 100 Brains. If user says "$10", brainsDelta = 1000.
- For chores: default rewardBrains = 50 if not specified.
- For goals: default targetBrains = 500 if not specified.
- Never invent kids that aren't in the family context.
- Return ONLY valid JSON. No explanation.`

export async function parseIntent(
  message: string,
  ctx: PalContext,
): Promise<ParsedIntent> {
  // Quick heuristic — skip LLM call for obvious queries.
  const lower = message.toLowerCase()
  const actionWords = ['add chore', 'create chore', 'top up', 'topup', 'send', 'set goal', 'add goal']
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

    // Resolve kidAccountId from name.
    if ('kidName' in raw && raw.kidName) {
      const match = ctx.kids.find(
        (k) => k.name.toLowerCase() === raw.kidName.toLowerCase(),
      )
      if (match) {
        (raw as AddChoreIntent | TopupIntent | SetGoalIntent).kidAccountId = match.accountId
      }
    }

    logger.info({ kind: raw.kind, message: message.slice(0, 50) }, 'pal.intent_parsed')
    return raw
  } catch (err) {
    logger.warn({ err: String(err) }, 'pal.intent_parse_failed')
    return { kind: 'query' }
  }
}
