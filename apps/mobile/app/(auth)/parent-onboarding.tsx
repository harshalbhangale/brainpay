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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { env } from '@/lib/env'
import { tokens } from '@/theme/tokens'

/**
 * Voice onboarding — PAL speaks (via WebSocket to OpenAI Realtime API),
 * user responds by tapping/typing. PAL's audio plays through the speaker;
 * user input is tap-based for reliability (voice input is Phase 2).
 *
 * Steps:
 *   1. PAL greets + asks name → user types name
 *   2. PAL asks avatar → user taps emoji
 *   3. PAL asks style → user taps card
 *   4. PAL confirms → auto-saves → routes to parent home
 */

type Step = 'connecting' | 'name' | 'avatar' | 'style' | 'confirming' | 'done' | 'error'

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

  const [step, setStep] = useState<Step>('connecting')
  const [palText, setPalText] = useState('')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [style, setStyle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null)
  const pulseAnim = useRef(new Animated.Value(1)).current

  // Pulse animation for PAL avatar
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [pulseAnim])

  // Connect WebSocket
  useEffect(() => {
    const accountId = useAuthStore.getState().accountId
    const wsUrl = env.wsUrl.replace('/live', '') + `/voice/onboard?accountId=${accountId ?? ''}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setPalText('Connecting to PAL...')
    }

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      try {
        const msg = JSON.parse(event.data) as { type: string; text?: string; persona?: { name: string; avatar: string; style: string } }
        handleMessage(msg)
      } catch {
        // ignore non-JSON
      }
    }

    ws.onerror = () => {
      setError('Could not connect to PAL. Check your network.')
      setStep('error')
    }

    ws.onclose = () => {
      if (step !== 'done' && step !== 'error') {
        // If we haven't finished, allow text fallback
      }
    }

    return () => {
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMessage = (msg: { type: string; text?: string; persona?: { name: string; avatar: string; style: string } }) => {
    switch (msg.type) {
      case 'session.ready':
        setStep('name')
        setPalText("Hey! I'm PAL. I'll be your kid's money buddy. What should I call you?")
        break

      case 'transcript.delta':
        setPalText((prev) => prev + (msg.text ?? ''))
        break

      case 'transcript.done':
        setPalText(msg.text ?? '')
        break

      case 'persona.saved':
        if (msg.persona) {
          saveToDB(msg.persona)
        }
        break

      case 'session.ended':
        setStep('done')
        break

      case 'error':
        setError(msg.text ?? 'Something went wrong.')
        setStep('error')
        break
    }
  }

  const submitName = () => {
    if (!name.trim()) return
    Keyboard.dismiss()
    wsRef.current?.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: `My name is ${name.trim()}.` }],
      },
    }))
    wsRef.current?.send(JSON.stringify({ type: 'response.create' }))
    setStep('avatar')
    setPalText(`Nice, ${name.trim()}! Pick a face that feels like you.`)
  }

  const submitAvatar = (emoji: string) => {
    setAvatar(emoji)
    wsRef.current?.send(JSON.stringify({ type: 'avatar.selected', avatar: emoji }))
    setStep('style')
    setPalText('Last one — when your kid scans junk food, how savage should I be?')
  }

  const submitStyle = (s: string) => {
    setStyle(s)
    wsRef.current?.send(JSON.stringify({ type: 'style.selected', style: s }))
    setStep('confirming')
    setPalText(`Got it. ${name.trim()}, ${s} vibes. Setting things up...`)
  }

  const saveToDB = async (persona: { name: string; avatar: string; style: string }) => {
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'parent', persona }),
      })
      setAccountType('parent')
      setStep('done')
      setPalText(`All set! Let's build your family, ${persona.name}.`)
      setTimeout(() => router.replace('/(app)/parent'), 2000)
    } catch (err) {
      console.error('onboarding_save_failed', err)
      // Save locally and proceed anyway
      setAccountType('parent')
      router.replace('/(app)/parent')
    }
  }

  // If WebSocket doesn't connect within 5s, auto-save with what we have
  useEffect(() => {
    if (step === 'confirming' && name && avatar && style) {
      const timeout = setTimeout(() => {
        // If PAL hasn't called save_persona via function call, do it ourselves
        saveToDB({ name: name.trim(), avatar, style })
      }, 5000)
      return () => clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, name, avatar, style])

  const fallbackToText = () => {
    wsRef.current?.close()
    router.replace('/(auth)/parent-persona')
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
        {/* PAL Avatar */}
        <Animated.View style={[s.palBubble, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={s.palEmoji}>🤖</Text>
        </Animated.View>

        {/* PAL speech bubble */}
        {palText ? (
          <View style={s.speechBubble}>
            <Text style={s.speechText}>{palText}</Text>
          </View>
        ) : null}

        {/* Step-specific input */}
        <View style={s.inputArea}>
          {step === 'name' && (
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
                <Text style={s.nameBtnText}>→</Text>
              </Pressable>
            </View>
          )}

          {step === 'avatar' && (
            <View style={s.avatarGrid}>
              {AVATARS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={s.avatarItem}
                  onPress={() => submitAvatar(emoji)}
                >
                  <Text style={s.avatarEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {step === 'style' && (
            <View style={s.styleList}>
              {STYLES.map((opt) => (
                <Pressable
                  key={opt.id}
                  style={s.styleCard}
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

          {step === 'confirming' && (
            <View style={s.confirmRow}>
              <Text style={s.confirmEmoji}>{avatar}</Text>
              <Text style={s.confirmName}>{name.trim()}</Text>
              <Text style={s.confirmStyle}>{style} vibes</Text>
            </View>
          )}

          {step === 'done' && (
            <View style={s.confirmRow}>
              <Text style={s.doneEmoji}>✨</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {step !== 'done' && step !== 'confirming' && (
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
  palBubble: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: tokens.color.accent,
    marginTop: tokens.spacing[5],
  },
  palEmoji: { fontSize: 48 },
  speechBubble: {
    marginTop: tokens.spacing[4],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    maxWidth: '90%',
  },
  speechText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
    textAlign: 'center',
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
    height: 56,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
  },
  nameBtn: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBtnDisabled: { backgroundColor: tokens.color.surface2 },
  nameBtnText: { fontSize: 24, color: '#000', fontWeight: '800' },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: tokens.spacing[3],
  },
  avatarItem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarEmoji: { fontSize: 36 },
  styleList: { gap: tokens.spacing[3] },
  styleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
  },
  styleEmoji: { fontSize: 28 },
  styleLabel: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  styleSample: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: 2, fontStyle: 'italic' },
  confirmRow: { alignItems: 'center', gap: tokens.spacing[2] },
  confirmEmoji: { fontSize: 64 },
  confirmName: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  confirmStyle: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md },
  doneEmoji: { fontSize: 80 },
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
