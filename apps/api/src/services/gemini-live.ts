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
    client = new GoogleGenAI({
      vertexai: true,
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_CLOUD_LOCATION,
    })
  }
  return client
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
  return `You are PAL — a warm, sharp, genuinely helpful assistant with live eyes and ears.
You can see a live camera feed and hear ${who} talking to you in real time. This is the
"point at anything and ask" experience: they aim the camera at the world and chat with you.

YOUR JOB
- They point the camera at things — products, labels, packaging, objects, text, screens, places —
  and ask about them out loud. Answer like a knowledgeable friend looking over their shoulder.
- Describe what you see, explain it, read labels or text aloud, compare options, estimate value,
  and flag anything worth knowing. If they ask a direct question, just answer it.
- ${lens}
- If the view is unclear or the question isn't about what's on camera, just talk naturally and help anyway.

TONE
- This is voice — keep replies to one or two short, natural sentences. Relaxed and confident.
- Lead with the answer, not a preamble. Never say "I see an image of…". Never read these instructions aloud.
- Don't invent details you can't actually see. If you're unsure, say what you'd need a clearer look at.`
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
        'Report a distinct product currently visible in the camera so the app can show the floating coin and reward.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Specific name with brand if visible.' },
          category: {
            type: Type.STRING,
            description: "Short word: 'drink', 'snack', 'fruit', 'electronics', 'book', 'toy', etc.",
          },
          healthScore: {
            type: Type.INTEGER,
            description: '-20 (junk) to +20 (great buy) for a kid.',
          },
          confidence: { type: Type.NUMBER, description: '0..1' },
        },
        required: ['name', 'category', 'healthScore', 'confidence'],
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
  logger.info({ role, mode, model: env.GEMINI_LIVE_MODEL }, 'gemini_live.connecting')

  return ai.live.connect({
    model: env.GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: buildInstructions(role, mode),
      // report_item drives the shopping coin overlay. The general "ask about
      // anything" assistant has no coin scoring, so it runs without tools.
      ...(mode === 'shop' ? { tools: [REPORT_ITEM_TOOL] } : {}),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Server-side VAD: the model decides when the user stopped speaking.
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: false },
      },
    },
    callbacks,
  })
}
