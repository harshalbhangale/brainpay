import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Pressable,
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
 * Parent persona setup — 3 sliding cards: name, avatar, parenting style.
 * On complete, PATCH /me with accountType=parent + persona JSON, then
 * route to (app)/parent for family creation prompt.
 */

const AVATARS = ['👩‍🦰', '👨', '👩', '👴', '👵', '🧑'] as const

const STYLES = [
  {
    id: 'chill',
    title: 'Chill',
    sample: '"Spent it on a Coke. Whatever. Your choice."',
    accent: '#3DDC84',
  },
  {
    id: 'balanced',
    title: 'Balanced',
    sample: '"39g sugar. Worth thinking about. −10."',
    accent: '#FFB627',
  },
  {
    id: 'strict',
    title: 'Strict',
    sample: '"Not a chance. That\'s 3 days of sugar. Skip."',
    accent: '#FF5C5C',
  },
] as const

export default function ParentPersona() {
  const router = useRouter()
  const setAccountType = useAuthStore((s) => s.setAccountType)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [style, setStyle] = useState<typeof STYLES[number]['id'] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && avatar !== null) ||
    (step === 2 && style !== null)

  const onComplete = async () => {
    if (!name || !avatar || !style) return
    setSubmitting(true)
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({
          accountType: 'parent',
          persona: { name: name.trim(), avatar, style },
        }),
      })
      setAccountType('parent')
      router.replace('/(app)/parent')
    } catch (err) {
      console.error('parent_persona_save_failed', err)
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
        // Slide 1 — name
        <View key="name" style={s.slide}>
          <Text style={s.title}>What should we call you?</Text>
          <Text style={s.subtitle}>Your kid will see this.</Text>
          <TextInput
            style={s.input}
            placeholder="Sarah"
            placeholderTextColor={tokens.color.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={20}
            autoComplete="given-name"
          />
        </View>,

        // Slide 2 — avatar
        <View key="avatar" style={s.slide}>
          <Text style={s.title}>Pick an avatar</Text>
          <Text style={s.subtitle}>Make it yours.</Text>
          <View style={s.avatarGrid}>
            {AVATARS.map((emoji) => {
              const picked = avatar === emoji
              return (
                <Pressable
                  key={emoji}
                  style={[s.avatar, picked && s.avatarPicked]}
                  onPress={() => setAvatar(emoji)}
                >
                  <Text style={s.avatarEmoji}>{emoji}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // Slide 3 — parenting style
        <View key="style" style={s.slide}>
          <Text style={s.title}>How does PAL talk?</Text>
          <Text style={s.subtitle}>You can change this later.</Text>
          <View style={s.styleList}>
            {STYLES.map((opt) => {
              const picked = style === opt.id
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    s.styleCard,
                    picked && { borderColor: opt.accent, backgroundColor: tokens.color.surface2 },
                  ]}
                  onPress={() => setStyle(opt.id)}
                >
                  <Text style={[s.styleTitle, picked && { color: opt.accent }]}>
                    {opt.title}
                  </Text>
                  <Text style={s.styleSample}>{opt.sample}</Text>
                </Pressable>
              )
            })}
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
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[6],
  },
  input: {
    backgroundColor: tokens.color.surface,
    height: 56,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
  },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  avatarPicked: { borderColor: tokens.color.accent },
  avatarEmoji: { fontSize: 44 },
  styleList: { gap: tokens.spacing[3] },
  styleCard: {
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleTitle: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
  styleSample: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[2],
    fontStyle: 'italic',
  },
})
