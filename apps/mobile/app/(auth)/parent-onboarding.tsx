import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PalAvatar, type PalState } from '@/components/PalAvatar'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { env } from '@/lib/env'
import { tokens } from '@/theme/tokens'

/**
 * Voice onboarding — PAL speaks via ElevenLabs TTS, user responds by tap/type.
 *
 * Each step:
 *   1. Generate the line (templated with name/etc.)
 *   2. POST /voice/onboard/speak → MP3 bytes
 *   3. Save to local file, play via expo-audio
 *   4. While speaking, avatar is in 'speaking' state
 *   5. When done, switch to 'idle' and show the input
 *
 * Steps:
 *   intro → name → avatar → style → outro → save → home
 */

type Step = 'intro' | 'name' | 'avatar' | 'style' | 'outro' | 'saving' | 'done'

const AVATARS = ['👩‍🦰', '👨', '👩', '👴', '👵', '🧑'] as const
const STYLES = [
  { id: 'chill', emoji: '😌', label: 'Chill', sample: '"Your money, your call."' },
  { id: 'balanced', emoji: '⚖️', label: 'Balanced', sample: '"Worth thinking about."' },
  { id: 'strict', emoji: '🔥', label: 'Strict', sample: '"Not a chance. Skip."' },
] as const

export default function ParentOnboarding() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setAccountType = useAuthStore((s) => s.setAccountType)

  const [step, setStep] = useState<Step>('intro')
  const [palState, setPalState] = useState<PalState>('idle')
  const [palText, setPalText] = useState('')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [style, setStyle] = useState<string | null>(null)

  const playerRef = useRef<AudioPlayer | null>(null)
  const fadeAnim = useRef(new Animated.Value(0)).current

  // Set up audio mode on mount
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => undefined)
    return () => {
      try {
        playerRef.current?.remove()
      } catch {
        // ignore
      }
    }
  }, [])

  // Trigger intro on mount
  useEffect(() => {
    speak("Hey! I'm PAL. I'll be your kid's money buddy. What should I call you?")
      .then(() => setStep('name'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fade in PAL text when it changes
  useEffect(() => {
    fadeAnim.setValue(0)
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [palText, fadeAnim])

  /** Fetch ElevenLabs MP3 from API and play it. Returns when audio finishes. */
  const speak = async (text: string): Promise<void> => {
    setPalText(text)
    setPalState('speaking')

    try {
      const audioUrl = `${env.apiBaseUrl}/voice/onboard/speak?text=${encodeURIComponent(text)}`

      // Stop and replace any existing player
      try {
        playerRef.current?.remove()
      } catch {
        // ignore
      }

      const player = createAudioPlayer({ uri: audioUrl })
      playerRef.current = player

      return new Promise<void>((resolve) => {
        const sub = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            sub.remove()
            setPalState('idle')
            resolve()
          }
        })
        // Small delay then play (gives the player time to load)
        setTimeout(() => {
          try {
            player.play()
          } catch (err) {
            console.warn('player_play_failed', err)
            setPalState('idle')
            resolve()
          }
        }, 100)

        // Safety timeout — don't hang forever if audio fails
        setTimeout(() => {
          sub.remove()
          setPalState('idle')
          resolve()
        }, 15000)
      })
    } catch (err) {
      console.warn('pal_speak_failed', err)
      // Continue silently — the text is already on screen
      setPalState('idle')
    }
  }

  // ─── Step handlers ───────────────────────────────────────────

  const submitName = async () => {
    if (!name.trim()) return
    Keyboard.dismiss()
    setStep('avatar')
    await speak(`Nice, ${name.trim()}! Pick a face that feels like you.`)
  }

  const submitAvatar = async (emoji: string) => {
    setAvatar(emoji)
    setStep('style')
    await speak('Last one. When your kid scans junk food, how savage should I be?')
  }

  const submitStyle = async (s: string) => {
    setStyle(s)
    setStep('outro')

    // Demo the style first
    const sample = STYLES.find((x) => x.id === s)
    if (sample) {
      await speak(`That sounds like: ${sample.sample.replace(/"/g, '')}`)
    }

    setStep('saving')
    await speak(`Got it. ${name.trim()}, ${s} vibes. Setting things up...`)

    await saveToDB({ name: name.trim(), avatar: avatar!, style: s })
  }

  const saveToDB = async (persona: { name: string; avatar: string; style: string }) => {
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'parent', persona }),
      })
      setAccountType('parent')
      setStep('done')
      setPalState('celebrating')
      await speak(`All set! Let's build your family, ${persona.name}.`)
      router.replace('/(app)/parent')
    } catch (err) {
      console.error('onboarding_save_failed', err)
      setAccountType('parent')
      router.replace('/(app)/parent')
    }
  }

  const fallbackToText = () => {
    try {
      playerRef.current?.remove()
    } catch {
      // ignore
    }
    router.replace('/(auth)/parent-persona')
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
        {/* PAL Avatar */}
        <View style={s.avatarSection}>
          <PalAvatar state={palState} accent={tokens.color.accent} size={140} />
        </View>

        {/* PAL speech bubble */}
        {palText ? (
          <Animated.View style={[s.speechBubble, { opacity: fadeAnim }]}>
            <Text style={s.speechText}>{palText}</Text>
          </Animated.View>
        ) : null}

        {/* Step-specific input */}
        <View style={s.inputArea}>
          {step === 'name' && palState === 'idle' && (
            <View style={s.nameRow}>
              <TextInput
                style={s.nameInput}
                placeholder="Your name"
                placeholderTextColor={tokens.color.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={submitName}
              />
              <Pressable
                style={[s.nameBtn, !name.trim() && s.nameBtnDisabled]}
                onPress={submitName}
                disabled={!name.trim()}
              >
                <Text style={[s.nameBtnText, !name.trim() && s.nameBtnTextDisabled]}>→</Text>
              </Pressable>
            </View>
          )}

          {step === 'avatar' && palState === 'idle' && (
            <View style={s.avatarGrid}>
              {AVATARS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={({ pressed }) => [s.avatarItem, pressed && s.avatarItemPressed]}
                  onPress={() => submitAvatar(emoji)}
                >
                  <Text style={s.avatarEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {step === 'style' && palState === 'idle' && (
            <View style={s.styleList}>
              {STYLES.map((opt) => (
                <Pressable
                  key={opt.id}
                  style={({ pressed }) => [s.styleCard, pressed && s.styleCardPressed]}
                  onPress={() => submitStyle(opt.id)}
                >
                  <Text style={s.styleEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.styleLabel}>{opt.label}</Text>
                    <Text style={s.styleSample}>{opt.sample}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {step !== 'saving' && step !== 'done' && (
            <Pressable hitSlop={12} onPress={fallbackToText}>
              <Text style={s.skipText}>Skip voice setup</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: tokens.spacing[5],
    alignItems: 'center',
  },
  avatarSection: {
    marginTop: tokens.spacing[4],
    alignItems: 'center',
  },
  speechBubble: {
    marginTop: tokens.spacing[4],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[4],
    maxWidth: '95%',
    borderWidth: 1,
    borderColor: tokens.color.surface2,
  },
  speechText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  inputArea: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    paddingVertical: tokens.spacing[5],
  },
  nameRow: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
  },
  nameInput: {
    flex: 1,
    height: 60,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[5],
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  nameBtn: {
    width: 60,
    height: 60,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBtnDisabled: { backgroundColor: tokens.color.surface2 },
  nameBtnText: { fontSize: 28, color: '#000', fontWeight: '900' },
  nameBtnTextDisabled: { color: tokens.color.textMuted },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: tokens.spacing[3],
  },
  avatarItem: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarItemPressed: {
    transform: [{ scale: 0.94 }],
    borderColor: tokens.color.accent,
    backgroundColor: tokens.color.surface2,
  },
  avatarEmoji: { fontSize: 40 },
  styleList: { gap: tokens.spacing[3] },
  styleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleCardPressed: {
    transform: [{ scale: 0.98 }],
    borderColor: tokens.color.accent,
  },
  styleEmoji: { fontSize: 32 },
  styleLabel: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  styleSample: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: 2, fontStyle: 'italic' },
  footer: {
    paddingBottom: tokens.spacing[3],
    alignItems: 'center',
  },
  skipText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
})
