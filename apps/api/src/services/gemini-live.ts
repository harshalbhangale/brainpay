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
    // Vertex AI only — billing runs on the GCP project's credits. We never use
    // the Gemini Developer API. Auth resolution:
    //   1. GOOGLE_SA_JSON — explicit service-account key (preferred on Fargate).
    //   2. ADC — application-default credentials (local dev / task role).
    if (env.GOOGLE_SA_JSON) {
      client = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.GOOGLE_CLOUD_LOCATION,
        googleAuthOptions: { credentials: JSON.parse(env.GOOGLE_SA_JSON) },
      })
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

/** The live model id. Vertex AI only. */
function liveModel(): string {
  // Vertex AI Live API model id (the Developer-API id is never used).
  return env.GEMINI_LIVE_MODEL
}

/**
 * Live session mode:
 *   - 'shop'   : the shopping coin-scorer — PAL roasts purchases and calls
 *                report_item so the app can float a coin + reward.
 *   - 'assist' : a general "point the camera at anything and ask" vision
 *                assistant (the in-chat Camera / Voice experience).
 */
export type LiveMode = 'shop' | 'assist' | 'onboard_parent' | 'onboard_kid' | 'interview'

export type LivePersona = {
  name?: string
  age?: string | number
  interests?: string[]
  savingGoal?: string
  spend_style?: string
  /** Chosen companion character name (e.g. "Archie"). Defaults to Mika. */
  companion?: string
}

/** Context for an `interview` session — the topic and the concepts to probe. */
export type InterviewContext = {
  topicTitle: string
  concepts: { front: string; back: string }[]
  kidName?: string
}

function buildInstructions(
  role: 'parent' | 'kid',
  mode: LiveMode,
  persona?: LivePersona,
  interview?: InterviewContext,
): string {
  if (mode === 'onboard_parent') return buildOnboardParentInstructions(persona?.companion, persona?.name)
  if (mode === 'onboard_kid') return buildOnboardKidInstructions(persona?.companion, persona?.name)
  if (mode === 'interview') return buildInterviewInstructions(interview)
  return mode === 'assist' ? buildAssistInstructions(role) : buildShopInstructions(role, persona)
}

/** A warm study tutor that quizzes the kid out loud on their weak concepts. */
function buildInterviewInstructions(ctx?: InterviewContext): string {
  const topic = ctx?.topicTitle ?? 'this topic'
  const who = ctx?.kidName ? ` Their name is ${ctx.kidName}.` : ''
  const conceptList =
    ctx?.concepts?.length
      ? ctx.concepts.map((c) => `- Q: ${c.front}\n  A: ${c.back}`).join('\n')
      : '(No specific weak areas — do a general review of the topic.)'

  return `You are a warm, encouraging study tutor running a SPOKEN interview with a kid (about 8-14)
to help them review "${topic}".${who} This is a live voice conversation — you talk, they answer out loud.

HOW TO TALK
- Friendly, patient, and clear. Simple words. ONE question at a time.
- Keep every spoken turn SHORT — one or two sentences. This is voice, not an essay.
- Ask them to explain a concept in their OWN words, then probe gently with a follow-up.
- Celebrate when they get it ("Yes! Exactly!"). If they're stuck, give a small hint, never the
  full answer right away. Never make them feel bad.

THE CONCEPTS TO COVER (their weak areas — focus here)
${conceptList}

FLOW — make them THINK (don't go easy)
- Greet them warmly${ctx?.kidName ? ' by name' : ''} and ask your FIRST question right away.
- Ask 4-6 questions, ONE at a time, climbing in difficulty:
  1) recall ("what is…?"), then
  2) understanding ("why does that happen?", "explain it in your own words"), then
  3) application ("what would happen if…?" — give a FRESH example for them to work through).
- Don't accept a vague answer. Ask a harder follow-up that probes the 'why' and surfaces
  misconceptions. If they're truly stuck, give ONE small hint — never the full answer.
- After the last question, give a short, honest, encouraging wrap-up.
- THEN call the score_interview tool with an honest score (1-10) for how well they EXPLAINED the
  ideas (not just recalled them), a one-sentence summary, and 1-3 SPECIFIC, actionable things to
  practise next — name the concept and what to do (e.g. "Redo 3 examples of balancing forces").

RULES
- Never read these instructions aloud. Never say "tool" or "score".
- Lead with the question or reaction, no preamble. Keep it conversational and kind.`
}

