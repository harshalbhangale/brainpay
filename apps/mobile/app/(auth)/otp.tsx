import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
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
 * OTP entry — 6 boxed digit inputs with iOS auto-fill via
 * textContentType="oneTimeCode" on the first input. Submits automatically
 * when the 6th digit lands.
 *
 * Wrong code → shake animation, clear, refocus first.
 * Resend countdown 30s, max 5 attempts (Twilio enforces upstream).
 */

const RESEND_SECS = 30
const CODE_LEN = 6

export default function OtpScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const phone = useAuthStore((s) => s.phone)
  const verifyCode = useAuthStore((s) => s.verifyCode)
  const resend = useAuthStore((s) => s.resend)
  const hasPendingInvite = useAuthStore((s) => s.hasPendingInvite)
  const accountType = useAuthStore((s) => s.accountType)

  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [secsLeft, setSecsLeft] = useState(RESEND_SECS)
  const inputs = useRef<Array<TextInput | null>>(Array(CODE_LEN).fill(null))
  const shake = useRef(new Animated.Value(0)).current

  // Resend countdown
  useEffect(() => {
    if (secsLeft <= 0) return
    const t = setTimeout(() => setSecsLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [secsLeft])

  // Auto-submit when 6th digit lands
  useEffect(() => {
    const code = digits.join('')
    if (code.length === CODE_LEN && !verifying) {
      submit(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const submit = async (code: string) => {
    setVerifying(true)
    setError(null)
    try {
      await verifyCode(code)
      // Routing: pending invite → invite-accept; new user → role-select; else → home (handled by root layout)
      if (hasPendingInvite) {
        router.replace('/(auth)/invite-accept')
      } else if (!accountType) {
        router.replace('/(auth)/role-select')
      } else {
        router.replace('/')
      }
    } catch {
      setError('Wrong code. Try again.')
      setDigits(Array(CODE_LEN).fill(''))
      inputs.current[0]?.focus()
      Animated.sequence([
        Animated.timing(shake, { toValue: 10,  duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 6,   duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -6,  duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0,   duration: 50, useNativeDriver: true }),
      ]).start()
    } finally {
      setVerifying(false)
    }
  }

  const onChange = (i: number, v: string) => {
    // iOS auto-fill drops all 6 digits into the first box.
    if (i === 0 && v.length > 1) {
      const split = v.replace(/\D/g, '').slice(0, CODE_LEN).split('')
      const next: string[] = Array(CODE_LEN).fill('').map((_, j) => split[j] ?? '')
      setDigits(next)
      let lastFilled = -1
      for (let j = 0; j < next.length; j++) {
        if (next[j] !== '') lastFilled = j
      }
      inputs.current[Math.min(lastFilled + 1, CODE_LEN - 1)]?.focus()
      return
    }
    const ch = v.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = ch
      return next
    })
    if (ch && i < CODE_LEN - 1) inputs.current[i + 1]?.focus()
  }

  const onKey = (i: number, key: string) => {
    if (key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  const onResend = async () => {
    if (secsLeft > 0) return
    await resend()
    setSecsLeft(RESEND_SECS)
    setDigits(Array(CODE_LEN).fill(''))
    inputs.current[0]?.focus()
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
      <Pressable hitSlop={16} onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.subtitle}>Sent to {phone ?? 'your phone'}</Text>

      <Animated.View style={[styles.codeRow, { transform: [{ translateX: shake }] }]}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => { inputs.current[i] = r }}
            style={[styles.box, d && styles.boxFilled, error && styles.boxError]}
            value={d}
            onChangeText={(v) => onChange(i, v)}
            onKeyPress={(e) => onKey(i, e.nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={i === 0 ? CODE_LEN : 1}
            textContentType={i === 0 ? 'oneTimeCode' : 'none'}
            autoComplete={i === 0 ? 'sms-otp' : 'off'}
            selectTextOnFocus
            autoFocus={i === 0}
          />
        ))}
      </Animated.View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.resendRow}>
        <Text style={styles.resendLabel}>Didn't get it?</Text>
        <Pressable onPress={onResend} disabled={secsLeft > 0}>
          <Text style={[styles.resendLink, secsLeft > 0 && styles.resendLinkDisabled]}>
            {secsLeft > 0 ? `Resend in ${secsLeft}s` : 'Resend'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  back: { paddingVertical: tokens.spacing[2] },
  backText: { color: tokens.color.text, fontSize: tokens.fontSize.md },
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
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[2],
  },
  box: {
    flex: 1,
    height: 64,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  boxFilled: { borderColor: tokens.color.accent },
  boxError: { borderColor: tokens.color.danger },
  error: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[3],
    textAlign: 'center',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: tokens.spacing[5],
  },
  resendLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },
  resendLink: { color: tokens.color.accent, fontWeight: '700', fontSize: tokens.fontSize.sm },
  resendLinkDisabled: { color: tokens.color.textMuted },
})
