import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SlidingWizard } from '@/components/SlidingWizard'
import { api } from '@/lib/api'
import { useFamilyStore } from '@/stores/family'
import { tokens } from '@/theme/tokens'

/**
 * Family creation — Name → Avatar → Add first kid CTA.
 * On final slide tap "Add a kid" → routes to /(app)/parent/add-kid (Task 6)
 * which itself triggers the kid-persona wizard + invite send.
 */

const FAMILY_AVATARS = ['🏡', '👪', '🌳', '⭐', '✨', '🎨'] as const

export default function FamilyCreate() {
  const router = useRouter()
  const setFamily = useFamilyStore((s) => s.setFamily)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && avatar !== null) ||
    step === 2

  const onComplete = async () => {
    if (!name.trim() || !avatar) return
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await api<{ family: { id: string; name: string; avatar: string | null } }>(
        '/family',
        {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), avatar }),
        },
      )
      setFamily(res.family)
      // After creation, route to the parent home (where they'll see the
      // populated empty-but-no-kids state with "+ Add another kid").
      router.replace('/(app)/parent')
    } catch (err) {
      setError(String(err))
      setCreating(false)
    }
  }

  return (
    <SlidingWizard
      step={step}
      onStepChange={setStep}
      canContinue={canContinue && !creating}
      onComplete={onComplete}
      onBack={() => router.back()}
      continueLabel="Create family"
      steps={[
        // Slide 1 — name
        <View key="name" style={s.slide}>
          <Text style={s.title}>Name your family</Text>
          <Text style={s.subtitle}>You can change this later.</Text>
          <TextInput
            style={s.input}
            placeholder="Smith Family"
            placeholderTextColor={tokens.color.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={40}
            autoComplete="family-name"
          />
        </View>,

        // Slide 2 — avatar
        <View key="avatar" style={s.slide}>
          <Text style={s.title}>Pick a family icon</Text>
          <Text style={s.subtitle}>Sets the tone of the home screen.</Text>
          <View style={s.grid}>
            {FAMILY_AVATARS.map((emoji) => {
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

        // Slide 3 — confirm + create
        <View key="confirm" style={s.slide}>
          <Text style={s.title}>Ready?</Text>
          <Text style={s.subtitle}>You can add kids next.</Text>

          <View style={s.preview}>
            <Text style={s.previewEmoji}>{avatar ?? '🏡'}</Text>
            <Text style={s.previewName}>{name.trim() || 'Your family'}</Text>
            <Text style={s.previewMeta}>0 kids · 0 🧠</Text>
          </View>

          {error && <Text style={s.error}>Couldn't create the family. Try again.</Text>}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
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
  preview: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[5],
    alignItems: 'center',
    marginTop: tokens.spacing[3],
  },
  previewEmoji: { fontSize: 64 },
  previewName: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
    marginTop: tokens.spacing[3],
  },
  previewMeta: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[1],
  },
  error: { color: tokens.color.danger, marginTop: tokens.spacing[4], fontSize: tokens.fontSize.sm },
})
