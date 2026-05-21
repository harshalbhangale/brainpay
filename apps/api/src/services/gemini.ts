import { GoogleGenerativeAI, type Schema, SchemaType } from '@google/generative-ai'
import { PerceptionResult } from '@brainpal/shared'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Gemini 2.0 Flash — universal object perception.
 *
 * Detects ANY prominent object in frame (food, drinks, electronics, books,
 * toys, clothing, household items — anything visible) and scores it on a
 * "is this a good purchase for a kid?" axis from -20 (don't buy) to +20
 * (great buy). PAL roasts based on the score.
 */

const env = loadEnv()
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          healthScore: { type: SchemaType.INTEGER },
          confidence: { type: SchemaType.NUMBER },
          bbox: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.NUMBER },
          },
        },
        required: ['name', 'category', 'healthScore', 'confidence', 'bbox'],
      },
    },
  },
  required: ['items'],
}

const PROMPT = `You are a vision model that watches what a 10–14 year old kid is about to buy.

Detect AT MOST 1 prominent object in the frame. Anything: food, drinks,
snacks, electronics, books, toys, clothing, stationery, household items —
not just snacks. Pick the most clearly visible item.

If no clear object is visible, return {"items": []}.

For each item return:
- name: specific name with brand if visible.
    Examples: "Coca-Cola Classic 375ml can", "Apple iPhone 15 Pro",
    "yellow banana", "Lego Star Wars set", "Stabilo highlighter".
- category: short single word — 'drink', 'snack', 'fruit', 'dairy',
    'electronics', 'book', 'toy', 'clothing', 'stationery', 'household',
    'meal', 'random'. Use any reasonable label; need not be from a fixed list.
- healthScore: integer −20 to +20 = "is this a good purchase for the kid?"
    −15 to −10  sugary drinks, energy drinks, candy, junk food
    −10 to −5   chips, cookies, fast food, expensive luxury items
    −5  to  0   white bread, mediocre snack, cheap plastic toy
     0  to +5   water, basic supplies, decent pen, headphones
    +5  to +10  nuts, yogurt, lego/games, useful tech
    +10 to +18  fruit, vegetables, books, educational toys, art supplies
- confidence: 0..1 of how sure you are this is the labelled object.
- bbox: [x, y, width, height] all normalized 0..1 from top-left.

Return ONLY valid JSON. No commentary.`

export async function detectItems(jpegBytes: Uint8Array): Promise<PerceptionResult> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
      maxOutputTokens: 300,
    },
  })

  const base64 = Buffer.from(jpegBytes).toString('base64')

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
      { text: PROMPT },
    ])
    const text = result.response.text()
    const parsed = PerceptionResult.parse(JSON.parse(text))
    return parsed
  } catch (err) {
    logger.warn({ err: String(err) }, 'gemini.detect_failed')
    return { items: [] }
  }
}
