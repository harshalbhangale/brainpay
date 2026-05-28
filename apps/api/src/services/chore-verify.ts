import OpenAI from 'openai'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Chore verification via GPT-4o Vision.
 *
 * The kid submits a photo of their completed chore. We send it to
 * GPT-4o with a structured prompt and get back a verdict + reason.
 *
 * Returns:
 *   verdict: 'approved' | 'rejected' | 'uncertain'
 *   reason:  one sentence, max 15 words, kid-friendly
 */

const env = loadEnv()

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export type ChoreVerdict = {
  verdict: 'approved' | 'rejected' | 'uncertain'
  reason: string
}

const SYSTEM_PROMPT = `You are PAL, a friendly AI assistant helping verify whether a kid has completed a household chore.

You will be shown a photo and told what chore the kid claims to have done.

Respond with a JSON object:
{
  "verdict": "approved" | "rejected" | "uncertain",
  "reason": "one sentence, max 15 words, friendly and specific"
}

Rules:
- "approved": the photo clearly shows the chore is done
- "rejected": the photo clearly shows the chore is NOT done
- "uncertain": the photo is blurry, too dark, wrong angle, or you genuinely can't tell
- Never be harsh. The kid is 8-14 years old.
- Be specific: mention what you see (e.g. "Bins are outside the garage" or "Room still has clothes on the floor")
- Never say "I can see" or "The image shows" — just state the fact directly`

export async function verifyChorePhoto(
  choreTitle: string,
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<ChoreVerdict> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 150,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Chore to verify: "${choreTitle}"\n\nHas this chore been completed?`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: 'low', // cheaper + faster, sufficient for chore verification
              },
            },
          ],
        },
      ],
    })

    const raw = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
      verdict?: string
      reason?: string
    }

    const verdict = ['approved', 'rejected', 'uncertain'].includes(raw.verdict ?? '')
      ? (raw.verdict as ChoreVerdict['verdict'])
      : 'uncertain'

    const reason = typeof raw.reason === 'string' && raw.reason.length > 0
      ? raw.reason.slice(0, 120) // hard cap
      : 'Could not determine from the photo.'

    logger.info({ choreTitle, verdict }, 'chore_verify.result')
    return { verdict, reason }
  } catch (err) {
    logger.error({ err: String(err), choreTitle }, 'chore_verify.failed')
    // Fail safe — uncertain means parent reviews manually
    return {
      verdict: 'uncertain',
      reason: 'Could not analyse the photo. Sent to parent for review.',
    }
  }
}
