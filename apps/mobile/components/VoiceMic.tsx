import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useAudioRecorder, RecordingPresets } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { Mic, MicOff } from 'lucide-react-native'
import { tokens } from '@/theme/tokens'
import { configureAudioForRecording, configureAudioForPlayback, requestMicPermission } from '@/lib/audio-mode'
import { api } from '@/lib/api'

/**
 * VoiceMic — hold-to-record voice input component.
 *
 * Hold the button → records audio via expo-audio useAudioRecorder hook
 * Release → sends to POST /chat/transcribe → returns text
 * onTranscript(text) is called with the transcribed text
 */

type Props = {
  onTranscript: (text: string) => void
  onError?: (err: string) => void
  disabled?: boolean
  size?: number
  color?: string
}

type RecordingState = 'idle' | 'recording' | 'processing' | 'no_permission'

export function VoiceMic({ onTranscript, onError, disabled, size = 24, color }: Props) {
  const [state, setState] = useState<RecordingState>('idle')
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)

  // Waveform animation — 3 bars that pulse while recording.
  const bar1 = useRef(new Animated.Value(0.3)).current
  const bar2 = useRef(new Animated.Value(0.6)).current
  const bar3 = useRef(new Animated.Value(0.4)).current
  const waveAnim = useRef<Animated.CompositeAnimation | null>(null)

  const iconColor = color ?? tokens.color.accent

  useEffect(() => {
    if (state === 'recording') {
      const animateBar = (val: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(val, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(val, { toValue: 0.2, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        )
      waveAnim.current = Animated.parallel([
        animateBar(bar1, 0),
        animateBar(bar2, 100),
        animateBar(bar3, 200),
      ])
      waveAnim.current.start()
    } else {
      waveAnim.current?.stop()
      bar1.setValue(0.3)
      bar2.setValue(0.6)
      bar3.setValue(0.4)
    }
  }, [state, bar1, bar2, bar3])

  const startRecording = async () => {
    if (disabled || state !== 'idle') return

    const hasPermission = await requestMicPermission()
    if (!hasPermission) {
      setState('no_permission')
      return
    }

    await configureAudioForRecording()

    try {
      await recorder.prepareToRecordAsync()
      recorder.record()
      setState('recording')
    } catch {
      onError?.('Could not start recording')
    }
  }

  const stopRecording = async () => {
    if (state !== 'recording') return
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

      // Read the file as base64 and send to Whisper.
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

  if (state === 'no_permission') {
    return (
      <View style={s.container}>
        <MicOff size={size} color={tokens.color.textMuted} strokeWidth={1.5} />
      </View>
    )
  }

  return (
    <Pressable
      style={[s.container, state === 'recording' && s.containerRecording]}
      onPressIn={startRecording}
      onPressOut={stopRecording}
      disabled={disabled || state === 'processing'}
      accessibilityLabel="Hold to speak"
      accessibilityRole="button"
      accessibilityHint="Hold to record, release to send"
    >
      {state === 'recording' ? (
        <View style={s.waveform}>
          {[bar1, bar2, bar3].map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                s.bar,
                { backgroundColor: iconColor, transform: [{ scaleY: bar }] },
              ]}
            />
          ))}
        </View>
      ) : state === 'processing' ? (
        <Text style={[s.processingDot, { color: iconColor }]}>···</Text>
      ) : (
        <Mic size={size} color={iconColor} strokeWidth={1.5} />
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  container: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  containerRecording: {
    backgroundColor: tokens.color.accent + '22',
    borderWidth: 1.5,
    borderColor: tokens.color.accent,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 20,
  },
  bar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  processingDot: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
})
