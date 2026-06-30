import { loadEnv } from '../env'

const env = loadEnv()

/**
 * Map a client voice preference key (sent on session.start → voice, or the
 * voice-sample route) to an ElevenLabs voice id. Defaults lean Australian/warm;
 * any of them can be overridden via env. Shared by the live bridge and the
 * /voice/sample preview route so the two never drift.
 */
export function resolveVoiceId(key?: string): string | undefined {
  switch (key) {
    case 'good':
      return env.ELEVENLABS_TUTOR_VOICE_ID ?? 'pFZP5JQG7iQjIQuC4Bku' // Lily — warm tutor
    case 'cute':
      return process.env.ELEVENLABS_VOICE_CUTE ?? 'jBpfuIE2acCO8z3wKNLl' // Gigi — bright/young
    case 'bright':
      return process.env.ELEVENLABS_VOICE_BRIGHT ?? 'EXAVITQu4vr4xnSDxMaL' // Bella — soft/warm
    case 'buddy':
      return process.env.ELEVENLABS_VOICE_BUDDY ?? 'TxGEqnHWrfWFTfGW9XjX' // Josh — easy-going male
    case 'story':
      return process.env.ELEVENLABS_VOICE_STORY ?? 'ThT5KcBeYPX3keUQqHPh' // Dorothy — gentle storyteller
    case 'real':
      return process.env.ELEVENLABS_VOICE_REAL ?? 'IKne3meq5aSn9XLyUdCD' // Charlie — Australian
    case 'anime':
      return process.env.ELEVENLABS_VOICE_ANIME ?? env.ELEVENLABS_VOICE_ID
    case 'normal':
    default:
      return env.ELEVENLABS_COMPANION_VOICE_ID ?? env.ELEVENLABS_VOICE_ID
  }
}
