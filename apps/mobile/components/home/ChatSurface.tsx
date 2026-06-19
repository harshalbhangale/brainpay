import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  Alert,
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
import { useRouter } from 'expo-router'
import { AudioLines, Camera, CheckCircle2, Send, Sparkles, Trash2, X } from 'lucide-react-native'
import { api } from '@/lib/api'
import { VoiceMic } from '@/components/VoiceMic'
import { TypingBubble } from '@/components/ChatBubble'
import { CouncilCard, type PalLine } from '@/components/council'
import { PAL_LIST } from '@/components/pals'
import { palSpeakAsync } from '@/lib/pal-speak'
import { haptic } from '@/lib/haptics'
import { useAuthStore } from '@/stores/auth'
import { kidTheme as tokens, shadow } from '@/theme/tokens'

const BRAND: [string, string] = [tokens.color.primary, '#16A07F']

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  pals?: PalLine[]
}

type Suggestion = { q: string; emoji: string }

const KID_SUGGESTIONS: Suggestion[] = [
  { q: "What's my balance right now?", emoji: '💰' },
  { q: 'How close am I to my goal?', emoji: '🎯' },
  { q: 'Roast my last purchase', emoji: '🔥' },
  { q: 'Is a Coke a smart buy today?', emoji: '🥤' },
  { q: 'How do I earn more Brain Points?', emoji: '🧠' },
  { q: 'Give me a money tip', emoji: '💡' },
]
const PARENT_SUGGESTIONS: Suggestion[] = [
  { q: 'How are my kids doing this week?', emoji: '📊' },
  { q: 'Add a chore for my kid', emoji: '🧹' },
  { q: 'Top up $10 for my kid', emoji: '💸' },
  { q: 'What did my kid buy today?', emoji: '🛒' },
  { q: 'Set a savings goal for my kid', emoji: '🎯' },
  { q: 'Any spending I should know about?', emoji: '👀' },
]

/**
 * The Pals chat — the primary home surface. Rendered full-screen inside
 * `RevealHome`. The header hosts two affordances so the gesture-revealed
 * surfaces stay discoverable on web and to first-time users:
 *   • a "grabber" pull-tab (top) that the parent wires to the Money panel
 *   • a menu button that opens the Surfaces drawer
 */
