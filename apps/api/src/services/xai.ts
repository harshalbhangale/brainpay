import { loadEnv } from '../env'

/**
 * xAI / Grok 4.1 reasoning — personality LLM.
 * OpenAI-compatible at https://api.x.ai/v1.
 * Detailed Spec § 4.3, MVP plan §2 (PAL system prompt).
 *
 * Day-9 implementation:
 *   const xai = new OpenAI({ apiKey: env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
 *   stream chat.completions with reasoning_effort: 'low', max_tokens: 60.
 */

const env = loadEnv()

export const XAI_BASE_URL = 'https://api.x.ai/v1'

export async function* streamReaction(_systemPrompt: string, _context: string): AsyncGenerator<string> {
  void env.XAI_API_KEY
  throw new Error('not_implemented')
  // yield ''  // unreachable, satisfies generator typing
}