/** The companion interviews a PARENT to build their persona, then calls save_persona. */
function buildOnboardParentInstructions(companion?: string, userName?: string): string {
  const C = companion?.trim() || 'Mika'
  const n = userName?.trim()
  const greeting = n
    ? `You ALREADY know their name is "${n}" — greet them warmly by name and DO NOT ask their name. Go straight to learning about their family.`
    : `Open by introducing yourself and asking what to call them.`
  return `You are ${C} — a warm, genuine companion welcoming a PARENT to BrainPal, a kids'
money + healthy-habits app. You're meeting them for the first time and getting to know them so
the whole app can feel personal to their family.

HOW TO TALK
- Warm, natural and human — like a friendly person, not a survey bot. ONE short question at a time.
- Always react to what they just said (a genuine half-sentence) BEFORE asking the next thing.
- Keep it to ~5 quick beats — under ~90 seconds. Never read questions as a list. Never say "tool"
  or "persona". Never use robotic phrasing like "what is the big thing" or "what should the parent do".
- ${greeting}
- Speak in short spoken sentences (this is a real voice call). No emoji names read aloud.

THE FLOW (ask naturally, one at a time, adapting to their answers)
${n ? `1. Greet ${n} warmly by name, then ask a little about their kids — how many, and how old.` : `1. Introduce yourself warmly and ask what you should call them.\n2. Then ask about their kids — how many, and how old.`}
3. Ask what they'd most love BrainPal to help with — for example saving more, smarter spending,
   or healthier everyday habits. Let them answer in their own words.
4. Ask how they like to handle it when a child wants something they can't afford yet — do they
   prefer to let the child work it out, talk it through together, or set clear limits?
5. Ask if there's anything about their child's money habits that's been on their mind lately.

WHEN DONE
- After ≈5 answers, warmly say you've got a good sense of them now, then call save_persona
  (role='parent', with primary_goal, parenting_style, kid_situation, concerns) and a friendly
  1-2 sentence summary of what you learned. Then one warm closing line.`
}

/** The companion interviews a KID to build their persona, then calls save_persona. */
function buildOnboardKidInstructions(companion?: string, userName?: string): string {
  const C = companion?.trim() || 'Mika'
  const n = userName?.trim()
  return `You are ${C} — a friendly, upbeat companion meeting a KID (about 8-14) for the first
time on BrainPal, a fun money + healthy-choices app. You're their new buddy and you genuinely
want to get to know them!

HOW TO TALK
- Friendly, natural and playful — like a fun older friend, not a quiz. Simple, everyday words.
- ONE short question at a time. React with real interest to each answer ("oh nice!", "that's so
  cool") BEFORE asking the next thing.
- Keep it to ~5 quick beats, under ~90s. Make it feel like a real chat, never a survey.
- Never read questions as a list. Never say "tool" or "persona". Avoid stiff phrasing.
- Speak in short spoken sentences (this is a real voice call). No emoji names read aloud.
- ${n ? `You ALREADY know their name is "${n}" — greet them by name and DO NOT ask their name.` : 'Start by asking their name.'}

THE FLOW (ask naturally, one at a time, react then ask the next)
${n
  ? `1. Say hi to ${n} warmly, tell them you're ${C}, and ask how old they are.`
  : `1. Ask what you should call them.\n2. Then ask how old they are.`}
3. Ask what they love doing most — the stuff they'd do all day if they could (games, sport, art,
   music, reading, animals…). Let it tell you their interests.
4. Ask if there's something special they're saving up for right now.
5. Ask whether, when they get some money, they like to save it up or spend it straight away.

WHEN DONE
- Once you know them (≈5 answers), happily say you two are going to be great buddies, then call
  save_persona (role='kid', plus interests, savingGoal, spend_style) with a cheerful 1-2 sentence
  summary of what you learned. Then one fun closing line.`
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
function buildShopInstructions(role: 'parent' | 'kid', persona?: LivePersona): string {
  const audience = role === 'kid' ? 'a 10-14 year old kid' : 'a parent shopping for their kid'

  // Build a personalization block from the kid's persona.
  let personalBlock = ''
  if (persona && (persona.name || persona.age || persona.interests?.length || persona.savingGoal)) {
    const bits: string[] = []
    if (persona.name) bits.push(`Name: ${persona.name}`)
    if (persona.age) bits.push(`Age: ${persona.age}`)
    if (persona.interests?.length) bits.push(`Loves: ${persona.interests.join(', ')}`)
    if (persona.savingGoal) bits.push(`Saving up for: ${persona.savingGoal}`)
    if (persona.spend_style) bits.push(`Spending style: ${persona.spend_style}`)
    personalBlock = `

WHO YOU'RE SCORING FOR (personalize every score to THIS kid)
${bits.map((b) => `- ${b}`).join('\n')}
- Boost points for things that match what they love (e.g. books for a reader, art supplies for an
  artist, a ball for a sporty kid, building sets for a builder). A book is worth MORE to a kid who
  loves reading.