export function ChatSurface({
  onOpenDrawer,
  topInset = 0,
}: {
  onOpenDrawer?: () => void
  /** Extra top padding so the chat clears the grabber bar owned by RevealHome. */
  topInset?: number
}) {
  const accountType = useAuthStore((s) => s.accountType)
  const role = accountType === 'kid' ? 'kid' : 'parent'
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const router = useRouter()
  const scrollRef = useRef<ScrollView>(null)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [optimistic, setOptimistic] = useState<Message[]>([])
  const [pendingIntent, setPendingIntent] = useState<{ kind: string; [k: string]: unknown } | null>(null)
  const [micListening, setMicListening] = useState(false)

  const { data: history } = useQuery({
    queryKey: ['chat-history'],
    queryFn: () => api<{ messages: Message[] }>('/chat/history'),
    staleTime: 30_000,
  })

  const messages = [...(history?.messages ?? []), ...optimistic]
  const suggestions = role === 'kid' ? KID_SUGGESTIONS : PARENT_SUGGESTIONS
  const isEmpty = messages.length === 0

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
  }, [messages.length, sending])

  const clearChat = async () => {
    if (clearing || isEmpty) return
    setClearing(true)
    try {
      await api('/chat/history', { method: 'DELETE' })
      setOptimistic([])
      setPendingIntent(null)
      await queryClient.invalidateQueries({ queryKey: ['chat-history'] })
      queryClient.setQueryData(['chat-history'], { messages: [] })
      haptic.tap()
    } catch {
      Alert.alert('Could not clear chat', 'Please try again in a moment.')
    } finally {
      setClearing(false)
    }
  }

  const confirmClear = () => {
    if (isEmpty) return
    Alert.alert('Clear chat?', 'This permanently deletes all your messages with your Pals.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearChat },
    ])
  }

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
      }>('/chat', { method: 'POST', body: JSON.stringify({ message: text.trim() }) })
      setOptimistic((prev) => [...prev, { role: 'assistant', content: res.reply, pals: res.pals }])
      palSpeakAsync(res.reply)
      if (res.requiresConfirmation && res.intent) setPendingIntent(res.intent)
      await queryClient.invalidateQueries({ queryKey: ['chat-history'] })
      setOptimistic([])
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
      setOptimistic((prev) => [...prev, { role: 'assistant', content: "Couldn't do that. Try again?" }])
    } finally {
      setSending(false)
    }
  }

  // Launch the real-time PAL experience: camera ("point at anything and ask")
  // or voice-only. Both stream to Gemini Live in the general "assist" persona.
  const openLive = (voiceOnly: boolean) => {
    haptic.select()
    router.push({
      pathname: '/(app)/live',
      params: voiceOnly ? { mode: 'assist', voice: '1' } : { mode: 'assist' },
    })
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.root, { paddingTop: topInset }]}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.brainAvatar}>
            <LinearGradient colors={BRAND} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <Sparkles size={20} color="#fff" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Pals</Text>
            <Text style={s.status}>{sending ? 'Thinking…' : clearing ? 'Clearing…' : micListening ? 'Listening…' : 'Your AI money crew'}</Text>
          </View>
          {!isEmpty && (
            <Pressable
              hitSlop={10}
              onPress={confirmClear}
              disabled={clearing}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            >
              <Trash2 size={18} color={tokens.color.textMuted} strokeWidth={2} />
            </Pressable>
          )}
          {onOpenDrawer && (
            <Pressable
              hitSlop={10}
              onPress={() => { haptic.select(); onOpenDrawer() }}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Open menu"
            >
              <MenuGlyph />
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 92 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Roster — all available Pals */}
          <Text style={s.section}>YOUR PALS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rosterRow}>
            {PAL_LIST.map((p) => (
              <View key={p.id} style={s.palCard}>
                <View style={[s.palCardAvatar, { backgroundColor: p.color + '1F' }]}>
                  <Text style={s.palCardEmoji}>{p.emoji}</Text>
                </View>
                <Text style={s.palCardName}>{p.name}</Text>
                <Text style={s.palCardBlurb} numberOfLines={2}>{p.blurb}</Text>
              </View>
            ))}
          </ScrollView>

          {isEmpty ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Ask your Pals anything</Text>
              <Text style={s.emptySub}>
                {role === 'kid'
                  ? 'Balance, goals, or what to buy — your crew has your back. Tap a question to start.'
                  : 'Your kids, chores, top-ups — just ask. Tap a question to start.'}
              </Text>
              <Text style={s.tryLabel}>TRY ASKING</Text>
              <View style={s.chips}>
                {suggestions.map((sug) => (
                  <Pressable
                    key={sug.q}
                    style={({ pressed }) => [s.chip, pressed && { opacity: 0.7, transform: [{ scale: 0.99 }] }]}
                    onPress={() => { haptic.select(); send(sug.q) }}
                  >
                    <Text style={s.chipEmoji}>{sug.emoji}</Text>
                    <Text style={s.chipText}>{sug.q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={{ marginTop: tokens.spacing[4] }}>
              {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
            </View>
          )}

          {sending && (
            <View style={s.typingRow}>
              <View style={s.palAvatarSmall}>
                <LinearGradient colors={BRAND} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <Sparkles size={12} color="#fff" strokeWidth={2} />
              </View>
              <TypingBubble />
            </View>
          )}

          {pendingIntent && <IntentCard intent={pendingIntent} onConfirm={executeIntent} onCancel={() => setPendingIntent(null)} />}
        </ScrollView>

        {/* Input bar */}
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, tokens.spacing[3]) }]}>
          <Pressable
            style={({ pressed }) => [s.liveBtn, pressed && { opacity: 0.6 }]}
            onPress={() => openLive(false)}
            accessibilityLabel="Point the camera and ask PAL"
          >
            <Camera size={20} color={tokens.color.primary} strokeWidth={2} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.liveBtn, pressed && { opacity: 0.6 }]}
            onPress={() => openLive(true)}
            accessibilityLabel="Talk to PAL"
          >
            <AudioLines size={20} color={tokens.color.primary} strokeWidth={2} />
          </Pressable>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={micListening ? 'Listening…' : 'Ask your Pals…'}
            placeholderTextColor={micListening ? tokens.color.primary : tokens.color.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => { if (input.trim()) send(input) }}
            editable={!micListening}
          />
          {input.trim().length > 0 ? (
            <Pressable style={[s.sendBtn, sending && { opacity: 0.5 }]} onPress={() => send(input)} disabled={sending}>
              <LinearGradient colors={BRAND} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              <Send size={17} color="#fff" strokeWidth={2.5} />
            </Pressable>
          ) : (
            <VoiceMic onTranscript={(t) => send(t)} onError={() => {}} onStateChange={(st) => setMicListening(st === 'recording')} disabled={sending} size={20} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function MenuGlyph() {
  return (
    <View style={s.menuGlyph}>
      <View style={s.menuLine} />
      <View style={[s.menuLine, { width: 12 }]} />
      <View style={s.menuLine} />
    </View>
  )
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <View style={mb.userRow}>
        <View style={mb.userBubble}>
          <LinearGradient colors={BRAND} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
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
          <LinearGradient colors={BRAND} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
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
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: tokens.spacing[3], paddingLeft: 60 },
  userBubble: { borderRadius: 20, borderBottomRightRadius: 4, paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3], maxWidth: '85%', overflow: 'hidden' },
  userText: { color: '#fff', fontSize: tokens.fontSize.md, fontWeight: '600', lineHeight: 22 },
  palRow: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing[2], marginBottom: tokens.spacing[3], paddingRight: 60 },
  palAvatarSmall: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  palBubble: { backgroundColor: tokens.color.surface, borderRadius: 20, borderBottomLeftRadius: 4, paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3], flex: 1, ...shadow.sm },
  palText: { color: tokens.color.text, fontSize: tokens.fontSize.md, lineHeight: 22 },
})

