import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Phone entry — country picker (default AU) + phone input.
 * On Continue → POST otp-start → OTP screen.
 *
 * Lightweight E.164 validation: country code + 6-15 digits. Avoids
 * pulling in libphonenumber-js (~200KB) for a flow this simple.
 */

const COUNTRIES = [
  { name: 'Australia',     dial: '+61', flag: '🇦🇺' },
  { name: 'New Zealand',   dial: '+64', flag: '🇳🇿' },
  { name: 'United States', dial: '+1',  flag: '🇺🇸' },
  { name: 'United Kingdom',dial: '+44', flag: '🇬🇧' },
  { name: 'India',         dial: '+91', flag: '🇮🇳' },
] as const

export default function PhoneScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const sendCode = useAuthStore((s) => s.sendCode)
  const status = useAuthStore((s) => s.status)
  const [country, setCountry] = useState<typeof COUNTRIES[number]>(COUNTRIES[0])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [local, setLocal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const e164 = useMemo(() => {
    const digits = local.replace(/\D/g, '')
    return `${country.dial}${digits}`
  }, [country, local])

  const valid = useMemo(() => {
    const digits = local.replace(/\D/g, '')
    return digits.length >= 6 && digits.length <= 15
  }, [local])

  const submit = async () => {
    if (!valid) return
    setError(null)
    try {
      await sendCode(e164)
      router.push('/(auth)/otp')
    } catch {
      setError("Couldn't send the code. Check your number and try again.")
    }
  }

  const sending = status === 'sendingCode'

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>What's your number?</Text>
        <Text style={styles.subtitle}>We'll text you a code.</Text>

        {/* Country + phone row */}
        <View style={styles.row}>
          <Pressable style={styles.country} onPress={() => setPickerOpen((v) => !v)}>
            <Text style={styles.flag}>{country.flag}</Text>
            <Text style={styles.dial}>{country.dial}</Text>
            <Text style={styles.chev}>▾</Text>
          </Pressable>

          <TextInput
            style={styles.phone}
            placeholder="412 345 678"
            placeholderTextColor={tokens.color.textMuted}
            keyboardType="phone-pad"
            autoFocus
            value={local}
            onChangeText={setLocal}
            maxLength={20}
            textContentType="telephoneNumber"
            autoComplete="tel"
          />
        </View>

        {pickerOpen && (
          <View style={styles.picker}>
            {COUNTRIES.map((c) => (
              <Pressable
                key={c.dial}
                style={styles.pickerRow}
                onPress={() => {
                  setCountry(c)
                  setPickerOpen(false)
                }}
              >
                <Text style={styles.flag}>{c.flag}</Text>
                <Text style={styles.pickerName}>{c.name}</Text>
                <Text style={styles.pickerDial}>{c.dial}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.legal}>
          By continuing you agree to the{' '}
          <Text style={styles.legalLink}>Terms</Text> and{' '}
          <Text style={styles.legalLink}>Privacy Policy</Text>.
        </Text>
      </View>

      <Pressable
        style={[styles.cta, !valid && styles.ctaDisabled]}
        onPress={submit}
        disabled={!valid || sending}
      >
        {sending ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={[styles.ctaText, !valid && styles.ctaTextDisabled]}>Continue</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  title: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '800',
    marginTop: tokens.spacing[5],
  },
  subtitle: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[6],
  },
  row: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
    marginBottom: tokens.spacing[3],
  },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[4],
    height: 56,
    borderRadius: tokens.radius.md,
  },
  flag: { fontSize: 20 },
  dial: { color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md },
  chev: { color: tokens.color.textMuted, fontSize: 12 },
  phone: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[4],
    height: 56,
    borderRadius: tokens.radius.md,
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
  },
  picker: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    marginTop: tokens.spacing[2],
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    gap: tokens.spacing[3],
  },
  pickerName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.md },
  pickerDial: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },
  error: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[3],
  },
  legal: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.xs,
    marginTop: tokens.spacing[6],
    lineHeight: 18,
  },
  legalLink: { color: tokens.color.text, textDecorationLine: 'underline' },
  cta: {
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing[4],
  },
  ctaDisabled: { backgroundColor: tokens.color.surface2 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  ctaTextDisabled: { color: tokens.color.textMuted },
})
