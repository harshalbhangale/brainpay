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
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Parent onboarding — PAL-voiced chat wizard.
 *
 * 5 questions that build a rich persona knowledge base:
 *   1. Name / preferred title
 *   2. Money upbringing (shapes PAL's directness)
 *   3. Parenting instinct (replaces bland chill/balanced/strict)
 *   4. Kid count + age range (calibrates PAL's suggestions)
 *   5. Primary goal (PAL's north star for this family)
 */

// ─── Question data ────────────────────────────────────────────────────

const MONEY_UPBRINGING = [
  { id: 'open',    emoji: '💬', label: 'We talked about it',   sub: '"Money was dinner-table conversation"' },
  { id: 'private', emoji: '🤐', label: 'It was private',       sub: '"We didn\'t really discuss it"' },
  { id: 'mixed',   emoji: '🤷', label: 'Somewhere in between', sub: '"Depended on the situation"' },
] as const

const PARENTING_INSTINCT = [
  { id: 'autonomous', emoji: '🧘', label: 'Let them figure it out', sub: '"Natural consequences teach best"',   style: 'chill' },
  { id: 'guided',     emoji: '⚖️', label: 'Guide them through it',  sub: '"I like to explain the why"',        style: 'balanced' },
  { id: 'structured', emoji: '🏗️', label: 'Set the structure',      sub: '"Clear rules and limits work best"', style: 'strict' },
] as const

const KID_SITUATIONS = [
  { id: 'one_young',  label: 'One kid (under 10)',   emoji: '🧒' },
  { id: 'one_teen',   label: 'One kid (10–14)',       emoji: '👦' },
  { id: 'two',        label: 'Two kids',              emoji: '👫' },
  { id: 'three_plus', label: 'Three or more',         emoji: '👨‍👩‍👧‍👦' },
  { id: 'mixed',      label: 'Mixed ages',            emoji: '🌈' },
] as const

const PRIMARY_GOALS = [
  { id: 'impulse',      emoji: '🛑', label: 'Stop impulse buying' },
  { id: 'save',         emoji: '🎯', label: 'Learn to save for something real' },
  { id: 'food',         emoji: '🥦', label: 'Make better food choices' },
  { id: 'understand',   emoji: '💡', label: 'Understand where money comes from' },
  { id: 'responsible',  emoji: '🤝', label: 'Be more responsible generally' },
  { id: 'all',          emoji: '🔥', label: 'All of the above, honestly' },
] as const

// ─── Types ────────────────────────────────────────────────────────────

type Step = 'name' | 'upbringing' | 'instinct' | 'kids' | 'goal' | 'saving' | 'done'

type Msg =
  | { id: string; from: 'pal'; text: string; attachment?: React.ReactNode }
  | { id: string; from: 'user'; text: string }
  | { id: string; from: 'typing' }

let nextId = 1
const uid = () => `m${nextId++}`

// ─── Component ───────────────────────────────────────────────────────

export default function ParentOnboarding() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const setAccountType = useAuthStore((s) => s.setAccountType)
  const setPersona = useAuthStore((s) => s.setPersona)

  // Guard: already onboarded
  useEffect(() => {
    if (onboardingComplete) router.replace('/(app)/(tabs)')
  }, [onboardingComplete, router])

  const [messages, setMessages] = useState<Msg[]>([])
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')

  // Collected persona fields
  const [upbringing, setUpbringing] = useState<string | null>(null)
  const [instinct, setInstinct] = useState<string | null>(null)
  const [palStyle, setPalStyle] = useState<string>('balanced')
  const [kidSituation, setKidSituation] = useState<string | null>(null)
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null)

  const playerRef = useRef<AudioPlayer | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => undefined)
    }
    return () => { try { playerRef.current?.remove() } catch { /* ignore */ } }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    return () => clearTimeout(t)
  }, [messages])

  useEffect(() => { void start() }, [])

  // ─── PAL speech helpers ─────────────────────────────────────────────

  const palSays = async (text: string, delay = 700, attachment?: React.ReactNode) => {
    const typingId = uid()
    setMessages((prev) => [...prev, { id: typingId, from: 'typing' }])
    void playVoice(text)
    await new Promise((r) => setTimeout(r, delay))
    setMessages((prev) =>
      prev.filter((m) => m.id !== typingId).concat({ id: uid(), from: 'pal', text, attachment }),
    )
  }

  const userSays = (text: string) =>
    setMessages((prev) => [...prev, { id: uid(), from: 'user', text }])

  const playVoice = async (text: string) => {
    try {
      const url = `${env.apiBaseUrl}/voice/onboard/speak?text=${encodeURIComponent(text)}`
      if (Platform.OS === 'web') {
        // Use browser native Audio on web — expo-audio doesn't support web
        const audio = new (globalThis as any).Audio(url)
        audio.play().catch(() => undefined)
        return
      }
      try { playerRef.current?.remove() } catch { /* ignore */ }
      const player = createAudioPlayer({ uri: url })
      playerRef.current = player
      setTimeout(() => { try { player.play() } catch { /* ignore */ } }, 50)
    } catch { /* silent fallback */ }
  }

  // ─── Conversation flow ──────────────────────────────────────────────

  const start = async () => {
    await palSays("Hey. I'm PAL — your family's money brain.", 600)
    await palSays('First things first — what do your kids call you?', 500, <NameInputHint />)
  }

  const submitName = async () => {
    const n = name.trim()
    if (!n) return
    userSays(n)
    setStep('upbringing')
    await palSays(`Got it, ${n}.`, 400)
    await palSays(
      'Quick one — growing up, was money something your family talked about openly?',
      600,
      <ChoiceGrid
        options={MONEY_UPBRINGING}
        onPick={(id, label) => submitUpbringing(id, label)}
      />,
    )
  }

  const submitUpbringing = async (id: string, label: string) => {
    setUpbringing(id)
    userSays(label)
    setStep('instinct')
    await palSays('Makes sense.', 300)
    await palSays(
      "When your kid wants something they can't afford yet — what's your instinct?",
      600,
      <ChoiceGrid
        options={PARENTING_INSTINCT}
        onPick={(id, label) => submitInstinct(id, label)}
      />,
    )
  }

  const submitInstinct = async (id: string, label: string) => {
    const opt = PARENTING_INSTINCT.find((x) => x.id === id)
    setInstinct(id)
    setPalStyle(opt?.style ?? 'balanced')
    userSays(label)
    setStep('kids')
    await palSays(`${opt?.sub ?? 'Noted.'} I'll keep that in mind.`, 500)
    await palSays(
      'Tell me about your kid situation.',
      400,
      <ChoiceGrid
        options={KID_SITUATIONS}
        onPick={(id, label) => submitKids(id, label)}
      />,
    )
  }

  const submitKids = async (id: string, label: string) => {
    setKidSituation(id)
    userSays(label)
    setStep('goal')
    await palSays("Good to know — I'll calibrate accordingly.", 400)
    await palSays(
      "Last one. What's the one thing you actually want to change about how your kid thinks about money?",
      700,
      <ChoiceGrid
        options={PRIMARY_GOALS}
        onPick={(id, label) => submitGoal(id, label)}
      />,
    )
  }

  const submitGoal = async (id: string, label: string) => {
    setPrimaryGoal(id)
    userSays(label)
    setStep('saving')
    await palSays(`${label}. That's what I'm here for.`, 500)
    await palSays('Setting things up… 🎉', 400)
    await save(id)
  }

  const save = async (goalId: string) => {
    const persona = {
      name: name.trim(),
      money_upbringing: upbringing,
      parenting_style: instinct,
      style: palStyle,
      kid_situation: kidSituation,
      primary_goal: goalId,
    }
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'parent', persona }),
      })
      setAccountType('parent')
      setPersona(persona)
      setStep('done')
      await palSays(`All set, ${name.trim()}. Let's build your family.`, 500)
      setTimeout(() => router.replace('/(app)/(tabs)'), 1500)
    } catch {
      setAccountType('parent')
      setPersona({ name: name.trim(), style: palStyle })
      router.replace('/(app)/(tabs)')
    }
  }

  const fallback = () => {
    try { playerRef.current?.remove() } catch { /* ignore */ }
    router.replace('/(auth)/parent-persona')
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[3] }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>PAL</Text>
          <Text style={s.headerSub}>online · just now</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={s.chat}
          contentContainerStyle={s.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m) => {
            if (m.from === 'typing') return <TypingBubble key={m.id} />
            if (m.from === 'pal') {
              return (
                <ChatBubble key={m.id} from="pal" attachment={(m as { attachment?: React.ReactNode }).attachment}>
                  {m.text}
                </ChatBubble>
              )
            }
            return <ChatBubble key={m.id} from="user">{m.text}</ChatBubble>
          })}
        </ScrollView>

        <View style={[s.bottomBar, { paddingBottom: insets.bottom + tokens.spacing[3] }]}>
          {step === 'name' ? (
            <View style={s.nameRow}>
              <TextInput
                style={s.nameInput}
                placeholder="Mum, Dad, Sarah…"
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
            <Pressable hitSlop={12} onPress={fallback}>
              <Text style={s.skipText}>Skip voice setup</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────

function NameInputHint() {
  return (
    <Text style={sc.hint}>e.g. Mum, Dad, Sarah, Big Boss</Text>
  )
}

type ChoiceOption = { id: string; emoji?: string; label: string; sub?: string }

function ChoiceGrid({ options, onPick }: { options: readonly ChoiceOption[]; onPick: (id: string, label: string) => void }) {
  return (
    <View style={sc.grid}>
      {options.map((opt) => (
        <Pressable
          key={opt.id}
          style={({ pressed }) => [sc.card, pressed && sc.cardPressed]}
          onPress={() => onPick(opt.id, opt.label)}
        >
          {opt.emoji ? <Text style={sc.cardEmoji}>{opt.emoji}</Text> : null}
          <View style={{ flex: 1 }}>
            <Text style={sc.cardLabel}>{opt.label}</Text>
            {opt.sub ? <Text style={sc.cardSub}>{opt.sub}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const sc = StyleSheet.create({
  hint: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.xs,
    marginTop: tokens.spacing[2],
    fontStyle: 'italic',
  },
  grid: { gap: tokens.spacing[2], marginTop: tokens.spacing[2] },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface2,
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.md,
  },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  cardEmoji: { fontSize: 22 },
  cardLabel: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  cardSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2, fontStyle: 'italic' },
})

// ─── Styles ───────────────────────────────────────────────────────────

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
  headerTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '900' },
  headerSub: { color: tokens.color.accent, fontSize: tokens.fontSize.xs, fontWeight: '600', marginTop: 2 },
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
  nameRow: { flexDirection: 'row', gap: tokens.spacing[2], alignItems: 'center' },
  nameInput: {
    flex: 1, height: 48,
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '500',
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: tokens.color.surface2 },
  sendBtnText: { color: '#000', fontSize: 24, fontWeight: '900' },
  sendBtnTextDisabled: { color: tokens.color.textMuted },
  skipText: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600',
    textAlign: 'center', paddingVertical: tokens.spacing[2],
  },
})
