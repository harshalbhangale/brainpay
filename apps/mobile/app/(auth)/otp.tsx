import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Keyboard,
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
import { useAuthStore } from '@/stores/auth'
import { kidTheme as tokens } from '@/theme/tokens'

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
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const errorMessage = useAuthStore((s) => s.errorMessage)

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [secsLeft, setSecsLeft] = useState(RESEND_SECS)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const shake = useRef(new Animated.Value(0)).current

  const digits = code.padEnd(CODE_LEN, '').split('').slice(0, CODE_LEN)
  const canSubmit = code.length === CODE_LEN && !verifying

  useEffect(() => {
    if (secsLeft <= 0) return
    const t = setTimeout(() => setSecsLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [secsLeft])

  useEffect(() => {
    if (code.length === CODE_LEN && !verifying) {
      doSubmit(code)
    }
  }, [code])

  const doSubmit = async (codeToSubmit: string) => {
    if (codeToSubmit.length !== CODE_LEN || verifying) return
    Keyboard.dismiss()
    setVerifying(true)
    setError(null)
    try {
      await verifyCode(codeToSubmit)
      if (hasPendingInvite) {
        // Has a pending join request — show it
        router.replace('/(auth)/join-request')
      } else if (onboardingComplete) {
        // Fully onboarded returning user — go to app
        router.replace('/')
      } else if (accountType === 'kid') {
        // Accepted join request previously but never finished persona
        router.replace('/(auth)/kid-persona')
      } else if (accountType === 'parent') {
        // Started parent onboarding but never finished
        router.replace('/(auth)/parent-onboarding')
      } else {
        // Brand new user — pick a role
        router.replace('/(auth)/role-select')
      }
    } catch (err) {
      const detail = (err as Error)?.message || useAuthStore.getState().errorMessage
      setError(detail || 'Wrong code. Try again.')
      setCode('')
      inputRef.current?.focus()
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

  const onResend = async () => {
    if (secsLeft > 0) return
    await resend()
    setSecsLeft(RESEND_SECS)
    setCode('')
    setError(null)
    inputRef.current?.focus()
  }

  const displayError = error ?? errorMessage

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[5] }]}>
        <Pressable hitSlop={16} onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>‹ Back</Text>
        </Pressable>

        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>Enter the code</Text>
          <Text style={s.subtitle}>Sent to {phone ?? 'your phone'}</Text>

          {/* Box row — the real TextInput sits on top, transparent */}
          <View style={s.codeWrap}>
            <Animated.View
              style={[s.codeRow, { transform: [{ translateX: shake }] }]}
              pointerEvents="none"
            >
              {digits.map((d, i) => {
                const isActive = focused && i === Math.min(code.length, CODE_LEN - 1)
                const isFilled = i < code.length
                return (
                  <View
                    key={i}
                    style={[
                      s.box,
                      isFilled && s.boxFilled,
                      isActive && s.boxActive,
                      !!displayError && s.boxError,
                    ]}
                  >
                    {isFilled
                      ? <Text style={s.boxDigit}>{d}</Text>
                      : isActive
                        ? <View style={s.cursor} />
                        : null
                    }
                  </View>
                )
              })}
            </Animated.View>

            {/* Transparent full-size input overlaid on the boxes */}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(v) => {
                setError(null)
                setCode(v.replace(/\D/g, '').slice(0, CODE_LEN))
              }}
              keyboardType="number-pad"
              maxLength={CODE_LEN}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={s.overlayInput}
              caretHidden
            />
          </View>

          {displayError ? <Text style={s.error}>{displayError}</Text> : null}

          <View style={s.resendRow}>
            <Text style={s.resendLabel}>Didn't get it?</Text>
            <Pressable onPress={onResend} disabled={secsLeft > 0}>
              <Text style={[s.resendLink, secsLeft > 0 && s.resendLinkDisabled]}>
                {secsLeft > 0 ? `Resend in ${secsLeft}s` : 'Resend'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Verify button with bottom padding */}
        <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, tokens.spacing[5]) }]}>
          <Pressable
            style={[s.cta, !canSubmit && s.ctaDisabled]}
            onPress={() => doSubmit(code)}
            disabled={!canSubmit}
          >
            {verifying
              ? <ActivityIndicator color="#000" />
              : <Text style={[s.ctaText, !canSubmit && s.ctaTextDisabled]}>Verify</Text>
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  scrollContent: { flexGrow: 1, paddingBottom: tokens.spacing[5] },
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

  // Container that stacks boxes + transparent input
  codeWrap: {
    height: 68,
    marginBottom: tokens.spacing[4],
  },
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    height: 68,
  },
  box: {
    width: 48,
    height: 68,
    borderRadius: 14,
    backgroundColor: tokens.color.surface,
    borderWidth: 2,
    borderColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: tokens.color.blue,
    backgroundColor: tokens.color.blue + '12',
  },
  boxActive: {
    borderColor: tokens.color.blue,
    backgroundColor: tokens.color.blue + '12',
  },
  boxError: {
    borderColor: tokens.color.danger,
    backgroundColor: tokens.color.danger + '12',
  },
  boxDigit: {
    color: tokens.color.text,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
  },
  cursor: {
    width: 2,
    height: 28,
    backgroundColor: tokens.color.blue,
    borderRadius: 1,
  },

  // Sits on top of the boxes, captures input, fully transparent
  overlayInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    color: 'transparent',
  } as any,

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
  resendLink: { color: tokens.color.blue, fontWeight: '700', fontSize: tokens.fontSize.sm },
  resendLinkDisabled: { color: tokens.color.textMuted },

  bottomBar: {
    paddingTop: tokens.spacing[4],
    paddingHorizontal: 0,
  },
  cta: {
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: tokens.color.surface2 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  ctaTextDisabled: { color: tokens.color.textMuted },
})
