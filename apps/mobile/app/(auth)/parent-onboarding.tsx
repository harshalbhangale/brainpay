import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatBubble, TypingBubble } from '@/components/ChatBubble'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { env } from '@/lib/env'
import { tokens } from '@/theme/tokens'

/**
 * Voice onboarding — chat-style.
 * PAL drops messages from the left. User taps avatars / styles, types a name.
 * User responses appear as messages on the right. ElevenLabs voice plays
 * over each PAL message.
 */

const AVATARS = ['👩‍🦰', '👨', '👩', '👴', '👵', '🧑'] as const
const STYLES = [
  { id: 'chill', emoji: '😌', label: 'Chill', sample: '"Your money, your call."' },
  { id: 'balanced', emoji: '⚖️', label: 'Balanced', sample: '"Worth thinking about."' },
  { id: 'strict', emoji: '🔥', label: 'Strict', sample: '"Not a chance. Skip."' },
] as const

type Msg =
  | { id: string; from: 'pal'; text: string; attachment?: 'avatars' | 'styles' | 'name-input' }
  | { id: string; from: 'user'; text: string }
  | { id: string; from: 'typing' }

let nextId = 1
const newId = () => `m${nextId++}`

export default function ParentOnboarding() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setAccountType = useAuthStore((s) => s.setAccountType)

  const [messages, setMessages] = useState<Msg[]>([])
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [style, setStyle] = useState<string | null>(null)
  const [step, setStep] = useState<'name' | 'avatar' | 'style' | 'saving' | 'done'>('name')

  const playerRef = useRef<AudioPlayer | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)

  // Audio setup
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => undefined)
    return () => {
      try { playerRef.current?.remove() } catch { /* ignore */ }
    }
  }, [])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    return () => clearTimeout(t)
  }, [messages])

  // Kick off the conversation
  useEffect(() => {
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = async () => {
    await palSays("Hey! I'm PAL. I'll be your kid's money buddy.", 600)
    await palSays('What should I call you?', 400, 'name-input')
  }

  /** Add a typing bubble, play voice, then replace it with the actual message. */
  const palSays = async (
    text: string,
    typingDelay = 700,
    attachment?: 'avatars' | 'styles' | 'name-input',
  ) => {
    const typingId = newId()
    setMessages((prev) => [...prev, { id: typingId, from: 'typing' }])

    // Start playing voice in parallel
    void playVoice(text)

    // Wait for typing illusion
    await new Promise((r) => setTimeout(r, typingDelay))

    setMessages((prev) =>
      prev
        .filter((m) => m.id !== typingId)
        .concat({ id: newId(), from: 'pal', text, attachment }),
    )
  }

  /** Add a user message bubble. */
  const userSays = (text: string) => {
    setMessages((prev) => [...prev, { id: newId(), from: 'user', text }])
  }

  const playVoice = async (text: string) => {
    try {
      const audioUrl = `${env.apiBaseUrl}/voice/onboard/speak?text=${encodeURIComponent(text)}`
      try { playerRef.current?.remove() } catch { /* ignore */ }
      const player = createAudioPlayer({ uri: audioUrl })
      playerRef.current = player
      setTimeout(() => {
        try { player.play() } catch { /* ignore */ }
      }, 50)
    } catch {
      // Silent fallback — text already shows
    }
  }

  // ─── Step handlers ──────────────────────────────────────

  const submitName = async () => {
    const n = name.trim()
    if (!n) return
    userSays(n)
    setStep('avatar')
    await palSays(`Nice, ${n}!`, 500)
    await palSays('Pick a face that feels like you.', 400, 'avatars')
  }

  const submitAvatar = async (emoji: string) => {
    setAvatar(emoji)
    userSays(emoji)
    setStep('style')
    await palSays('Last one.', 400)
    await palSays('When your kid scans junk food, how savage should I be?', 600, 'styles')
  }

  const submitStyle = async (s: string) => {
    setStyle(s)
    const opt = STYLES.find((x) => x.id === s)
    userSays(opt ? `${opt.emoji} ${opt.label}` : s)
    setStep('saving')

    if (opt) {
      await palSays(`That sounds like: ${opt.sample.replace(/"/g, '')}`, 800)
    }
    await palSays(`Got it. ${name.trim()}, ${s} vibes.`, 600)
    await palSays(`Setting things up... 🎉`, 500)

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
      await palSays(`All set! Let's build your family.`, 500)
      setTimeout(() => router.replace('/(app)/parent'), 1500)
    } catch (err) {
      console.error('onboarding_save_failed', err)
      setAccountType('parent')
      router.replace('/(app)/parent')
    }
  }

  const fallbackToText = () => {
    try { playerRef.current?.remove() } catch { /* ignore */ }
    router.replace('/(auth)/parent-persona')
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[3] }]}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>PAL</Text>
          <Text style={s.headerSub}>online · just now</Text>
        </View>

        {/* Chat */}
        <ScrollView
          ref={scrollRef}
          style={s.chat}
          contentContainerStyle={s.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m) => {
            if (m.from === 'typing') {
              return <TypingBubble key={m.id} />
            }
            if (m.from === 'pal') {
              return (
                <ChatBubble
                  key={m.id}
                  from="pal"
                  attachment={
                    m.attachment === 'avatars' ? (
                      <View style={s.avatarGrid}>
                        {AVATARS.map((emoji) => (
                          <Pressable
                            key={emoji}
                            style={({ pressed }) => [s.avatarItem, pressed && s.itemPressed]}
                            onPress={() => submitAvatar(emoji)}
                          >
                            <Text style={s.avatarEmoji}>{emoji}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : m.attachment === 'styles' ? (
                      <View style={s.styleList}>
                        {STYLES.map((opt) => (
                          <Pressable
                            key={opt.id}
                            style={({ pressed }) => [s.styleCard, pressed && s.itemPressed]}
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
                    ) : null
                  }
                >
                  {m.text}
                </ChatBubble>
              )
            }
            return <ChatBubble key={m.id} from="user">{m.text}</ChatBubble>
          })}
        </ScrollView>

        {/* Bottom bar — name input or skip */}
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + tokens.spacing[3] }]}>
          {step === 'name' ? (
            <View style={s.nameRow}>
              <TextInput
                style={s.nameInput}
                placeholder="Type your name..."
                placeholderTextColor={tokens.color.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={20}
                returnKeyType="send"
                onSubmitEditing={submitName}
              />
              <Pressable
                style={[s.sendBtn, !name.trim() && s.sendBtnDisabled]}
                onPress={submitName}
                disabled={!name.trim()}
              >
                <Text style={[s.sendBtnText, !name.trim() && s.sendBtnTextDisabled]}>↑</Text>
              </Pressable>
            </View>
          ) : step !== 'saving' && step !== 'done' ? (
            <Pressable hitSlop={12} onPress={fallbackToText}>
              <Text style={s.skipText}>Skip voice setup</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg },
  header: {
    paddingHorizontal: tokens.spacing[5],
    paddingBottom: tokens.spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.surface2,
    alignItems: 'center',
  },
  headerTitle: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '900',
  },
  headerSub: {
    color: tokens.color.accent,
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  chat: { flex: 1 },
  chatContent: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
    paddingBottom: tokens.spacing[4],
  },
  bottomBar: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.surface2,
    backgroundColor: tokens.color.bg,
  },
  nameRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    height: 48,
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '500',
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: tokens.color.surface2 },
  sendBtnText: { color: '#000', fontSize: 24, fontWeight: '900' },
  sendBtnTextDisabled: { color: tokens.color.textMuted },
  skipText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: tokens.spacing[2],
  },

  // Avatar grid attachment
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
    justifyContent: 'flex-start',
  },
  avatarItem: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 28 },

  // Style cards attachment
  styleList: { gap: tokens.spacing[2] },
  styleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface2,
    padding: tokens.spacing[3],
    borderRadius: 14,
  },
  styleEmoji: { fontSize: 26 },
  styleLabel: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  styleSample: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2, fontStyle: 'italic' },

  itemPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.8,
  },
})
