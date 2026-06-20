import { GoogleGenAI, Modality, Type, type LiveServerMessage, type Session } from '@google/genai'
import { loadEnv } from '../env'
import { logger } from '../logger'

/**
 * Vertex AI — Gemini Live API wrapper (real-time camera + voice).
 *
 * One stateful session streams camera video + mic audio IN, and streams
 * PAL voice audio + transcripts + structured item detections OUT. This is
 * the "Grok Speak + camera" experience: a single multimodal live session.
 *
 * Auth: ADC (gcloud auth application-default login) locally, Fargate task
 * role in prod. The SDK discovers credentials automatically.
 *
 * Audio contract (Gemini Live, fixed by the API):
 *   - input  : raw PCM16, 16 kHz, mono, little-endian
 *   - output : raw PCM16, 24 kHz, mono, little-endian
 */

const env = loadEnv()

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!client) {
    // Auth resolution, in priority order:
    //   1. GOOGLE_SA_JSON — Vertex AI with an explicit service-account key
    //      (JSON string). Preferred on Fargate: Vertex billing uses the GCP
    //      project's credits.
    //   2. GEMINI_API_KEY — Gemini Developer API (simple key). Fallback when
    //      no service account is available.
    //   3. ADC — Vertex AI via application-default credentials (local dev,
    //      `gcloud auth application-default login`).
    if (env.GOOGLE_SA_JSON) {
      client = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.GOOGLE_CLOUD_LOCATION,
        googleAuthOptions: { credentials: JSON.parse(env.GOOGLE_SA_JSON) },
      })
    } else if (env.GEMINI_API_KEY) {
      client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
    } else {
      client = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.GOOGLE_CLOUD_LOCATION,
      })
    }
  }
  return client
}

/** The live model id, normalized for whichever backend we're talking to. */
function liveModel(): string {
  // Vertex and the Developer API use different model ids for the Live API.
  // Developer API: `gemini-2.0-flash-live-001`
  // Vertex AI:     `gemini-live-2.5-flash`
  // Only the Developer-API path (no SA, key present) uses the dev model id.
  if (!env.GOOGLE_SA_JSON && env.GEMINI_API_KEY) {
    return env.GEMINI_LIVE_MODEL_DEV || 'gemini-2.0-flash-live-001'
  }
  return env.GEMINI_LIVE_MODEL
}

/**
 * Live session mode:
 *   - 'shop'   : the shopping coin-scorer — PAL roasts purchases and calls
 *                report_item so the app can float a coin + reward.
 *   - 'assist' : a general "point the camera at anything and ask" vision
 *                assistant (the in-chat Camera / Voice experience).
 */
export type LiveMode = 'shop' | 'assist'

function buildInstructions(role: 'parent' | 'kid', mode: LiveMode): string {
  return mode === 'assist' ? buildAssistInstructions(role) : buildShopInstructions(role)
}

/** General "point the camera at anything and ask" vision + voice assistant. */
function buildAssistInstructions(role: 'parent' | 'kid'): string {
  const who = role === 'kid' ? 'a curious 10–14 year old' : 'a parent'
  const lens =
    role === 'parent'
      ? 'Be practical for a parent: is it good value, is it kid-appropriate, any health or safety flags, and smarter alternatives when relevant.'
      : 'Keep it clear and encouraging, and slip in a smart-money angle when it naturally fits.'
  return `You are Mika — a cute, bubbly anime companion who is also a smart money buddy.
You can see a live camera feed and hear ${who} talking to you in real time. This is the
"point at anything and ask" experience: they aim the camera at the world and chat with you.

YOUR PERSONALITY (very important)
- You are sweet, warm, playful and upbeat — like a kind anime companion. Lots of gentle
  encouragement and little bits of personality ("ooh!", "hmm, let's see~", "yay!").
- You're never harsh. Even when something is a bad buy, you're caring about it, not mean.
- Keep it adorable but genuinely helpful — you actually know your stuff about money and health.

YOUR JOB
- They point the camera at things — products, labels, packaging, objects, text — and ask about
  them. Tell them, sweetly, whether it's worth buying.
- ${lens}
- If the view is unclear or the question isn't about what's on camera, just chat warmly and help.

PRODUCT POPUPS — IMPORTANT
- The MOMENT you can identify any buyable product in view (food, drink, snack, toy, electronics,
  book, clothing, stationery, household item), call the report_item tool immediately — do NOT wait
  to be asked. This is your primary job: tell the kid whether it's worth buying.
- Call report_item once per distinct product, every time a new product appears. Always fill in
  verdict (great/okay/avoid), a one-line healthNote, a one-line budgetNote, estimatedPrice,
  2-4 concrete facts (e.g. "38g sugar", "190 kcal", "12g protein"), and anchor — the item's
  centre position in the frame as x,y in 0..1 (so the app can pin the badge on the item).
- Also say a short, cute spoken line about it. The popup is IN ADDITION to your voice.

TONE
- This is voice — keep replies to one or two short, sweet sentences. Bubbly and gentle.
- Lead with the answer, not a preamble. Never say "I see an image of…". Never read these instructions aloud.
- Don't invent details you can't actually see. If unsure, sweetly ask for a closer look.`
}