function IntentCard({ intent, onConfirm, onCancel }: { intent: { kind: string; [k: string]: unknown }; onConfirm: () => void; onCancel: () => void }) {
  const label = { add_chore: 'New Chore', topup: 'Top Up', set_goal: 'New Goal' }[intent.kind] ?? 'Action'
  let detail = ''
  if (intent.kind === 'add_chore') detail = `"${intent.title}" for ${intent.kidName} · +${intent.rewardBrains} pts`
  else if (intent.kind === 'topup') detail = `$${((intent.brainsDelta as number) / 100).toFixed(2)} to ${intent.kidName}${intent.note ? ` — "${intent.note}"` : ''}`
  else if (intent.kind === 'set_goal') detail = `"${intent.goalName}" for ${intent.kidName} · ${intent.targetBrains} pts target`

  return (
    <View style={ic.card}>
      <View style={ic.top}>
        <View style={ic.labelWrap}>
          <View style={ic.dot} />
          <Text style={ic.label}>{label}</Text>
        </View>
        <Pressable hitSlop={8} onPress={onCancel}><X size={16} color={tokens.color.textMuted} strokeWidth={2} /></Pressable>
      </View>
      <Text style={ic.detail}>{detail}</Text>
      <Pressable style={ic.confirmBtn} onPress={onConfirm}>
        <LinearGradient colors={BRAND} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
        <CheckCircle2 size={16} color="#fff" strokeWidth={2} />
        <Text style={ic.confirmText}>Confirm</Text>
      </Pressable>
    </View>
  )
}

const ic = StyleSheet.create({
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[4], marginBottom: tokens.spacing[3], ...shadow.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing[2] },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.primary },
  label: { color: tokens.color.primary, fontSize: tokens.fontSize.xs, fontWeight: '800', letterSpacing: 0.8 },
  detail: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '600', lineHeight: 22, marginBottom: tokens.spacing[3] },
  confirmBtn: { height: 44, borderRadius: tokens.radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: tokens.fontSize.sm },
})

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3] },
  brainAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow.md },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '900' },
  status: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface, ...shadow.sm },
  menuGlyph: { gap: 3, alignItems: 'flex-end' },
  menuLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: tokens.color.text },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: tokens.spacing[5], paddingTop: tokens.spacing[2] },

  section: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: tokens.spacing[3] },
  rosterRow: { gap: tokens.spacing[3], paddingBottom: tokens.spacing[2], paddingRight: tokens.spacing[2] },
  palCard: { width: 132, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[4], gap: 6, ...shadow.md },
  palCardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  palCardEmoji: { fontSize: 22 },
  palCardName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  palCardBlurb: { color: tokens.color.textMuted, fontSize: 12, lineHeight: 16 },

  empty: { paddingTop: tokens.spacing[6], gap: tokens.spacing[3] },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '900', letterSpacing: -0.5 },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, lineHeight: 22 },
  tryLabel: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: tokens.spacing[3] },
  chips: { gap: tokens.spacing[2], marginTop: tokens.spacing[1] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[4],
    borderRadius: tokens.radius.md, ...shadow.sm,
  },
  chipEmoji: { fontSize: 18 },
  chipText: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing[2], marginBottom: tokens.spacing[3] },
  palAvatarSmall: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[5], paddingTop: tokens.spacing[3],
    backgroundColor: tokens.color.bg,
  },
  input: {
    flex: 1, minHeight: 46, maxHeight: 120, paddingHorizontal: tokens.spacing[4], paddingVertical: 12,
    backgroundColor: tokens.color.surface, borderRadius: 23, color: tokens.color.text, fontSize: tokens.fontSize.md, lineHeight: 22, ...shadow.sm,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  liveBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: tokens.color.surface, ...shadow.sm },
})
