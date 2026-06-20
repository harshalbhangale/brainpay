/**
 * StudyPal Tutor Voice — ElevenLabs TTS for spoken feedback.
 *
 * Used for:
 * - Card review audio: reads the question/answer aloud
 * - Quiz feedback: "Great job!" or "Not quite — here's why..."
 * - Study nudges: "You have 5 cards fading. Quick review?"
 *
 * Uses ElevenLabs Flash model for ultra-low latency (~75ms).
 */

// Tutor voice — warm, encouraging, clear. Use a pre-selected voice.
const TUTOR_VOICE_ID = process.env.ELEVENLABS_TUTOR_VOICE_ID ?? 'pFZP5JQG7iQjIQuC4Bku' // "Lily" - warm female
const API_KEY = process.env.ELEVENLABS_API_KEY ?? ''
const BASE_URL = 'https://api.elevenlabs.io/v1'

export type TutorAudioResult = {
  audio: Buffer
  contentType: string
}

/**
 * Generate speech from text using ElevenLabs Flash (ultra-low latency).
 */
export async function generateTutorSpeech(text: string, opts?: {
  voiceId?: string
  speed?: number
}): Promise<TutorAudioResult> {
  const voiceId = opts?.voiceId ?? TUTOR_VOICE_ID

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5', // Ultra-low latency
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        speed: opts?.speed ?? 1.0,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${err.slice(0, 200)}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return {
    audio: Buffer.from(arrayBuffer),
    contentType: res.headers.get('content-type') ?? 'audio/mpeg',
  }
}

/**
 * Generate streaming speech (for real-time playback during interviews/reviews).
 * Returns a ReadableStream of audio chunks.
 */
export async function streamTutorSpeech(text: string, opts?: {
  voiceId?: string
}): Promise<ReadableStream<Uint8Array>> {
  const voiceId = opts?.voiceId ?? TUTOR_VOICE_ID

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
      },
    }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`ElevenLabs stream failed: ${res.status}`)
  }

  return res.body as ReadableStream<Uint8Array>
}

/**
 * Generate encouraging feedback audio based on card review quality.
 */
export async function generateReviewFeedback(quality: number, cardFront: string): Promise<TutorAudioResult | null> {
  // Only generate voice for notable moments (not every card)
  if (quality === 3) return null // "Good" = no audio, keep flow fast

  const phrases: Record<number, string[]> = {
    0: [`Hmm, let's revisit: ${cardFront}. Take another look at this one.`],
    1: [`That one's tricky! Don't worry, it'll click next time.`],
    2: [`Almost there! You're getting closer on this one.`],
    4: [`Nice! You remembered that well.`],
    5: [`Perfect! You've totally got this one mastered.`, `Excellent recall! That's solid knowledge.`],
  }

  const options = phrases[quality] ?? [`Keep going, you're doing great!`]
  const text = options[Math.floor(Math.random() * options.length)]

  return generateTutorSpeech(text, { speed: 1.1 }) // Slightly faster for feedback
}
