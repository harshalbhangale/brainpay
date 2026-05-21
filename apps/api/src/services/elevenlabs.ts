import { loadEnv } from '../env'

/**
 * ElevenLabs Flash v2.5 — streaming TTS WebSocket.
 * Detailed Spec § 4.3. Implemented day 9.
 *
 * Locked output format (Build Deck § 9.4):
 *   ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128'
 */

const env = loadEnv()

export const ELEVEN_MODEL = 'eleven_flash_v2_5'
export const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128'

export async function streamTTS(_textStream: AsyncIterable<string>): Promise<AsyncIterable<Uint8Array>> {
  void env.ELEVENLABS_API_KEY
  void env.ELEVENLABS_VOICE_ID
  throw new Error('not_implemented')
}
