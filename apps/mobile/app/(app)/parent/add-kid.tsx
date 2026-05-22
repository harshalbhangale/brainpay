import { useRouter } from 'expo-router'
import { useState } from 'react'
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
import { tokens } from '@/theme/tokens'

/**
 * Add a kid — parent fills kid persona on the kid's behalf, then we
 * generate an invite. The kid will see this as pre-filled defaults during
 * their own persona wizard (Task 7) but can change anything except the
 * initial top-up.
 *
 * Slides: name → age → color → avatar → PAL voice → initial top-up
 *
 * On complete: POST /invites with kidSeed → routes to invite-send screen
 * with the new invite id + token.
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
  { id: 'sarcastic',  emoji: '🤖', name: 'Sarcastic robot',  desc: 'Dry, deadpan, pure roast.' },
  { id: 'cool',       emoji: '😎', name: 'Cool friend',       desc: 'Like your YouTuber best mate.' },
  { id: 'wise',       emoji: '🧙', name: 'Wise wizard',       desc: 'Old-soul advice with bite.' },
  { id: 'hyped',      emoji: '⚡', name: 'Hyped coach',       desc: 'Cheers every good call.' },
  { id: 'chill',      emoji: '🌴', name: 'Chill surfer',      desc: 'Laid back, gentle vibes.' },
  { id: 'auntie',     emoji: '👵', name: 'Sassy auntie',      desc: 'Has seen it all. Tells it.' },
] as const

const TOPUP_CHIPS = [50, 100, 200, 500] as const

const AGE_RANGE = Array.from({ length: 10 }, (_, i) => i + 8) // 8–17

export default function AddKid() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [age, setAge] = useState<number | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [voiceId, setVoiceId] = useState<string | null>(null)
  const [topup, setTopup] = useState<number>(100)
  const [creating, setCreating] = useState(false)

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && age !== null) ||
    (step === 2 && color !== null) ||
    (step === 3 && avatar !== null) ||
    (step === 4 && voiceId !== null) ||
    (step === 5 && topup > 0)

  const accent = color ?? tokens.color.accent

  const onComplete = async () => {
    if (creating) return
    setCreating(true)
    try {
      const res = await api<{
        invite: { id: string; code: string; token: string; link: string; qrData: string }
      }>('/invites', {
        method: 'POST',
        body: JSON.stringify({
          expectedRole: 'kid',
          initialTopup: topup,
          kidSeed: {
            name: name.trim(),
            age,
            color,
            avatar,
            voiceId,
          },
        }),
      })
      router.replace({
        pathname: '/(app)/parent/invite-send',
        params: {
          inviteId: res.invite.id,
          code: res.invite.code,
          link: res.invite.link,
          qrData: res.invite.qrData,
          kidName: name.trim(),
          kidAvatar: avatar ?? '🧒',
        },
      })
    } catch (err) {
      console.error('add_kid_failed', err)
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
      continueLabel="Send invite"
      accent={accent}
      steps={[
        // Slide 1 — name
        <View key="name" style={s.slide}>
          <Text style={s.title}>What's their name?</Text>
          <Text style={s.subtitle}>They can change this later.</Text>
          <TextInput
            style={s.input}
            placeholder="Jamie"
            placeholderTextColor={tokens.color.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={20}
            autoComplete="name"
          />
        </View>,

        // Slide 2 — age
        <View key="age" style={s.slide}>
          <Text style={s.title}>How old are they?</Text>
          <Text style={s.subtitle}>Helps PAL talk at the right level.</Text>
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

        // Slide 3 — color
        <View key="color" style={s.slide}>
          <Text style={s.title}>Pick their color</Text>
          <Text style={s.subtitle}>This follows them everywhere in the app.</Text>
          <View style={s.colorGrid}>
            {ACCENT_PALETTE.map((c) => {
              const picked = color === c.color
              return (
                <Pressable
                  key={c.color}
                  style={[
                    s.colorSwatch,
                    { backgroundColor: c.color },
                    picked && s.colorPicked,
                  ]}
                  onPress={() => setColor(c.color)}
                >
                  {picked && <Text style={s.colorCheck}>✓</Text>}
                </Pressable>
              )
            })}
          </View>
        </View>,

        // Slide 4 — avatar
        <View key="avatar" style={s.slide}>
          <Text style={s.title}>Pick an avatar</Text>
          <Text style={s.subtitle}>You can switch later.</Text>
          <View style={s.avatarGrid}>
            {KID_AVATARS.map((emoji) => {
              const picked = avatar === emoji
              return (
                <Pressable
                  key={emoji}
                  style={[
                    s.avatarBubble,
                    picked && { borderColor: accent, backgroundColor: accent + '22' },
                  ]}
                  onPress={() => setAvatar(emoji)}
                >
                  <Text style={s.avatarEmoji}>{emoji}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // Slide 5 — PAL voice
        <View key="voice" style={s.slide}>
          <Text style={s.title}>Pick a PAL voice</Text>
          <Text style={s.subtitle}>The character your kid hears.</Text>
          <View style={s.voiceList}>
            {VOICES.map((v) => {
              const picked = voiceId === v.id
              return (
                <Pressable
                  key={v.id}
                  style={[
                    s.voiceCard,
                    picked && { borderColor: accent, backgroundColor: tokens.color.surface2 },
                  ]}
                  onPress={() => setVoiceId(v.id)}
                >
                  <Text style={s.voiceEmoji}>{v.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.voiceName}>{v.name}</Text>
                    <Text style={s.voiceDesc}>{v.desc}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>,

        // Slide 6 — initial top-up
        <View key="topup" style={s.slide}>
          <Text style={s.title}>Starting Brains</Text>
          <Text style={s.subtitle}>How much should they begin with?</Text>
          <Text style={[s.bigAmount, { color: accent }]}>{topup} 🧠</Text>
          <View style={s.chipsRow}>
            {TOPUP_CHIPS.map((amt) => {
              const picked = topup === amt
              return (
                <Pressable
                  key={amt}
                  style={[
                    s.chip,
                    picked && { backgroundColor: accent, borderColor: accent },
                  ]}
                  onPress={() => setTopup(amt)}
                >
                  <Text style={[s.chipText, picked && { color: '#000' }]}>{amt}</Text>
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
    marginBottom: tokens.spacing[5],
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

  ageRow: { gap: tokens.spacing[3], paddingVertical: tokens.spacing[3] },
  ageChip: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  ageNum: { color: tokens.color.text, fontWeight: '800', fontSize: tokens.fontSize.lg },

  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
  colorSwatch: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'transparent',
  },
  colorPicked: { borderColor: '#fff' },
  colorCheck: { color: '#fff', fontSize: 28, fontWeight: '900' },

  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[3] },
  avatarBubble: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'transparent',
  },
  avatarEmoji: { fontSize: 36 },

  voiceList: { gap: tokens.spacing[3] },
  voiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4], borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
  },
  voiceEmoji: { fontSize: 32 },
  voiceName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  voiceDesc: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },

  bigAmount: {
    fontSize: 64, fontWeight: '900', textAlign: 'center',
    marginVertical: tokens.spacing[5],
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.spacing[3] },
  chip: {
    paddingHorizontal: tokens.spacing[5], height: 48,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface,
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { color: tokens.color.text, fontWeight: '800', fontSize: tokens.fontSize.md },
})
