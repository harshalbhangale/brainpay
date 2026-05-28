import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, CircleCheck, UserPlus } from 'lucide-react-native'
import { api } from '@/lib/api'
import { tokens } from '@/theme/tokens'

/**
 * Add a kid — new flow (no invite codes, no SMS).
 *
 * Parent enters kid's phone number.
 * Server stores a join request.
 * Kid sees it when they sign in and taps Accept.
 *
 * Simple. No Twilio. No invite codes.
 */

const COUNTRY_CODES = [
  { flag: '🇦🇺', dial: '+61', name: 'AU' },
  { flag: '🇺🇸', dial: '+1',  name: 'US' },
  { flag: '🇬🇧', dial: '+44', name: 'UK' },
  { flag: '🇮🇳', dial: '+91', name: 'IN' },
  { flag: '🇳🇿', dial: '+64', name: 'NZ' },
]

export default function AddKid() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [countryIdx, setCountryIdx] = useState(0)
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const [localPhone, setLocalPhone] = useState('')
  const [kidName, setKidName] = useState('')
  const [initialTopup, setInitialTopup] = useState(100)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const country = COUNTRY_CODES[countryIdx]
  const e164 = `${country.dial}${localPhone.replace(/\D/g, '')}`
  const phoneValid = localPhone.replace(/\D/g, '').length >= 6

  const sendRequest = async () => {
    if (!phoneValid || sending) return
    setSending(true)
    setError(null)

    try {
      await api('/join-requests', {
        method: 'POST',
        body: JSON.stringify({
          phone: e164,
          initialTopup,
          kidSeed: { name: kidName.trim() || undefined },
        }),
      })
      setSent(true)
      queryClient.invalidateQueries({ queryKey: ['family'] })
    } catch (err) {
      const msg = String(err)
      if (msg.includes('already_in_family')) {
        setError('This number is already in your family.')
      } else {
        setError('Could not send request. Check the number and try again.')
      }
    } finally {
      setSending(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────
  if (sent) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CircleCheck size={80} color={tokens.color.accent} strokeWidth={1.0} />
        <Text style={s.sentTitle}>Request sent!</Text>
        <Text style={s.sentSub}>
          When {kidName.trim() || 'your kid'} signs in with {e164}, they'll see your request and can accept it.
        </Text>
        <Text style={s.sentNote}>No SMS needed — they just sign in.</Text>
        <Pressable style={s.cta} onPress={() => router.back()}>
          <Text style={s.ctaText}>Done</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
          </Pressable>
          <Text style={s.title}>Add a kid</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={s.content}>
          {/* How it works */}
          <View style={s.howItWorks}>
            <UserPlus size={tokens.iconSize.lg} color={tokens.color.accent} strokeWidth={1.5} />
            <Text style={s.howText}>
              Enter your kid's phone number. When they sign in, they'll see your request and tap Accept.
            </Text>
          </View>

          {/* Kid name (optional) */}
          <Text style={s.label}>Kid's name (optional)</Text>
          <TextInput
            style={s.input}
            value={kidName}
            onChangeText={setKidName}
            placeholder="Jamie"
            placeholderTextColor={tokens.color.textMuted}
            autoComplete="name"
            maxLength={20}
          />

          {/* Phone number */}
          <Text style={s.label}>Kid's phone number</Text>
          <View style={s.phoneRow}>
            <Pressable
              style={s.countryBtn}
              onPress={() => setShowCountryPicker(!showCountryPicker)}
            >
              <Text style={s.countryFlag}>{country.flag}</Text>
              <Text style={s.countryDial}>{country.dial}</Text>
              <Text style={s.countryChev}>▾</Text>
            </Pressable>
            <TextInput
              style={s.phoneInput}
              value={localPhone}
              onChangeText={setLocalPhone}
              placeholder="412 345 678"
              placeholderTextColor={tokens.color.textMuted}
              keyboardType="phone-pad"
              autoFocus
              maxLength={15}
            />
          </View>

          {/* Country picker */}
          {showCountryPicker && (
            <View style={s.countryPicker}>
              {COUNTRY_CODES.map((c, i) => (
                <Pressable
                  key={c.dial}
                  style={s.countryPickerRow}
                  onPress={() => {
                    setCountryIdx(i)
                    setShowCountryPicker(false)
                  }}
                >
                  <Text style={s.countryFlag}>{c.flag}</Text>
                  <Text style={s.countryPickerName}>{c.name}</Text>
                  <Text style={s.countryDial}>{c.dial}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Starting Brains */}
          <Text style={s.label}>Starting Brains</Text>
          <View style={s.chipRow}>
            {[0, 50, 100, 200, 500].map((amt) => (
              <Pressable
                key={amt}
                style={[s.chip, initialTopup === amt && { backgroundColor: tokens.color.accent }]}
                onPress={() => setInitialTopup(amt)}
              >
                <Text style={[s.chipText, initialTopup === amt && { color: '#000' }]}>
                  {amt === 0 ? 'None' : `${amt} 🧠`}
                </Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={s.error}>{error}</Text>}
        </View>

        {/* CTA */}
        <View style={s.bottom}>
          <Pressable
            style={[s.cta, (!phoneValid || sending) && s.ctaDisabled]}
            onPress={sendRequest}
            disabled={!phoneValid || sending}
          >
            {sending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.ctaText}>Send request</Text>
            )}
          </Pressable>
          <Text style={s.hint}>
            They'll see this when they sign in — no SMS needed
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center', gap: tokens.spacing[3] },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },

  content: { flex: 1, paddingTop: tokens.spacing[3] },

  howItWorks: {
    flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[3],
    backgroundColor: tokens.color.accent + '15',
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.color.accent + '33',
    marginBottom: tokens.spacing[5],
  },
  howText: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, lineHeight: 20 },

  label: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: tokens.spacing[2], marginTop: tokens.spacing[4],
  },

  input: {
    backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.md,
  },

  phoneRow: { flexDirection: 'row', gap: tokens.spacing[2] },
  countryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[3], height: 56,
    borderRadius: tokens.radius.md,
  },
  countryFlag: { fontSize: 20 },
  countryDial: { color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md },
  countryChev: { color: tokens.color.textMuted, fontSize: 12 },
  phoneInput: {
    flex: 1, backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '600',
  },

  countryPicker: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    marginTop: tokens.spacing[2],
    overflow: 'hidden',
  },
  countryPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3],
  },
  countryPickerName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.md },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] },
  chip: {
    paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill,
  },
  chipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  error: { color: tokens.color.danger, fontSize: tokens.fontSize.sm, marginTop: tokens.spacing[3] },

  bottom: { paddingTop: tokens.spacing[3] },
  cta: {
    height: 56, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  hint: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs,
    textAlign: 'center', marginTop: tokens.spacing[2],
  },

  // Success state
  sentTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  sentSub: {
    color: tokens.color.text, fontSize: tokens.fontSize.md,
    textAlign: 'center', lineHeight: 22,
    paddingHorizontal: tokens.spacing[4],
  },
  sentNote: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, textAlign: 'center' },
})
