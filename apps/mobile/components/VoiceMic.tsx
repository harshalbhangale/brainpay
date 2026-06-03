import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
} from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { Mic, MicOff } from 'lucide-react-native'
import { kidTheme as tokens } from '@/theme/tokens'
import {
  configureAudioForRecording,
  configureAudioForPlayback,
  requestMicPermission,
} from '@/lib/audio-mode'
import { api } from '@/lib/api'

/**
 * VoiceMic — tap-to-speak with automatic silence detection.
 *
 * Tap once → starts recording
 * Silence for 1.5s → auto-stops and sends to Whisper
 * Tap again while recording → manual stop
 *
 * No holding required. Works like ChatGPT voice mode.
 */

type Props = {
  onTranscript: (text: string) => void
  onError?: (err: string) => void
  onStateChange?: (state: RecordingState) => void
  disabled?: boolean
  size?: number
  /** Large mode — shows a big pulsing circle (for voice-first screens) */
  large?: boolean
}

export type RecordingState = 'idle' | 'recording' | 'processing' | 'no_permission'

// Silence detection config
const SILENCE_DB = -45          // dB threshold — below this = silence
const SILENCE_TIMEOUT_MS = 1500 // stop after 1.5s of silence
const MIN_RECORDING_MS = 600    // don't stop before 600ms (avoid false triggers)

export function VoiceMic({ onTranscript, onError, onStateChange, disabled, size = 22, large }: Props) {
  const [state, setState] = useState<RecordingState>('idle')
  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
  )
  const recState = useAudioRecorderState(recorder, 80) // poll every 80ms for VAD

  const silenceStartRef = useRef<number | null>(null)
  const recordingStartRef = useRef<number>(0)
  const stoppingRef = useRef(false)

  // Waveform bars
  const bars = [
    useRef(new Animated.Value(0.2)).current,
    useRef(new Animated.Value(0.5)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.7)).current,
    useRef(new Animated.Value(0.4)).current,
  ]
  const waveAnim = useRef<Animated.CompositeAnimation | null>(null)

  // Pulse for large mode
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    onStateChange?.(state)
  }, [state, onStateChange])

  // Waveform animation while recording
  useEffect(() => {
    if (state === 'recording') {
      const animateBar = (val: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(val, {
              toValue: 1,
              duration: 250 + Math.random() * 150,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(val, {
              toValue: 0.15,
              duration: 250 + Math.random() * 150,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        )
      waveAnim.current = Animated.parallel(bars.map((b, i) => animateBar(b, i * 60)))
      waveAnim.current.start()

      // Pulse for large mode
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start()
    } else {
      waveAnim.current?.stop()
      bars.forEach((b, i) => b.setValue([0.2, 0.5, 0.3, 0.7, 0.4][i]))
      pulse.stopAnimation()
      pulse.setValue(1)
    }
  }, [state])

  // VAD — runs on every metering update while recording
  useEffect(() => {
    if (state !== 'recording' || !recState.isRecording || stoppingRef.current) return

    const meter = recState.metering ?? -160
    const elapsed = Date.now() - recordingStartRef.current

    if (elapsed < MIN_RECORDING_MS) return

    if (meter < SILENCE_DB) {
      if (silenceStartRef.current === null) {
        silenceStartRef.current = Date.now()
      } else if (Date.now() - silenceStartRef.current >= SILENCE_TIMEOUT_MS) {
        void stopAndProcess()
      }
    } else {
      silenceStartRef.current = null
    }

    // Hard cap at 30s
    if (elapsed >= 30_000) {
      void stopAndProcess()
    }
  }, [recState.metering, recState.isRecording, state])

  const startRecording = async () => {
    if (disabled || state !== 'idle') return

    const ok = await requestMicPermission()
    if (!ok) {
      setState('no_permission')
      return
    }

    await configureAudioForRecording()
    stoppingRef.current = false
    silenceStartRef.current = null

    try {
      await recorder.prepareToRecordAsync()
      recorder.record()
      recordingStartRef.current = Date.now()
      setState('recording')
    } catch {
      onError?.('Could not start recording')
    }
  }

  const stopAndProcess = async () => {
    if (stoppingRef.current || state !== 'recording') return
    stoppingRef.current = true
    setState('processing')

    try {
      await recorder.stop()
      const uri = recorder.uri
      await configureAudioForPlayback()

      if (!uri) {
        onError?.('No audio recorded')
        setState('idle')
        return
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      const result = await api<{ text: string }>('/chat/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/m4a' }),
      })

      if (result.text) {
        onTranscript(result.text)
      } else {
        onError?.('No speech detected')
      }
    } catch {
      onError?.('Transcription failed')
    } finally {
      setState('idle')
    }
  }

  const handlePress = () => {
    if (state === 'idle') {
      void startRecording()
    } else if (state === 'recording') {
      void stopAndProcess()
    }
  }

  if (state === 'no_permission') {
    return (
      <View style={large ? ls.container : s.container}>
        <MicOff size={large ? 28 : size} color={tokens.color.textMuted} strokeWidth={1.5} />
      </View>
    )
  }

  // ── Large mode (voice-first screen) ──────────────────────────────
  if (large) {
    const isRecording = state === 'recording'
    const isProcessing = state === 'processing'
    return (
      <Pressable onPress={handlePress} disabled={disabled || isProcessing}>
        <Animated.View style={[ls.container, isRecording && ls.containerActive, { transform: [{ scale: pulse }] }]}>
          {isRecording ? (
            <View style={ls.waveform}>
              {bars.map((bar, i) => (
                <Animated.View
                  key={i}
                  style={[ls.bar, { transform: [{ scaleY: bar }] }]}
                />
              ))}
            </View>
          ) : isProcessing ? (
            <View style={ls.waveform}>
              {bars.map((_, i) => (
                <View key={i} style={[ls.bar, { opacity: 0.3 }]} />
              ))}
            </View>
          ) : (
            <Mic size={28} color={tokens.color.text} strokeWidth={2} />
          )}
        </Animated.View>
      </Pressable>
    )
  }

  // ── Compact mode (chat input bar) ─────────────────────────────────
  return (
    <Pressable
      style={[s.container, state === 'recording' && s.containerActive]}
      onPress={handlePress}
      disabled={disabled || state === 'processing'}
      accessibilityLabel={state === 'recording' ? 'Tap to stop' : 'Tap to speak'}
      accessibilityRole="button"
    >
      {state === 'recording' ? (
        <View style={s.waveform}>
          {bars.slice(0, 3).map((bar, i) => (
            <Animated.View
              key={i}
              style={[s.bar, { transform: [{ scaleY: bar }] }]}
            />
          ))}
        </View>
      ) : state === 'processing' ? (
        <View style={s.waveform}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.bar, { opacity: 0.3 }]} />
          ))}
        </View>
      ) : (
        <Mic size={size} color={tokens.color.accent} strokeWidth={1.5} />
      )}
    </Pressable>
  )
}

// Compact styles
const s = StyleSheet.create({
  container: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  containerActive: {
    backgroundColor: tokens.color.accent + '20',
    borderWidth: 1.5,
    borderColor: tokens.color.accent,
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 },
  bar: { width: 3, height: 16, borderRadius: 2, backgroundColor: tokens.color.accent },
})

// Large styles
const ls = StyleSheet.create({
  container: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface2,
    borderWidth: 1.5,
    borderColor: tokens.color.surface2,
  },
  containerActive: {
    backgroundColor: tokens.color.accent,
    borderColor: tokens.color.accent,
    shadowColor: tokens.color.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28 },
  bar: { width: 4, height: 24, borderRadius: 2, backgroundColor: '#000' },
})
