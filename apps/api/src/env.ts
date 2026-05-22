import { z } from 'zod'

/**
 * Server-side environment validation.
 * Boots fail loud if any required key is missing.
 * See: Build Deck § 4 (env matrix), Detailed Spec § 1.3.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Supabase (server-side, service role)
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_API_URL: z.string().url().optional(),

  // Bedrock (perception). AWS_BEARER_TOKEN_BEDROCK is read directly by the
  // AWS SDK at request time; we don't need to bind it to a local var.
  BEDROCK_REGION: z.string().default('ap-southeast-2'),
  BEDROCK_MODEL_ID: z.string().default('apac.amazon.nova-lite-v1:0'),

  // Legacy AI providers (no longer required; kept optional during transition)
  GEMINI_API_KEY: z.string().min(1).optional(),
  XAI_API_KEY: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),

  // Observability (optional in dev)
  SENTRY_DSN_API: z.string().url().optional().or(z.literal('')),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

export function loadEnv(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid env:', parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  cached = parsed.data
  return cached
}
