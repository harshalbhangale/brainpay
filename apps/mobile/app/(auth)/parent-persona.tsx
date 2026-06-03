import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SlidingWizard } from '@/components/SlidingWizard'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Parent persona — text-only fallback wizard (5 slides).
 * Mirrors the questions in parent-onboarding.tsx but without voice.
 *
 * Slides:
 *   1. Name / preferred title
 *   2. Money upbringing
 *   3. Parenting instinct (maps to PAL style)
 *   4. Kid count + age range
 *   5. Primary goal
 */

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
  { id: 'impulse',     emoji: '🛑', label: 'Stop impulse buying' },
  { id: 'save',        emoji: '🎯', label: 'Learn to save for something real' },
  { id: 'food',        emoji: '🥦', label: 'Make better food choices' },
  { id: 'understand',  emoji: '💡', label: 'Understand where money comes from' },
  { id: 'responsible', emoji: '🤝', label: 'Be more responsible generally' },
  { id: 'all',         emoji: '🔥', label: 'All of the above, honestly' },
] as const

export default function ParentPersona() {
  const router = useRouter()
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const setAccountType = useAuthStore((s) => s.setAccountType)
  const setPersona = useAuthStore((s) => s.setPersona)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (onboardingComplete) router.replace('/(app)/(tabs)')
  }, [onboardingComplete, router])

  const [name, setName] = useState('')
  const [upbringing, setUpbringing] = useState<string | null>(null)
  const [instinct, setInstinct] = useState<string | null>(null)
  const [kidSituation, setKidSituation] = useState<string | null>(null)
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const palStyle = PARENTING_INSTINCT.find((x) => x.id === instinct)?.style ?? 'balanced'

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && upbringing !== null) ||
    (step === 2 && instinct !== null) ||
    (step === 3 && kidSituation !== null) ||
    (step === 4 && primaryGoal !== null)

  const onComplete = async () => {
    if (submitting) return
    setSubmitting(true)
    const persona = {
      name: name.trim(),
      money_upbringing: upbringing,
      parenting_style: instinct,
      style: palStyle,
      kid_situation: kidSituation,
      primary_goal: primaryGoal,
    }
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'parent', persona }),
      })
      setAccountType('parent')
      setPersona(persona)
      router.replace('/(app)/(tabs)')
    } catch {
      console.error('parent_persona_save_failed')
      setSubmitting(false)
    }
  }

  return (
    <SlidingWizard
      step={step}
      onStepChange={setStep}
      canContinue={canContinue && !submitting}
      onComplete={onComplete}
      onBack={() => router.back()}
      continueLabel="Looks good"
      steps={[

        // ── Slide 1: Name ──────────────────────────────────────────
        <View key="name" style={s.slide}>
          <Text style={s.title}>What do your kids call you?</Text>
          <Text style={s.subtitle}>Mum, Dad, Sarah, Big Boss — whatever works.</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Mum"
            placeholderTextColor={tokens.color.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={20}
            autoComplete="given-name"
          />
        </View>,

        // ── Slide 2: Money upbringing ──────────────────────────────
        <View key="upbringing" style={s.slide}>
          <Text style={s.title}>Growing up, was money talked about openly?</Text>
          <Text style={s.subtitle}>This shapes how PAL communicates with you.</Text>
          <View style={s.cardList}>
            {MONEY_UPBRINGING.map((opt) => {
              const picked = upbringing === opt.id
              return (
                <Pressable
                  key={opt.id}
                  style={[s.card, picked && s.cardPicked]}
                  onPress={() => setUpbringing(opt.id)}
                >
                  <Text style={s.cardEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardLabel, picked && { color: tokens.color.accent }]}>{opt.label}</Text>
                    <Text style={s.cardSub}>{opt.sub}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // ── Slide 3: Parenting instinct ────────────────────────────
        <View key="instinct" style={s.slide}>
          <Text style={s.title}>When your kid wants something they can't afford yet…</Text>
          <Text style={s.subtitle}>What's your instinct?</Text>
          <View style={s.cardList}>
            {PARENTING_INSTINCT.map((opt) => {
              const picked = instinct === opt.id
              return (
                <Pressable
                  key={opt.id}
                  style={[s.card, picked && s.cardPicked]}
                  onPress={() => setInstinct(opt.id)}
                >
                  <Text style={s.cardEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardLabel, picked && { color: tokens.color.accent }]}>{opt.label}</Text>
                    <Text style={s.cardSub}>{opt.sub}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // ── Slide 4: Kid situation ─────────────────────────────────
        <View key="kids" style={s.slide}>
          <Text style={s.title}>Tell me about your kid situation.</Text>
          <Text style={s.subtitle}>PAL calibrates its suggestions based on this.</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.chipGrid}>
            {KID_SITUATIONS.map((opt) => {
              const picked = kidSituation === opt.id
              return (
                <Pressable
                  key={opt.id}
                  style={[s.chip, picked && s.chipPicked]}
                  onPress={() => setKidSituation(opt.id)}
                >
                  <Text style={s.chipEmoji}>{opt.emoji}</Text>
                  <Text style={[s.chipLabel, picked && { color: tokens.color.accent }]}>{opt.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>,

        // ── Slide 5: Primary goal ──────────────────────────────────
        <View key="goal" style={s.slide}>
          <Text style={s.title}>What do you actually want to change?</Text>
          <Text style={s.subtitle}>PAL will celebrate wins that match this goal.</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.goalGrid}>
            {PRIMARY_GOALS.map((opt) => {
              const picked = primaryGoal === opt.id
              return (
                <Pressable
                  key={opt.id}
                  style={[s.goalChip, picked && s.goalChipPicked]}
                  onPress={() => setPrimaryGoal(opt.id)}
                >
                  <Text style={s.goalEmoji}>{opt.emoji}</Text>
                  <Text style={[s.goalLabel, picked && { color: tokens.color.accent }]}>{opt.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>,

      ]}
    />
  )
}

const s = StyleSheet.create({
  slide: { flex: 1, paddingTop: tokens.spacing[5] },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', lineHeight: 34 },
  subtitle: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5],
  },
  input: {
    backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '600',
  },

  // Choice cards
  cardList: { gap: tokens.spacing[3] },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 2, borderColor: 'transparent',
  },
  cardPicked: { borderColor: tokens.color.accent, backgroundColor: tokens.color.surface2 },
  cardEmoji: { fontSize: 26 },
  cardLabel: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  cardSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 3, fontStyle: 'italic' },

  // Kid situation chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 2, borderColor: 'transparent',
  },
  chipPicked: { borderColor: tokens.color.accent, backgroundColor: tokens.color.surface2 },
  chipEmoji: { fontSize: 18 },
  chipLabel: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  // Goal chips
  goalGrid: { gap: tokens.spacing[2] },
  goalChip: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 2, borderColor: 'transparent',
  },
  goalChipPicked: { borderColor: tokens.color.accent, backgroundColor: tokens.color.surface2 },
  goalEmoji: { fontSize: 22 },
  goalLabel: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
})
