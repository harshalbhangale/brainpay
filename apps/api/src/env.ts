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
  // Vertex AI service-account key as a JSON string. When set, the Live API
  // authenticates to Vertex with this key (e.g. on Fargate where ADC isn't
  // available). Otherwise ADC is used. The Gemini Developer API is never used.
  GOOGLE_SA_JSON: z.string().min(1).optional(),
  GEMINI_LIVE_MODEL: z.string().default('gemini-live-2.5-flash'),
  // Companion voice — a Gemini prebuilt voice. "Leda" is youthful/sweet.
  GEMINI_LIVE_VOICE: z.string().default('Leda'),
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
  // Companion (Mika) voice: when COMPANION_VOICE_PROVIDER='elevenlabs', the live
  // camera/voice routes Gemini's TEXT through ElevenLabs TTS using this voice.
  ELEVENLABS_COMPANION_VOICE_ID: z.string().min(1).optional(),
  // Study tutor (interview) voice — warm/encouraging. Falls back to companion voice.
  ELEVENLABS_TUTOR_VOICE_ID: z.string().min(1).optional(),
  ELEVENLABS_TTS_MODEL: z.string().default('eleven_flash_v2_5'),
  COMPANION_VOICE_PROVIDER: z.enum(['gemini', 'elevenlabs']).default('gemini'),

  // Stripe (payments)
  // Google Maps server-side geocoding (reverse-geocode kid locations to place names).
  GEOCODING_API_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MERCHANT_ID: z.string().default('merchant.com.brainpal.pay'),

  // Tavus — conversational video tutor (StudyPal interviews).
  // Server-side only. When TAVUS_API_KEY is unset, the interview falls back to
  // the legacy Gemini-Live voice tutor so nothing dead-ends.
  TAVUS_API_KEY: z.string().min(1).optional(),
  // Optional explicit ids; when unset we auto-pick a stock replica and
  // lazily create + cache the StudyPal Tutor persona on first use.
  TAVUS_REPLICA_ID: z.string().min(1).optional(),
  TAVUS_PERSONA_ID: z.string().min(1).optional(),
  // Optional TTS voice override for the tutor (Cartesia/ElevenLabs voice id).
  TAVUS_TUTOR_VOICE_ID: z.string().min(1).optional(),
  // Shared secret appended to the webhook callback url (?key=) to authenticate
  // Tavus → our /study/tavus/webhook calls.
  TAVUS_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Runway Characters (GWM-1) — real-time conversational avatar for StudyPal
  // interviews. Server-side only. When RUNWAYML_API_SECRET + RUNWAY_AVATAR_ID
  // are set, the interview uses a Runway avatar; otherwise it falls back to
  // Tavus, then the legacy Gemini-Live voice tutor, so nothing dead-ends.
  // RUNWAY_AVATAR_ID may be a single id OR a comma-separated pool of ids, in
  // which case one character is chosen per interview (uniformly at random).
  RUNWAYML_API_SECRET: z.string().min(1).optional(),
  RUNWAY_AVATAR_ID: z.string().min(1).optional(),
  RUNWAY_API_BASE: z.string().url().default('https://api.dev.runwayml.com'),
  RUNWAY_API_VERSION: z.string().default('2024-11-06'),

  // Internal cron secret — guards unauthenticated cron endpoints
  // (e.g. POST /study/nudge-check) via the x-cron-key header.
  CRON_SECRET: z.string().min(1).optional(),

  // Observability (optional in dev)
  SENTRY_DSN_API: z.string().url().optional().or(z.literal('')),
})
  .superRefine((env, ctx) => {
    // CRON_SECRET must be set in production — the cron endpoints are
    // unauthenticated apart from this header.
    if (env.NODE_ENV === 'production' && !env.CRON_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CRON_SECRET'],
        message: 'CRON_SECRET is required in production',
      })
    }
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
