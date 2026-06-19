import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { ArrowLeft, CircleCheck, UserPlus } from 'lucide-react-native'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Add a kid — dead simple. Name + phone, nothing else.
 *
 * Parent enters the kid's name and phone number. The kid sees the request
 * when they sign in and taps Accept. No starting balance, no invite codes,
 * no SMS. Money is sent later from the parent dashboard.
 */

const COUNTRY_CODES = [
  { flag: '🇦🇺', dial: '+61', name: 'AU' },
  { flag: '🇺🇸', dial: '+1',  name: 'US' },
  { flag: '🇬🇧', dial: '+44', name: 'UK' },
  { flag: '🇮🇳', dial: '+91', name: 'IN' },
  { flag: '🇳🇿', dial: '+64', name: 'NZ' },
]

const ROLES = [
  { key: 'kid', label: 'Kid', emoji: '🧒' },
  { key: 'co_parent', label: 'Parent', emoji: '🧑' },
  { key: 'guardian', label: 'Guardian', emoji: '🧓' },
] as const
type RoleKey = (typeof ROLES)[number]['key']

export default function AddKid() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [countryIdx, setCountryIdx] = useState(0)
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const [localPhone, setLocalPhone] = useState('')
  const [kidName, setKidName] = useState('')
  const [role, setRole] = useState<RoleKey>('kid')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const country = COUNTRY_CODES[countryIdx]
  const roleLabel = ROLES.find((r) => r.key === role)?.label ?? 'Member'
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
          role,
          kidSeed: { name: kidName.trim() || undefined },
        }),
      })
      setSent(true)
      queryClient.invalidateQueries({ queryKey: ['family'] })
      queryClient.invalidateQueries({ queryKey: ['pending-kids'] })
    } catch (err) {
      const msg = String(err)
      if (msg.includes('already_in_family')) {
        setError('This number is already added.')
      } else {
        setError('Could not add. Check the number and try again.')
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
        <Text style={s.sentTitle}>{kidName.trim() || roleLabel} added!</Text>
        <Text style={s.sentSub}>
          When they sign in with {e164}, they'll see your request and tap Accept.
        </Text>
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
          <Text style={s.title}>Add to family</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={s.content}
          contentContainerStyle={s.contentInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* How it works */}
          <View style={s.howItWorks}>
            <UserPlus size={tokens.iconSize.lg} color={tokens.color.primary} strokeWidth={1.5} />
            <Text style={s.howText}>
              Just their name and number. They'll see your request when they sign in.
            </Text>
          </View>

          {/* Role */}
          <Text style={s.label}>ADD AS</Text>
          <View style={s.roleRow}>
            {ROLES.map((r) => {
              const active = role === r.key
              return (
                <Pressable key={r.key} style={[s.roleChip, active && s.roleChipActive]} onPress={() => setRole(r.key)}>
                  <Text style={s.roleEmoji}>{r.emoji}</Text>
                  <Text style={[s.roleLabel, active && s.roleLabelActive]}>{r.label}</Text>
                </Pressable>
              )
            })}
          </View>

          {/* Kid name */}
          <Text style={s.label}>NAME</Text>
          <TextInput
            style={s.input}
            value={kidName}
            onChangeText={setKidName}
            placeholder="Jamie"
            placeholderTextColor={tokens.color.textMuted}
            autoComplete="name"
            maxLength={20}
            autoFocus
            returnKeyType="next"
          />

          {/* Phone number */}
          <Text style={s.label}>PHONE NUMBER</Text>
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
              onChangeText={(v) => setLocalPhone(v.replace(/\D/g, ''))}
              placeholder="412 345 678"
              placeholderTextColor={tokens.color.textMuted}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={15}
              returnKeyType="done"
              onSubmitEditing={sendRequest}
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

          {error && <Text style={s.error}>{error}</Text>}
        </ScrollView>

        {/* CTA */}
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, tokens.spacing[4]) }]}>
          <Pressable
            style={[s.cta, (!phoneValid || sending) && s.ctaDisabled]}
            onPress={sendRequest}
            disabled={!phoneValid || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>Add {roleLabel.toLowerCase()}</Text>
            )}
          </Pressable>
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

  content: { flex: 1 },
  contentInner: { paddingTop: tokens.spacing[3], paddingBottom: tokens.spacing[5] },

  howItWorks: {
    flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[3],
    backgroundColor: tokens.color.primary + '14',
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.color.primary + '33',
    marginBottom: tokens.spacing[5],
  },
  howText: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, lineHeight: 20 },

  label: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '800',
    letterSpacing: 1.2, marginBottom: tokens.spacing[2], marginTop: tokens.spacing[4],
  },

  roleRow: { flexDirection: 'row', gap: tokens.spacing[2] },
  roleChip: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md,
    borderWidth: 1.5, borderColor: tokens.color.surface2,
  },
  roleChipActive: { borderColor: tokens.color.primary, backgroundColor: tokens.color.primary + '12' },
  roleEmoji: { fontSize: 22 },
  roleLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  roleLabelActive: { color: tokens.color.primary },

  input: {
    backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '600',
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

  error: { color: tokens.color.danger, fontSize: tokens.fontSize.sm, marginTop: tokens.spacing[3] },

  bottom: { paddingTop: tokens.spacing[3] },
  cta: {
    height: 56, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: tokens.fontSize.md },

  // Success state
  sentTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  sentSub: {
    color: tokens.color.text, fontSize: tokens.fontSize.md,
    textAlign: 'center', lineHeight: 22,
    paddingHorizontal: tokens.spacing[4],
  },
})
