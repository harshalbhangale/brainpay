import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
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
 * Kid persona wizard — 7 slides.
 * Pre-fills from kidSeed (passed via search params from invite-accept / join-request).
 *
 * Slides:
 *   1. Confirm name (pre-filled, editable)
 *   2. Age picker
 *   3. Accent color
 *   4. Avatar
 *   5. PAL voice
 *   6. Spend style (builds PAL's friction calibration)
 *   7. First goal (skippable)
 */

const ACCENT_PALETTE = [
  { color: '#A855F7', name: 'Purple' },
  { color: '#3DDC84', name: 'Green' },
  { color: '#3B82F6', name: 'Blue' },
  { color: '#FB923C', name: 'Orange' },
  { color: '#EC4899', name: 'Pink' },
  { color: '#FACC15', name: 'Yellow' },
  { color: '#EF4444', name: 'Red' },
  { color: '#14B8A6', name: 'Teal' },
] as const

const KID_AVATARS = ['🧒', '👦', '👧', '🧑', '👽', '🤖', '🦄', '🐱', '🐶', '🐼', '🦊', '🐸'] as const

const VOICES = [
  { id: 'sarcastic', emoji: '🤖', name: 'Sarcastic Robot',  desc: 'Technically correct. Emotionally unavailable.' },
  { id: 'cool',      emoji: '😎', name: 'Cool Friend',       desc: 'Hype, but honest when it counts.' },
  { id: 'wise',      emoji: '🧙', name: 'Wise Wizard',       desc: 'Ancient wisdom. Surprisingly relevant.' },
  { id: 'hyped',     emoji: '⚡', name: 'Hype Coach',        desc: 'Every win is a W. Every loss is a lesson.' },
  { id: 'deadpan',   emoji: '🕵️', name: 'Deadpan Detective', desc: 'Just the facts. No feelings.' },
  { id: 'gremlin',   emoji: '👾', name: 'Chaos Gremlin',     desc: 'Unhinged. Occasionally correct.' },
] as const

const SPEND_STYLES = [
  { id: 'impulse',  emoji: '💨', label: 'Gone in 24 hours',  sub: '"I spend it immediately"' },
  { id: 'thinker',  emoji: '🤔', label: 'I think about it',  sub: '"I wait a bit, then spend"' },
  { id: 'saver',    emoji: '🏦', label: 'I save most of it', sub: '"I\'m patient"' },
  { id: 'moody',    emoji: '🤷', label: 'Depends on my mood', sub: '"Could go either way"' },
] as const

const GOAL_TEMPLATES = [
  { emoji: '🎧', name: 'AirPods',      target: 500  },
  { emoji: '🎮', name: 'Game',         target: 1000 },
  { emoji: '👟', name: 'Sneakers',     target: 800  },
  { emoji: '📱', name: 'Phone case',   target: 200  },
  { emoji: '🎨', name: 'Art supplies', target: 300  },
] as const

const AGE_RANGE = Array.from({ length: 10 }, (_, i) => i + 8)

type KidSeed = {
  name?: string
  age?: number
  color?: string
  avatar?: string
  voiceId?: string
}

export default function KidPersona() {
  const router = useRouter()
  const { kidSeed: kidSeedRaw } = useLocalSearchParams<{ kidSeed?: string }>()
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const setAccountType = useAuthStore((s) => s.setAccountType)
  const setPersona = useAuthStore((s) => s.setPersona)

  useEffect(() => {
    if (onboardingComplete) router.replace('/(app)/(tabs)')
  }, [onboardingComplete, router])

  const seed = useMemo<KidSeed>(() => {
    try { return kidSeedRaw ? JSON.parse(kidSeedRaw) : {} }
    catch { return {} }
  }, [kidSeedRaw])

  const [step, setStep] = useState(0)
  const [name,       setName]       = useState(seed.name ?? '')
  const [age,        setAge]        = useState<number | null>(seed.age ?? null)
  const [color,      setColor]      = useState<string | null>(seed.color ?? null)
  const [avatar,     setAvatar]     = useState<string | null>(seed.avatar ?? null)
  const [voiceId,    setVoiceId]    = useState<string | null>(seed.voiceId ?? null)
  const [spendStyle, setSpendStyle] = useState<string | null>(null)
  const [goalIdx,    setGoalIdx]    = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const accent = color ?? tokens.color.accent

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && age !== null) ||
    (step === 2 && color !== null) ||
    (step === 3 && avatar !== null) ||
    (step === 4 && voiceId !== null) ||
    (step === 5 && spendStyle !== null) ||
    step === 6 // goal is optional

  const onComplete = async () => {
    if (submitting) return
    setSubmitting(true)
    const persona = {
      name: name.trim(),
      age,
      color,
      avatar,
      voiceId,
      spend_style: spendStyle,
    }
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ accountType: 'kid', persona }),
      })
      if (goalIdx !== null) {
        const tmpl = GOAL_TEMPLATES[goalIdx]
        await api('/goals', {
          method: 'POST',
          body: JSON.stringify({ name: tmpl.name, emoji: tmpl.emoji, targetBrains: tmpl.target }),
        }).catch(() => undefined)
      }
      setAccountType('kid')
      setPersona(persona)
      router.replace('/(app)/(tabs)')
    } catch {
      console.error('kid_persona_save_failed')
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
      continueLabel="Let's go"
      accent={accent}
      steps={[

        // ── Slide 1: Name ──────────────────────────────────────────
        <View key="name" style={s.slide}>
          <Text style={s.title}>
            {seed.name ? `Is this you? Your parent set this up as "${seed.name}".` : "What's your name?"}
          </Text>
          <Text style={s.subtitle}>This is what your family sees.</Text>
          <TextInput
            style={s.input}
            placeholder="Jamie"
            placeholderTextColor={tokens.color.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={20}
          />
        </View>,

        // ── Slide 2: Age ───────────────────────────────────────────
        <View key="age" style={s.slide}>
          <Text style={s.title}>How old are you?</Text>
          <Text style={s.subtitle}>PAL adapts to your age.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.ageRow}>
            {AGE_RANGE.map((n) => {
              const picked = age === n
              return (
                <Pressable
                  key={n}
                  style={[s.ageChip, picked && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => setAge(n)}
                >
                  <Text style={[s.ageNum, picked && { color: '#000' }]}>{n}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>,

        // ── Slide 3: Color ─────────────────────────────────────────
        <View key="color" style={s.slide}>
          <Text style={s.title}>Pick your color</Text>
          <Text style={s.subtitle}>Yours alone — follows you everywhere.</Text>
          <View style={s.swatchGrid}>
            {ACCENT_PALETTE.map((c) => {
              const picked = color === c.color
              return (
                <Pressable
                  key={c.color}
                  style={[s.swatch, { backgroundColor: c.color }, picked && s.swatchPicked]}
                  onPress={() => setColor(c.color)}
                >
                  {picked && <Text style={s.swatchCheck}>✓</Text>}
                </Pressable>
              )
            })}
          </View>
        </View>,

        // ── Slide 4: Avatar ────────────────────────────────────────
        <View key="avatar" style={s.slide}>
          <Text style={s.title}>Pick your avatar</Text>
          <View style={s.bubbleGrid}>
            {KID_AVATARS.map((emoji) => {
              const picked = avatar === emoji
              return (
                <Pressable
                  key={emoji}
                  style={[s.bubble, picked && { borderColor: accent, backgroundColor: accent + '22' }]}
                  onPress={() => setAvatar(emoji)}
                >
                  <Text style={s.bubbleEmoji}>{emoji}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // ── Slide 5: PAL voice ─────────────────────────────────────
        <View key="voice" style={s.slide}>
          <Text style={s.title}>Pick who you want PAL to be.</Text>
          <Text style={s.subtitle}>You can change it later.</Text>
          <View style={s.voiceList}>
            {VOICES.map((v) => {
              const picked = voiceId === v.id
              return (
                <Pressable
                  key={v.id}
                  style={[s.voiceCard, picked && { borderColor: accent, backgroundColor: tokens.color.surface2 }]}
                  onPress={() => setVoiceId(v.id)}
                >
                  <Text style={s.voiceEmoji}>{v.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.voiceName, picked && { color: accent }]}>{v.name}</Text>
                    <Text style={s.voiceDesc}>{v.desc}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // ── Slide 6: Spend style ───────────────────────────────────
        <View key="spend" style={s.slide}>
          <Text style={s.title}>When you get money — what usually happens to it?</Text>
          <Text style={s.subtitle}>Be honest. PAL won't judge. (Much.)</Text>
          <View style={s.cardList}>
            {SPEND_STYLES.map((opt) => {
              const picked = spendStyle === opt.id
              return (
                <Pressable
                  key={opt.id}
                  style={[s.card, picked && { borderColor: accent, backgroundColor: tokens.color.surface2 }]}
                  onPress={() => setSpendStyle(opt.id)}
                >
                  <Text style={s.cardEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardLabel, picked && { color: accent }]}>{opt.label}</Text>
                    <Text style={s.cardSub}>{opt.sub}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // ── Slide 7: First goal (optional) ─────────────────────────
        <View key="goal" style={s.slide}>
          <Text style={s.title}>What are you saving for?</Text>
          <Text style={s.subtitle}>Don't say nothing.</Text>
          <View style={s.goalList}>
            {GOAL_TEMPLATES.map((g, i) => {
              const picked = goalIdx === i
              return (
                <Pressable
                  key={i}
                  style={[s.goalCard, picked && { borderColor: accent, backgroundColor: tokens.color.surface2 }]}
                  onPress={() => setGoalIdx(picked ? null : i)}
                >
                  <Text style={s.goalEmoji}>{g.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.goalName, picked && { color: accent }]}>{g.name}</Text>
                    <Text style={s.goalTarget}>{g.target} 🧠</Text>
                  </View>
                </Pressable>
              )
            })}
            <Pressable onPress={() => setGoalIdx(null)}>
              <Text style={s.skip}>Skip — set later</Text>
            </Pressable>
          </View>
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

  // Age
  ageRow: { gap: tokens.spacing[3], paddingVertical: tokens.spacing[3] },
  ageChip: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  ageNum: { color: tokens.color.text, fontWeight: '800', fontSize: tokens.fontSize.lg },

  // Color swatches
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
  swatch: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'transparent',
  },
  swatchPicked: { borderColor: '#fff' },
  swatchCheck: { color: '#fff', fontSize: 28, fontWeight: '900' },

  // Avatar bubbles
  bubbleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
  bubble: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'transparent',
  },
  bubbleEmoji: { fontSize: 36 },

  // Voice cards
  voiceList: { gap: tokens.spacing[3] },
  voiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4], borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
  },
  voiceEmoji: { fontSize: 28 },
  voiceName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  voiceDesc: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2, fontStyle: 'italic' },

  // Spend style cards
  cardList: { gap: tokens.spacing[3] },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 2, borderColor: 'transparent',
  },
  cardEmoji: { fontSize: 26 },
  cardLabel: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  cardSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 3, fontStyle: 'italic' },

  // Goal cards
  goalList: { gap: tokens.spacing[2] },
  goalCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4], borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
  },
  goalEmoji: { fontSize: 28 },
  goalName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  goalTarget: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  skip: {
    textAlign: 'center', paddingVertical: tokens.spacing[3],
    fontSize: tokens.fontSize.sm, color: tokens.color.textMuted,
  },
})