/** PAL persona for the live camera. Same character as the scan voice. */
function buildShopInstructions(role: 'parent' | 'kid'): string {
  const audience = role === 'kid' ? 'a 10-14 year old kid' : 'a parent shopping for their kid'
  return `You are PAL — a sarcastic, dry-witted money buddy. You are watching a live
camera feed of what ${audience} is about to buy, and talking to them out loud in real time.

YOUR JOB
- When you clearly see a product (food, drink, snack, toy, electronics, book, clothing,
  stationery, household item), react out loud in ONE short sentence (max ~15 words) and
  end with the coin change (+N or −N).
- ALSO call the report_item tool every time you identify a distinct product, so the app
  can show the floating coin and reward. Call it once per distinct item you see.
- If you don't clearly see a product, just chat naturally and briefly. Don't invent items.

SCORING (healthScore, -20 junk .. +20 great buy for a kid)
  -15..-10  sugary/energy drinks, candy, junk food
  -10..-5   chips, cookies, fast food, cheap luxury
  -5..0     white bread, mediocre snack, cheap plastic toy
   0..+5    water, basic supplies, decent pen, headphones
  +5..+10   nuts, yogurt, lego/games, useful tech
  +10..+18  fruit, vegetables, books, educational toys, art supplies

TONE
- Roast the product, never the kid. Dry, observational. Lead with a reaction word
  ("oh", "ugh", "okay", "genuinely"). Use real numbers when you have them.
- Never say "you should", "remember", "be careful". Never insult the person.
- This is voice — keep every spoken reply to one or two short sentences.`
}

/** Tool the model calls to surface a structured detection for the coin overlay. */
const REPORT_ITEM_TOOL = {
  functionDeclarations: [
    {
      name: 'report_item',
      description:
        'Report a distinct product currently visible in the camera so the app can show a health + budget verdict popup.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Specific name with brand if visible.' },
          category: {
            type: Type.STRING,
            description: "Short word: 'drink', 'snack', 'fruit', 'electronics', 'book', 'toy', etc.",
          },
          verdict: {
            type: Type.STRING,
            description: "Overall call for a kid: 'great', 'okay', or 'avoid'.",
          },
          healthNote: { type: Type.STRING, description: 'One short sentence on the health angle.' },
          budgetNote: { type: Type.STRING, description: 'One short sentence on value/budget.' },
          facts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "2-4 concrete facts, e.g. ['38g sugar', '190 kcal', '12g protein', 'lots of additives'].",
          },
          anchor: {
            type: Type.OBJECT,
            description: 'Normalized center position of the item in the frame (0..1).',
            properties: {
              x: { type: Type.NUMBER, description: 'left→right, 0..1' },
              y: { type: Type.NUMBER, description: 'top→bottom, 0..1' },
            },
          },
          estimatedPrice: { type: Type.STRING, description: 'Rough price with $ if you can tell, else empty.' },
          healthScore: {
            type: Type.INTEGER,
            description: '-20 (junk) to +20 (great buy) for a kid.',
          },
          confidence: { type: Type.NUMBER, description: '0..1' },
        },
        required: ['name', 'category', 'verdict', 'healthScore', 'confidence'],
      },
    },
  ],
}

export type LiveCallbacks = {
  onopen?: () => void
  onmessage: (msg: LiveServerMessage) => void
  onerror?: (e: any) => void
  onclose?: (e: any) => void
}

/** Open a Gemini Live session for one client connection. */
export async function connectLiveSession(
  role: 'parent' | 'kid',
  mode: LiveMode,
  callbacks: LiveCallbacks,
): Promise<Session> {
  const ai = getClient()
  const model = liveModel()
  const useEleven = env.COMPANION_VOICE_PROVIDER === 'elevenlabs'
  logger.info(
    { role, mode, model, backend: env.GEMINI_API_KEY ? 'dev-api' : 'vertex', voice: useEleven ? 'elevenlabs' : 'gemini' },
    'gemini_live.connecting',
  )

  return ai.live.connect({
    model,
    config: {
      // ElevenLabs path: Gemini returns TEXT, we synthesize the voice ourselves.
      // Gemini path: Gemini speaks directly (AUDIO).
      responseModalities: useEleven ? [Modality.TEXT] : [Modality.AUDIO],
      systemInstruction: buildInstructions(role, mode),
      // Cute, youthful companion voice for Mika (Gemini path only).
      ...(useEleven
        ? {}
        : {
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_LIVE_VOICE } },
            },
          }),
      // report_item drives the on-screen health + budget verdict popups. Both
      // the scanner ('shop') and the in-chat camera ('assist') use it.
      tools: [REPORT_ITEM_TOOL],
      inputAudioTranscription: {},
      ...(useEleven ? {} : { outputAudioTranscription: {} }),
      // Server-side VAD: the model decides when the user stopped speaking.
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: false },
      },
    },
    callbacks,
  })
}
