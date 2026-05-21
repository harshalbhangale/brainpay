import { loadEnv } from '../env'

/**
 * Gemini 2.0 Flash — perception.
 * Detailed Spec § 4.3. Implemented day 7.
 */

const env = loadEnv()

export async function detectItems(_jpegBytes: Uint8Array): Promise<unknown> {
  // TODO(day-7): call Gemini with structured JSON schema, temperature 0, maxOutputTokens 200.
  // Return PerceptionResult (zod parsed).
  void env.GEMINI_API_KEY
  throw new Error('not_implemented')
}
