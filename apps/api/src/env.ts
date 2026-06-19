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

  // BrainPal-issued JWT signing secret. ≥32 chars. Required for /auth/*.
  API_JWT_SECRET: z.string().min(32),

  // Twilio Verify (server-side OTP)
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1).optional(),

  // Twilio Voice (inbound voice-task calls)
  TWILIO_VOICE_NUMBER: z.string().min(1).optional(), // E.164 inbound number
  PUBLIC_BASE_URL: z.string().url().optional(),       // https base for TwiML webhooks / media stream

  // Twilio Messaging (SMS notifications — voice-task + invites)
  TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(), // preferred for AU
  TWILIO_MESSAGING_FROM: z.string().min(1).optional(),        // or a plain From number

  // Dev OTP bypass — when DEV_BYPASS_OTP=true, code DEV_BYPASS_CODE
  // (default '123456') is accepted without round-tripping Twilio. Never
  // set this on prod env.
  DEV_BYPASS_OTP: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  DEV_BYPASS_OTP_START: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  DEV_BYPASS_CODE: z.string().default('123456'),

  // Bedrock (perception). AWS_BEARER_TOKEN_BEDROCK is read directly by the
  // AWS SDK at request time; we don't need to bind it to a local var.
  BEDROCK_REGION: z.string().default('ap-southeast-2'),
  BEDROCK_MODEL_ID: z.string().default('apac.amazon.nova-lite-v1:0'),

  // Vertex AI — Gemini Live API (real-time camera + voice).
  // Auth via ADC (gcloud auth application-default login) locally, or the
  // Fargate task role in prod. No key bound here; the Google SDK discovers it.
  // NOTE: Live API requires the 'global' location for this project.
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default('global'),
  GEMINI_LIVE_MODEL: z.string().default('gemini-live-2.5-flash'),
  VERTEX_LIVE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  // Voice pipeline kill-switch. When false, perception still fires detections
  // (coin overlay still appears) but Grok + ElevenLabs are skipped entirely.
  VOICE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  // Personality LLM — OpenAI by default. xAI/Grok kept optional for fallback.
  OPENAI_API_KEY: z.string().min(1),
  XAI_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),

  // Stripe (payments)
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MERCHANT_ID: z.string().default('merchant.com.brainpal.pay'),

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
