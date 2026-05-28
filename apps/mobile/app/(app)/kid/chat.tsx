import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, CheckCircle2, Send, X } from 'lucide-react-native'
import { api } from '@/lib/api'
import { VoiceMic } from '@/components/VoiceMic'
import { TypingBubble } from '@/components/ChatBubble'
import { palSpeakAsync } from '@/lib/pal-speak'
import { tokens } from '@/theme/tokens'

/**
 * PAL Chat — redesigned.
 *
 * Layout:
 *   - PAL avatar + name at top
 *   - Messages scroll in the middle
 *   - Input bar at bottom: text field + mic (tap-to-speak VAD)
 *
 * Mic: tap once → auto-listens → auto-stops on silence → sends
 * No holding required.
 */

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
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
  "Top up Riley 100 Brains",
  "What did Jamie buy today?",
]

export default function KidChat() {
  return <ChatScreen role="kid" />
}

export function ChatScreen({ role }: { role: 'kid' | 'parent' }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const scrollRef = useRef<ScrollView>(null)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [optimistic, setOptimistic] = useState<Message[]>([])
  const [pendingIntent, setPendingIntent] = useState<{ kind: string; [k: string]: unknown } | null>(null)
  const [micListening, setMicListening] = useState(false)

  // PAL avatar pulse while thinking
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
          Animated.timing(thinkPulse, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(thinkPulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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
        intent?: { kind: string; [k: string]: unknown }
        requiresConfirmation: boolean
      }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text.trim() }),
      })

      setOptimistic((prev) => [...prev, { role: 'assistant', content: res.reply }])
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

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.header}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
          </Pressable>

          {/* PAL identity */}
          <View style={s.palIdentity}>
            <Animated.View style={[s.palAvatar, { transform: [{ scale: thinkPulse }] }]}>
              <Text style={s.palAvatarChar}>P</Text>
            </Animated.View>
            <View>
              <Text style={s.palName}>PAL</Text>
              <Text style={s.palStatus}>
                {sending ? 'Thinking...' : micListening ? 'Listening...' : 'Ready'}
              </Text>
            </View>
          </View>

          <View style={{ width: 24 }} />
        </View>

        {/* ── Messages ───────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty state — suggestion chips */}
          {isEmpty && (
            <View style={s.emptyState}>
              <View style={s.emptyAvatar}>
                <Text style={s.emptyAvatarChar}>P</Text>
              </View>
              <Text style={s.emptyTitle}>Hey, I'm PAL.</Text>
              <Text style={s.emptySubtitle}>
                {role === 'kid'
                  ? 'Ask me about your balance, goals, or what to buy.'
                  : 'Ask me about your kids, create chores, or top up.'}
              </Text>
              <View style={s.chips}>
                {suggestions.map((q) => (
                  <Pressable key={q} style={s.chip} onPress={() => send(q)}>
                    <Text style={s.chipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Message bubbles */}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {/* Typing indicator */}
          {sending && (
            <View style={s.typingRow}>
              <View style={s.typingAvatar}>
                <Text style={s.typingAvatarChar}>P</Text>
              </View>
              <TypingBubble />
            </View>
          )}

          {/* Intent confirmation card */}
          {pendingIntent && (
            <IntentCard
              intent={pendingIntent}
              onConfirm={executeIntent}
              onCancel={() => setPendingIntent(null)}
            />
          )}
        </ScrollView>

        {/* ── Input bar ──────────────────────────────────────────── */}
        <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={micListening ? 'Listening...' : 'Message PAL...'}
            placeholderTextColor={micListening ? tokens.color.accent : tokens.color.textMuted}
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
              <Send size={18} color="#000" strokeWidth={2.5} />
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

// ─── Message bubble ───────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <View style={mb.userRow}>
        <View style={mb.userBubble}>
          <Text style={mb.userText}>{message.content}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={mb.palRow}>
      <View style={mb.palAvatarSmall}>
        <Text style={mb.palAvatarChar}>P</Text>
      </View>
      <View style={mb.palBubble}>
        <Text style={mb.palText}>{message.content}</Text>
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
    backgroundColor: tokens.color.accent,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    maxWidth: '85%',
  },
  userText: {
    color: '#000',
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
    backgroundColor: tokens.color.purple,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  palAvatarChar: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  palBubble: {
    backgroundColor: tokens.color.surface,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    flex: 1,
  },
  palText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
  },
})

// ─── Intent confirmation card ─────────────────────────────────────────
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
    detail = `${intent.brainsDelta} pts to ${intent.kidName}${intent.note ? ` — "${intent.note}"` : ''}`
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
        <CheckCircle2 size={16} color="#000" strokeWidth={2} />
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
    borderColor: tokens.color.accent + '40',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing[2],
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.accent },
  label: { color: tokens.color.accent, fontSize: tokens.fontSize.xs, fontWeight: '800', letterSpacing: 0.8 },
  detail: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '600', lineHeight: 22, marginBottom: tokens.spacing[3] },
  confirmBtn: {
    height: 44,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.sm },
})

// ─── Styles ───────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  palIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  palAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  palAvatarChar: { color: '#fff', fontSize: 18, fontWeight: '900' },
  palName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  palStatus: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 1 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: tokens.spacing[8],
    paddingBottom: tokens.spacing[5],
    gap: tokens.spacing[3],
  },
  emptyAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.color.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: tokens.spacing[2],
  },
  emptyAvatarChar: { color: '#fff', fontSize: 32, fontWeight: '900' },
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
    borderColor: tokens.color.surface2,
  },
  chipText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },

  // Typing row
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing[2],
    marginBottom: tokens.spacing[3],
  },
  typingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingAvatarChar: { color: '#fff', fontSize: 12, fontWeight: '900' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[3],
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
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.5 },
})
