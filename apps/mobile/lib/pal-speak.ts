import * as FileSystem from 'expo-file-system/legacy'
import { createAudioPlayer } from 'expo-audio'
import { configureAudioForPlayback } from './audio-mode'
import { env } from './env'
import { getStoredToken } from '@/stores/auth'

/**
 * PAL TTS playback — fetches audio from the API and plays it.
 *
 * Uses GET /voice/onboard/speak?text=... (existing endpoint).
 * Caches the audio file locally so repeated plays are instant.
 *
 * Returns a cleanup function that stops playback.
 */

export async function palSpeak(text: string): Promise<() => void> {
  await configureAudioForPlayback(true) // respect silent switch

  const cacheKey = text.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const cachePath = `${FileSystem.cacheDirectory}pal_${cacheKey}.mp3`

  let audioUri = cachePath

  // Check cache first.
  const info = await FileSystem.getInfoAsync(cachePath)
  if (!info.exists) {
    const token = await getStoredToken()
    const url = `${env.apiBaseUrl}/voice/onboard/speak?text=${encodeURIComponent(text)}`
    const result = await FileSystem.downloadAsync(url, cachePath, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    audioUri = result.uri
  }

  const player = createAudioPlayer({ uri: audioUri })
  player.play()

  return () => {
    try { player.remove() } catch { /* ignore */ }
  }
}

/**
 * Fire-and-forget PAL speech. Returns a stop function.
 */
export function palSpeakAsync(text: string): () => void {
  let stop = () => {}
  palSpeak(text).then((s) => { stop = s }).catch(() => {})
  return () => stop()
}
