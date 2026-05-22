import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
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
import { tokens } from '@/theme/tokens'

/**
 * Kid persona — same shape as parent's add-kid wizard but the kid edits.
 * Pre-fills from kidSeed (passed via search params from invite-accept).
 *
 * Slides: confirm name → age → color → avatar → PAL voice → first goal (skippable).
 * Initial top-up is NOT editable here — parent already set it.
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
  { id: 'sarcastic',  emoji: '🤖', name: 'Sarcastic robot' },
  { id: 'cool',       emoji: '😎', name: 'Cool friend' },
  { id: 'wise',       emoji: '🧙', name: 'Wise wizard' },
  { id: 'hyped',      emoji: '⚡', name: 'Hyped coach' },
  { id: 'chill',      emoji: '🌴', name: 'Chill surfer' },
  { id: 'auntie',     emoji: '👵', name: 'Sassy auntie' },
] as const

const GOAL_TEMPLATES = [
  { emoji: '🎧', name: 'AirPods',         target: 500  },
  { emoji: '🎮', name: 'Game',            target: 1000 },
  { emoji: '👟', name: 'Sneakers',        target: 800  },
  { emoji: '📱', name: 'Phone case',      target: 200  },
  { emoji: '🎨', name: 'Art supplies',    target: 300  },
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
  const setAccountType = useAuthStore((s) => s.setAccountType)

  const seed = useMemo<KidSeed>(() => {
    try {
      return kidSeedRaw ? JSON.parse(kidSeedRaw) : {}
    } catch {
      return {}
    }
  }, [kidSeedRaw])

  const [step, setStep] = useState(0)
  const [name,    setName]    = useState(seed.name ?? '')
  const [age,     setAge]     = useState<number | null>(seed.age ?? null)
  const [color,   setColor]   = useState<string | null>(seed.color ?? null)
  const [avatar,  setAvatar]  = useState<string | null>(seed.avatar ?? null)
  const [voiceId, setVoiceId] = useState<string | null>(seed.voiceId ?? null)
  const [goalIdx, setGoalIdx] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const accent = color ?? tokens.color.accent

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && age !== null) ||
    (step === 2 && color !== null) ||
    (step === 3 && avatar !== null) ||
    (step === 4 && voiceId !== null) ||
    step === 5 // goal slide is optional

  const onComplete = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({
          accountType: 'kid',
          persona: {
            name: name.trim(),
            age,
            color,
            avatar,
            voiceId,
          },
        }),
      })
      // Optional first goal
      if (goalIdx !== null) {
        const tmpl = GOAL_TEMPLATES[goalIdx]
        await api('/goals', {
          method: 'POST',
          body: JSON.stringify({
            name: tmpl.name,
            emoji: tmpl.emoji,
            targetBrains: tmpl.target,
          }),
        }).catch(() => undefined) // endpoint lands in Task 13; OK if 404 in P0
      }
      setAccountType('kid')
      router.replace('/(app)/kid')
    } catch (err) {
      console.error('kid_persona_save_failed', err)
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
        // Slide 1 — name
        <View key="name" style={s.slide}>
          <Text style={s.title}>What's your name?</Text>
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

        // Slide 2 — age
        <View key="age" style={s.slide}>
          <Text style={s.title}>How old are you?</Text>
          <Text style={s.subtitle}>PAL adapts to your age.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
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

        // Slide 3 — color
        <View key="color" style={s.slide}>
          <Text style={s.title}>Pick your color</Text>
          <Text style={s.subtitle}>Yours alone — follows you everywhere.</Text>
          <View style={s.grid}>
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

        // Slide 4 — avatar
        <View key="avatar" style={s.slide}>
          <Text style={s.title}>Pick your avatar</Text>
          <View style={s.grid}>
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

        // Slide 5 — PAL voice
        <View key="voice" style={s.slide}>
          <Text style={s.title}>Pick PAL's voice</Text>
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
                  <Text style={s.voiceName}>{v.name}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // Slide 6 — first goal (optional)
        <View key="goal" style={s.slide}>
          <Text style={s.title}>Set your first goal</Text>
          <Text style={s.subtitle}>Optional. You can do this anytime.</Text>
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
                    <Text style={s.goalName}>{g.name}</Text>
                    <Text style={s.goalTarget}>{g.target} 🧠</Text>
                  </View>
                </Pressable>
              )
            })}
            <Pressable onPress={() => setGoalIdx(null)}>
              <Text style={[s.skip, { color: tokens.color.textMuted }]}>Skip — set later</Text>
            </Pressable>
          </View>
        </View>,
      ]}
    />
  )
}

const s = StyleSheet.create({
  slide: { flex: 1, paddingTop: tokens.spacing[5] },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
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
  row: { gap: tokens.spacing[3], paddingVertical: tokens.spacing[3] },
  ageChip: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  ageNum: { color: tokens.color.text, fontWeight: '800', fontSize: tokens.fontSize.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
  swatch: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'transparent',
  },
  swatchPicked: { borderColor: '#fff' },
  swatchCheck: { color: '#fff', fontSize: 28, fontWeight: '900' },
  bubble: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'transparent',
  },
  bubbleEmoji: { fontSize: 36 },
  voiceList: { gap: tokens.spacing[3] },
  voiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4], borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
  },
  voiceEmoji: { fontSize: 32 },
  voiceName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
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
  skip: { textAlign: 'center', paddingVertical: tokens.spacing[3], fontSize: tokens.fontSize.sm },
})
