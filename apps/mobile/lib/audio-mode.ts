import { setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio'

/**
 * Audio mode configuration for PAL voice.
 *
 * expo-audio v1.x AudioMode properties:
 *   playsInSilentMode  — false = respect iOS silent switch (default)
 *   allowsRecording    — true when mic is needed
 *   interruptionMode   — 'doNotMix' | 'duckOthers' | 'mixWithOthers'
 */

/**
 * Configure audio for PAL speech playback.
 * respectSilentSwitch: true  → silent switch mutes PAL (recommended)
 * respectSilentSwitch: false → PAL always speaks (explicit user action)
 */
export async function configureAudioForPlayback(
  respectSilentSwitch = true,
): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: !respectSilentSwitch,
      allowsRecording: false,
      interruptionMode: 'doNotMix',
    })
  } catch {
    // Non-fatal
  }
}

/**
 * Configure audio for recording (microphone input).
 */
export async function configureAudioForRecording(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      interruptionMode: 'doNotMix',
    })
  } catch {
    // Non-fatal
  }
}

/**
 * Request microphone permission.
 * Returns true if granted.
 */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const { granted } = await requestRecordingPermissionsAsync()
    return granted
  } catch {
    return false
  }
}