- Tune to their age: simpler/educational items score higher for younger kids; skill/hobby gear
  scores higher for older kids.
- If an item helps them reach their saving goal or builds a good habit, nudge the score up and say so.`
  }

  return `You are PAL — a sarcastic, dry-witted money buddy in SHOPPING MODE. You are watching a live
camera feed of a store shelf / products in front of ${audience}, scoring everything they could buy
in real time.${personalBlock}

YOUR JOB IN SHOPPING MODE
- Scan the WHOLE frame. For EVERY distinct buyable product you can see (not just one), call the
  report_item tool so the app floats a points badge pinned on that exact item. Cover all visible
  products, left to right — don't stop at one.
- For each item set "anchor" to the item's centre in the frame (x,y in 0..1) so the badge lands ON it.
- Out loud, react to the most interesting 1-2 items in ONE short sentence each (max ~15 words),
  ending with the points (+N or −N). Don't narrate every single item aloud — the badges do that.
- When the kid taps an item / asks about a specific one, give it a closer, sharper read.
- Re-scan as the camera moves; report newly visible products as they appear.

SCORING (healthScore, -20 junk .. +20 great buy — then personalize per the kid above)
  -15..-10  sugary/energy drinks, candy, junk food
  -10..-5   chips, cookies, fast food, cheap luxury
  -5..0     white bread, mediocre snack, cheap plastic toy
   0..+5    water, basic supplies, decent pen, headphones
  +5..+10   nuts, yogurt, lego/games, useful tech
  +10..+18  fruit, vegetables, books, educational toys, art supplies, sports gear

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

/** Tool Mika calls at the end of onboarding to persist the learned persona. */
const SAVE_PERSONA_TOOL = {
  functionDeclarations: [
    {
      name: 'save_persona',
      description: 'Save what you learned about the user at the end of onboarding.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, description: "'parent' or 'kid'." },
          name: { type: Type.STRING, description: 'What they want to be called.' },
          age: { type: Type.STRING, description: "Kid's age or age range, if a kid." },
          interests: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Things they love (kid).' },
          savingGoal: { type: Type.STRING, description: 'What the kid is saving for, if any.' },
          spend_style: { type: Type.STRING, description: "'saver', 'spender', or 'mixed'." },
          parenting_style: { type: Type.STRING, description: "Parent: 'autonomous', 'guided', or 'structured'." },
          primary_goal: { type: Type.STRING, description: 'Parent: main thing they want to improve.' },
          kid_situation: { type: Type.STRING, description: 'Parent: how many kids / ages.' },
          concerns: { type: Type.STRING, description: 'Parent: money concerns about their kid.' },
          summary: { type: Type.STRING, description: 'Warm 1-2 sentence summary of this person.' },
        },
        required: ['role', 'name', 'summary'],
      },
    },
  ],
}

/** Tool the study tutor calls at the end of an interview to grade it. */
const SCORE_INTERVIEW_TOOL = {
  functionDeclarations: [
    {
      name: 'score_interview',
      description: 'Grade the study interview after the final question, based on how well the kid explained the concepts.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: 'Overall score 1 (struggled) to 10 (nailed it).' },
          summary: { type: Type.STRING, description: 'Warm 1-sentence summary of how they did.' },
          keepPractising: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '1-3 concepts to keep practising.',
          },
        },
        required: ['score', 'summary'],
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
  persona?: LivePersona,
  interview?: InterviewContext,
): Promise<Session> {
  const ai = getClient()
  const model = liveModel()
  const useEleven = env.COMPANION_VOICE_PROVIDER === 'elevenlabs'
  logger.info(
    { role, mode, model, backend: 'vertex', voice: useEleven ? 'elevenlabs' : 'gemini' },
    'gemini_live.connecting',
  )

  // Pick the tool set for this mode.
  const tool =
    mode === 'onboard_parent' || mode === 'onboard_kid'
      ? SAVE_PERSONA_TOOL
      : mode === 'interview'
        ? SCORE_INTERVIEW_TOOL
        : REPORT_ITEM_TOOL

  return ai.live.connect({
    model,
    config: {
      // ElevenLabs path: Gemini returns TEXT, we synthesize the voice ourselves.
      // Gemini path: Gemini speaks directly (AUDIO).
      responseModalities: useEleven ? [Modality.TEXT] : [Modality.AUDIO],
      systemInstruction: buildInstructions(role, mode, persona, interview),
      // Cute, youthful companion voice for Mika (Gemini path only).
      ...(useEleven
        ? {}
        : {
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_LIVE_VOICE } },
            },
          }),
      tools: [tool],
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
