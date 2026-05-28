import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
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
import { ArrowLeft, Send } from 'lucide-react-native'
import { api } from '@/lib/api'
import { ChatBubble, TypingBubble, VoiceMic } from '@/components'
import { palSpeakAsync } from '@/lib/pal-speak'
import { tokens } from '@/theme/tokens'

/**
 * Kid PAL chat — text + voice with PAL.
 *
 * Suggestion chips on first open. Hold mic to speak.
 * PAL response is shown as text + spoken via TTS (respects silent switch).
 */

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  "What's my balance?",
  "How far to my goal?",
  "Roast my last buy",
  "Should I buy a Coke?",
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

  const { data: history } = useQuery({
    queryKey: ['chat-history'],
    queryFn: () => api<{ messages: Message[] }>('/chat/history'),
    staleTime: 30_000,
  })

  const messages = [...(history?.messages ?? []), ...optimistic]

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages.length])

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

      // Speak the reply (silent switch respected).
      palSpeakAsync(res.reply)

      if (res.requiresConfirmation && res.intent) {
        setPendingIntent(res.intent)
      }

      // Refresh server-side history.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['chat-history'] })
        setOptimistic([])
      }, 1500)
    } catch {
      setOptimistic((prev) => [...prev, { role: 'assistant', content: "I'm offline right now. Try again?" }])
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
      setOptimistic((prev) => [...prev, { role: 'assistant', content: "Couldn't do that one. Try again?" }])
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
          </Pressable>
          <Text style={s.title}>PAL</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && role === 'kid' && (
            <View style={s.suggestions}>
              <Text style={s.suggestTitle}>Hey, I'm PAL. Ask me anything.</Text>
              <View style={s.chipWrap}>
                {SUGGESTIONS.map((q) => (
                  <Pressable key={q} style={s.chip} onPress={() => send(q)}>
                    <Text style={s.chipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => (
            <ChatBubble key={i} from={m.role === 'user' ? 'user' : 'pal'}>
              {m.content}
            </ChatBubble>
          ))}

          {sending && <TypingBubble />}

          {pendingIntent && (
            <View style={s.intentCard}>
              <Text style={s.intentLabel}>{intentLabel(pendingIntent.kind)}</Text>
              <Text style={s.intentDetail}>{intentDetail(pendingIntent)}</Text>
              <View style={s.intentActions}>
                <Pressable style={[s.intentBtn, s.intentBtnSecondary]} onPress={() => setPendingIntent(null)}>
                  <Text style={[s.intentBtnText, { color: tokens.color.text }]}>Cancel</Text>
                </Pressable>
                <Pressable style={s.intentBtn} onPress={executeIntent}>
                  <Text style={s.intentBtnText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask PAL..."
            placeholderTextColor={tokens.color.textMuted}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          {input.trim().length > 0 ? (
            <Pressable
              style={[s.sendBtn, sending && { opacity: 0.5 }]}
              onPress={() => send(input)}
              disabled={sending}
            >
              <Send size={tokens.iconSize.md} color="#000" strokeWidth={2} />
            </Pressable>
          ) : (
            <VoiceMic
              onTranscript={(text) => send(text)}
              onError={(e) => console.warn('mic error', e)}
              size={tokens.iconSize.md}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function intentLabel(kind: string): string {
  switch (kind) {
    case 'add_chore': return '📋 New Chore'
    case 'topup':     return '💸 Top Up'
    case 'set_goal':  return '🎯 New Goal'
    default:          return 'Action'
  }
}

function intentDetail(intent: { kind: string; [k: string]: unknown }): string {
  if (intent.kind === 'add_chore') {
    return `${intent.title} for ${intent.kidName} · +${intent.rewardBrains} 🧠`
  }
  if (intent.kind === 'topup') {
    return `${intent.brainsDelta} 🧠 to ${intent.kidName}${intent.note ? ` — "${intent.note}"` : ''}`
  }
  if (intent.kind === 'set_goal') {
    return `${intent.goalName} for ${intent.kidName} · ${intent.targetBrains} 🧠 target`
  }
  return ''
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: tokens.spacing[4], paddingBottom: tokens.spacing[3] },

  suggestions: { paddingVertical: tokens.spacing[5], gap: tokens.spacing[3] },
  suggestTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700', textAlign: 'center', marginBottom: tokens.spacing[3] },
  chipWrap: { gap: tokens.spacing[2] },
  chip: {
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.md,
  },
  chipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  intentCard: {
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    marginVertical: tokens.spacing[3],
    borderWidth: 1, borderColor: tokens.color.accent + '44',
  },
  intentLabel: { color: tokens.color.accent, fontSize: tokens.fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  intentDetail: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700', marginTop: tokens.spacing[2] },
  intentActions: { flexDirection: 'row', gap: tokens.spacing[2], marginTop: tokens.spacing[3] },
  intentBtn: {
    flex: 1, height: 44,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  intentBtnSecondary: { backgroundColor: tokens.color.surface2 },
  intentBtnText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.sm },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
})
