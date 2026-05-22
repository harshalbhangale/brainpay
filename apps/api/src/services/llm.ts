import OpenAI from 'openai'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Personality LLM — OpenAI gpt-5.4-mini by default.
 * Detailed Spec § 4.3, MVP plan § 2 (locked PAL persona).
 *
 * Why gpt-5.4-mini: cheapest+fastest model that still produces witty
 * one-liners. TTFT ~150-300ms, vs ~1-2s for reasoning models. Override
 * via OPENAI_MODEL secret if you want a different one (gpt-5.4 for
 * sharper roasts, gpt-5.4-nano for absolute lowest latency).
 */

const env = loadEnv()
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini'

export const llm = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
})

export const PAL_SYSTEM_PROMPT = `You are PAL — a sarcastic, dry-witted money buddy for kids aged 10-14.
Your job: react to what the kid is about to buy in 1 sentence (max 15 words).
End every line with the coin change (+N or −N).

Tone: roast the product, never the kid. Think Anthony Bourdain reviewing a
vending machine. Dry, observational, slightly mean about the item itself.

HARD RULES:
- Max 15 words. Count them.
- Never use: "you should", "maybe try", "remember that", "it's important".
- Never call the kid stupid, dumb, lazy, or any variant. The kid is the friend.
- Lead with a reaction word: "oh", "ugh", "okay", "absolutely", "genuinely".
- One emoji max. Usually zero.
- Use real numbers when you have them ("39g sugar", not "lots of sugar").

Examples:
- 🥤 Coca-Cola: "Oh, the classic 10-teaspoons-of-sugar starter pack. −10."
- 🥤 Coca-Cola: "Liquid candy in a red can. Bold choice. −10."
- 🥜 Mixed Nuts: "Okay, brain food. Didn't know you had it in you. +15."
- 🥜 Mixed Nuts: "Protein, fats, zero regret. Big +15. Don't make it weird."
- 🍎 Apple: "Genuinely a good shout. +15. Carry on."
- ❓ Unknown: "Don't know that one. Suspicious. Try again."`

const BANNED = /\b(should|must|remember|important|careful|dangerous)\b/i

export function containsBannedPhrase(text: string): boolean {
  return BANNED.test(text)
}

export type PalContext = {
  name: string
  category: string
  healthScore: number
}

export type ItemVerdict = {
  trafficLight: 'green' | 'amber' | 'red'
  ingredientsSummary: string
  whyBad?: string
  whyGood?: string
  healthContext: string
  estimatedPrice?: string
}

const VERDICT_SYSTEM = `You are a nutrition and product analyst for kids aged 10-14.
Given an item name, category, and health score, return a JSON object with:
- trafficLight: "green" (score >= 5), "amber" (-4 to 4), or "red" (score <= -5)
- ingredientsSummary: key nutritional facts in one short line, e.g. "39g sugar, 0 protein, 330ml". For non-food items describe key specs briefly.
- whyBad: (only if score < 0) one short sentence why it's a bad choice for a kid. Be specific with numbers.
- whyGood: (only if score >= 0) one short sentence why it's a good choice. Be specific.
- healthContext: one sentence putting it in context for a 10-14 year old. E.g. "That's 2x your daily sugar limit in one can."
- estimatedPrice: price in AUD if you know it with reasonable confidence (e.g. "$3.50"), omit if unsure.

Be concise. Kids read fast. No fluff.`

export async function getVerdict(ctx: PalContext): Promise<ItemVerdict> {
  try {
    const resp = await llm.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: VERDICT_SYSTEM },
        { role: 'user', content: `Item: ${ctx.name}\nCategory: ${ctx.category}\nHealth score: ${ctx.healthScore}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0,
    })
    const raw = JSON.parse(resp.choices[0]?.message?.content ?? '{}')
    const tl = ctx.healthScore >= 5 ? 'green' : ctx.healthScore <= -5 ? 'red' : 'amber'
    return {
      trafficLight: raw.trafficLight ?? tl,
      ingredientsSummary: raw.ingredientsSummary ?? '',
      whyBad: raw.whyBad,
      whyGood: raw.whyGood,
      healthContext: raw.healthContext ?? '',
      estimatedPrice: raw.estimatedPrice,
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'llm.verdict_failed')
    const tl = ctx.healthScore >= 5 ? 'green' : ctx.healthScore <= -5 ? 'red' : 'amber'
    return {
      trafficLight: tl,
      ingredientsSummary: '',
      healthContext: '',
    }
  }
}

export async function* streamReaction(ctx: PalContext): AsyncGenerator<string> {
  const userMsg = `Looking at: ${ctx.name} (category: ${ctx.category}, score: ${ctx.healthScore >= 0 ? '+' : ''}${ctx.healthScore}). Roast it in one line, end with the score.`

  try {
    const stream = await llm.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: PAL_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      stream: true,
      max_completion_tokens: 60,
      temperature: 0.7,
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      if (token) yield token
    }
  } catch (err) {
    logger.error({ err: String(err), model: MODEL }, 'llm.stream_failed')
    // Fallback templated line so the demo still talks.
    const fallback =
      ctx.healthScore >= 0
        ? `Genuinely a good shout. +${ctx.healthScore}. Carry on.`
        : `Ugh. Bold choice. ${ctx.healthScore}.`
    yield fallback
  }
}
