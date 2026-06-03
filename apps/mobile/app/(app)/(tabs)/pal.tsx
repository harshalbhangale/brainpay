import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCircle2, Send, Sparkles, X } from 'lucide-react-native'
import { api } from '@/lib/api'
import { VoiceMic } from '@/components/VoiceMic'
import { TypingBubble } from '@/components/ChatBubble'
import { CouncilCard, type PalLine } from '@/components/council'
import { TAB_BAR_TOTAL_HEIGHT } from '@/components/TabBar'
import { palSpeakAsync } from '@/lib/pal-speak'
import { useAuthStore } from '@/stores/auth'
import { kidTheme as tokens } from '@/theme/tokens'

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  pals?: PalLine[]
}

const KID_SUGGESTIONS = [
  "What's my balance?",
  "How far to my goal?",
  "Roast my last buy",
  "Should I buy a Coke?",
]

const PARENT_SUGGESTIONS = [
  "How are my kids doing?",
  "Add a chore for Jamie",
  "Top up Riley $10",
  "What did Jamie buy today?",
]

export default function PalTab() {
  const accountType = useAuthStore((s) => s.accountType)
  const role = accountType === 'kid' ? 'kid' : 'parent'
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const scrollRef = useRef<ScrollView>(null)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [optimistic, setOptimistic] = useState<Message[]>([])
  const [pendingIntent, setPendingIntent] = useState<{ kind: string; [k: string]: unknown } | null>(null)
  const [micListening, setMicListening] = useState(false)

  const thinkPulse = useRef(new Animated.Value(1)).current
  const thinkLoop = useRef<Animated.CompositeAnimation | null>(null)

  const { data: history } = useQuery({
    queryKey: ['chat-history'],
    queryFn: () => api<{ messages: Message[] }>('/chat/history'),
    staleTime: 30_000,
  })

  const messages = [...(history?.messages ?? []), ...optimistic]
  const suggestions = role === 'kid' ? KID_SUGGESTIONS : PARENT_SUGGESTIONS

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
  }, [messages.length, sending])

  useEffect(() => {
    if (sending) {
      thinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(thinkPulse, { toValue: 1.1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(thinkPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      )
      thinkLoop.current.start()
    } else {
      thinkLoop.current?.stop()
      thinkPulse.setValue(1)
    }
  }, [sending, thinkPulse])

  const send = async (text: string) => {
    if (!text.trim() || sending) return
    setInput('')
    setSending(true)
    setOptimistic((prev) => [...prev, { role: 'user', content: text.trim() }])

    try {
      const res = await api<{
        reply: string
        pals?: PalLine[]
        intent?: { kind: string; [k: string]: unknown }
        requiresConfirmation: boolean
      }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text.trim() }),
      })

      setOptimistic((prev) => [...prev, { role: 'assistant', content: res.reply, pals: res.pals }])
      palSpeakAsync(res.reply)

      if (res.requiresConfirmation && res.intent) {
        setPendingIntent(res.intent)
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['chat-history'] })
        setOptimistic([])
      }, 1500)
    } catch {
      setOptimistic((prev) => [
        ...prev,
        { role: 'assistant', content: "I'm offline right now. Try again?" },
      ])
    } finally {
      setSending(false)
    }
  }

  const executeIntent = async () => {
    if (!pendingIntent) return
    setPendingIntent(null)
    setSending(true)
    try {
      const res = await api<{ confirmationMessage: string }>('/chat/execute', {
        method: 'POST',
        body: JSON.stringify({ intent: pendingIntent }),
      })
      setOptimistic((prev) => [...prev, { role: 'assistant', content: res.confirmationMessage }])
      palSpeakAsync(res.confirmationMessage)
      queryClient.invalidateQueries({ queryKey: ['family'] })
      queryClient.invalidateQueries({ queryKey: ['chores'] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
    } catch {
      setOptimistic((prev) => [
        ...prev,
        { role: 'assistant', content: "Couldn't do that. Try again?" },
      ])
    } finally {
      setSending(false)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <Animated.View style={[s.palAvatarWrap, { transform: [{ scale: thinkPulse }] }]}>
            <LinearGradient
              colors={['#A855F7', '#7C3AED']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Sparkles size={20} color="#fff" strokeWidth={1.8} />
          </Animated.View>
          <View>
            <Text style={s.palName}>PAL</Text>
            <Text style={s.palStatus}>
              {sending ? 'Thinking...' : micListening ? 'Listening...' : 'Ready to help'}
            </Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: insets.bottom + 90 + TAB_BAR_TOTAL_HEIGHT },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isEmpty && (
            <View style={s.emptyState}>
              <View style={s.emptyAvatarWrap}>
                <LinearGradient
                  colors={['#A855F7', '#7C3AED']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Sparkles size={36} color="#fff" strokeWidth={1.5} />
              </View>
              <Text style={s.emptyTitle}>Hey, I'm PAL.</Text>
              <Text style={s.emptySubtitle}>
                {role === 'kid'
                  ? 'Ask me about your balance, goals, or what to buy.'
                  : 'Ask me about your kids, create chores, or top up.'}
              </Text>
              <View style={s.chips}>
                {suggestions.map((q) => (
                  <Pressable
                    key={q}
                    style={({ pressed }) => [s.chip, pressed && { opacity: 0.7 }]}
                    onPress={() => send(q)}
                  >
                    <Text style={s.chipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {sending && (
            <View style={s.typingRow}>
              <View style={s.typingAvatarWrap}>
                <LinearGradient
                  colors={['#A855F7', '#7C3AED']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Sparkles size={12} color="#fff" strokeWidth={2} />
              </View>
              <TypingBubble />
            </View>
          )}

          {pendingIntent && (
            <IntentCard
              intent={pendingIntent}
              onConfirm={executeIntent}
              onCancel={() => setPendingIntent(null)}
            />
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={[s.inputBar, { bottom: TAB_BAR_TOTAL_HEIGHT }]}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={micListening ? 'Listening...' : 'Message PAL...'}
            placeholderTextColor={micListening ? tokens.color.purple : tokens.color.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => {
              if (input.trim()) send(input)
            }}
            editable={!micListening}
          />

          {input.trim().length > 0 ? (
            <Pressable
              style={[s.sendBtn, sending && s.sendBtnDisabled]}
              onPress={() => send(input)}
              disabled={sending}
            >
              <LinearGradient
                colors={['#A855F7', '#7C3AED']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Send size={17} color="#fff" strokeWidth={2.5} />
            </Pressable>
          ) : (
            <VoiceMic
              onTranscript={(text) => send(text)}
              onError={() => {}}
              onStateChange={(state) => setMicListening(state === 'recording')}
              disabled={sending}
              size={20}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <View style={mb.userRow}>
        <View style={mb.userBubble}>
          <LinearGradient
            colors={['#A855F7', '#7C3AED']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Text style={mb.userText}>{message.content}</Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      {message.pals && message.pals.length > 0 && <CouncilCard pals={message.pals} />}
      <View style={mb.palRow}>
        <View style={mb.palAvatarSmall}>
          <LinearGradient
            colors={['#A855F7', '#7C3AED']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Sparkles size={11} color="#fff" strokeWidth={2} />
        </View>
        <View style={mb.palBubble}>
          <Text style={mb.palText}>{message.content}</Text>
        </View>
      </View>
    </View>
  )
}

const mb = StyleSheet.create({
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: tokens.spacing[3],
    paddingLeft: 60,
  },
  userBubble: {
    borderRadius: 20,
    borderBottomRightRadius: 4,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    maxWidth: '85%',
    overflow: 'hidden',
  },
  userText: {
    color: '#fff',
    fontSize: tokens.fontSize.md,
    fontWeight: '600',
    lineHeight: 22,
  },
  palRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing[2],
    marginBottom: tokens.spacing[3],
    paddingRight: 60,
  },
  palAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  palBubble: {
    backgroundColor: tokens.color.surface,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.color.surface2,
  },
  palText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
})

function IntentCard({
  intent,
  onConfirm,
  onCancel,
}: {
  intent: { kind: string; [k: string]: unknown }
  onConfirm: () => void
  onCancel: () => void
}) {
  const label = {
    add_chore: 'New Chore',
    topup: 'Top Up',
    set_goal: 'New Goal',
  }[intent.kind] ?? 'Action'

  let detail = ''
  if (intent.kind === 'add_chore') {
    detail = `"${intent.title}" for ${intent.kidName} · +${intent.rewardBrains} pts`
  } else if (intent.kind === 'topup') {
    detail = `$${((intent.brainsDelta as number) / 100).toFixed(2)} to ${intent.kidName}${intent.note ? ` — "${intent.note}"` : ''}`
  } else if (intent.kind === 'set_goal') {
    detail = `"${intent.goalName}" for ${intent.kidName} · ${intent.targetBrains} pts target`
  }

  return (
    <View style={ic.card}>
      <View style={ic.top}>
        <View style={ic.labelWrap}>
          <View style={ic.dot} />
          <Text style={ic.label}>{label}</Text>
        </View>
        <Pressable hitSlop={8} onPress={onCancel}>
          <X size={16} color={tokens.color.textMuted} strokeWidth={1.5} />
        </Pressable>
      </View>
      <Text style={ic.detail}>{detail}</Text>
      <Pressable style={ic.confirmBtn} onPress={onConfirm}>
        <LinearGradient
          colors={['#A855F7', '#7C3AED']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
        <CheckCircle2 size={16} color="#fff" strokeWidth={2} />
        <Text style={ic.confirmText}>Confirm</Text>
      </Pressable>
    </View>
  )
}

const ic = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
    borderWidth: 1,
    borderColor: tokens.color.purple + '40',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[2],
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.purple },
  label: { color: tokens.color.purple, fontSize: tokens.fontSize.xs, fontWeight: '800', letterSpacing: 0.8 },
  detail: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '600', lineHeight: 22, marginBottom: tokens.spacing[3] },
  confirmBtn: {
    height: 44,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: tokens.fontSize.sm },
})

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  palAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  palName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  palStatus: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 1 },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: tokens.spacing[8],
    paddingBottom: tokens.spacing[5],
    gap: tokens.spacing[3],
  },
  emptyAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: tokens.spacing[2],
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: tokens.spacing[4],
  },
  chips: {
    width: '100%',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[2],
  },
  chip: {
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.purple + '33',
  },
  chipText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing[2],
    marginBottom: tokens.spacing[3],
  },
  typingAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[3],
    paddingBottom: tokens.spacing[3],
    backgroundColor: tokens.color.bg,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: 11,
    backgroundColor: tokens.color.surface,
    borderRadius: 22,
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: tokens.color.surface2,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  sendBtnDisabled: { opacity: 0.5 },
})
