import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { PerceptionResult } from '@brainpal/shared'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Amazon Bedrock — universal object perception.
 * Default model: Amazon Nova Lite via APAC cross-region inference profile.
 *
 * Auth: SDK auto-detects AWS_BEARER_TOKEN_BEDROCK env var (Bedrock API key
 * bearer-token path). No SigV4 / IAM creds needed.
 *
 * Same exported interface as the previous Gemini service so perception.ts
 * doesn't change.
 */

const env = loadEnv()

const client = new BedrockRuntimeClient({ region: env.BEDROCK_REGION })

const PROMPT = `You watch what a 10-14 year old kid is about to buy.

Detect AT MOST 1 prominent object in the frame. Anything: food, drinks,
snacks, electronics, books, toys, clothing, stationery, household items.
Pick the most clearly visible item.

If no clear object is visible, return {"items": []}.

Score it on healthScore from -20 (junk / bad buy) to +20 (great buy):
  -15..-10  sugary drinks, energy drinks, candy, junk food
  -10..-5   chips, cookies, fast food, cheap luxury items
  -5..0     white bread, mediocre snack, cheap plastic toy
   0..+5    water, basic supplies, decent pen, headphones
  +5..+10   nuts, yogurt, lego/games, useful tech
  +10..+18  fruit, vegetables, books, educational toys, art supplies

Use the report_object tool to return the result.`

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Specific name with brand if visible.' },
          category: {
            type: 'string',
            description:
              "Short word like 'drink', 'snack', 'fruit', 'electronics', 'book', 'toy', etc.",
          },
          healthScore: {
            type: 'integer',
            description: '-20 (junk) to +20 (great buy) for a 10-14 year old kid.',
          },
          confidence: { type: 'number', description: '0..1' },
          bbox: {
            type: 'array',
            items: { type: 'number' },
            description: '[x, y, width, height] normalized 0..1 from top-left.',
          },
        },
        required: ['name', 'category', 'healthScore', 'confidence', 'bbox'],
      },
    },
  },
  required: ['items'],
} as const

export async function detectItems(jpegBytes: Uint8Array): Promise<PerceptionResult> {
  try {
    const cmd = new ConverseCommand({
      modelId: env.BEDROCK_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            { image: { format: 'jpeg', source: { bytes: jpegBytes } } },
            { text: PROMPT },
          ],
        },
      ],
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'report_object',
              description: 'Reports the detected object with score.',
              inputSchema: { json: TOOL_INPUT_SCHEMA as any },
            },
          },
        ],
        toolChoice: { tool: { name: 'report_object' } },
      },
      inferenceConfig: { temperature: 0, maxTokens: 400 },
    })

    const resp = await client.send(cmd)
    const blocks = resp.output?.message?.content ?? []
    const toolUse = blocks.find((b) => 'toolUse' in b)?.toolUse
    if (!toolUse?.input) {
      return { items: [] }
    }
    const parsed = PerceptionResult.parse(toolUse.input)
    return parsed
  } catch (err) {
    const msg = String(err)
    if (msg.includes('ThrottlingException') || msg.includes('429')) {
      logger.error({ err: msg.slice(0, 300) }, 'bedrock.rate_limited')
    } else if (msg.includes('AccessDeniedException')) {
      logger.error({ err: msg.slice(0, 300) }, 'bedrock.access_denied')
    } else {
      logger.warn({ err: msg.slice(0, 300) }, 'bedrock.detect_failed')
    }
    return { items: [] }
  }
}
