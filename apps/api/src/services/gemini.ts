import { GoogleGenerativeAI, type Schema, SchemaType } from '@google/generative-ai'
import { PerceptionResult } from '@brainpal/shared'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Gemini 2.0 Flash — perception.
 * Detailed Spec § 4.3.
 *
 * Returns the most prominent food/drink item in frame (max 1) with:
 *   { name, category, healthScore (-20..+20), confidence (0..1), bbox }
 *
 * healthScore is the coin delta we'll show. We let Gemini do the scoring
 * directly so we don't need a catalog table for the prototype.
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
          category: {
            type: SchemaType.STRING,
            enum: ['drink', 'snack', 'dairy', 'produce', 'meal', 'other'],
          },
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

const PROMPT = `You are a vision model that detects food and drink items on supermarket shelves.

Detect AT MOST 1 item — the most prominent food, drink, or snack in the frame.
If no food/drink is clearly visible, return {"items": []}.

For each item:
- name: specific product name with brand if visible (e.g. "Coca-Cola Classic 375ml can", "Coles Mixed Nuts 150g pack", "banana", "Snickers bar")
- category: one of drink | snack | dairy | produce | meal | other
- healthScore: integer from -20 (worst junk) to +20 (very healthy)
    Examples: Coke=-15, energy drink=-15, Snickers=-12, chips=-10, sugary cereal=-8,
    white bread=-3, water=+5, milk=+8, banana=+15, mixed nuts=+15, apple=+15, salad=+18.
- confidence: 0..1 of how sure you are.
- bbox: [x, y, width, height] normalized 0..1 from top-left.

Return ONLY valid JSON matching the schema. No commentary.`

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
