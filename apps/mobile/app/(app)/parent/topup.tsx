import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlatformPay, PlatformPayButton, PlatformPay } from '@stripe/stripe-react-native'
import { ArrowLeft, CircleArrowUp } from 'lucide-react-native'
import { useFamily } from '@/hooks/useFamily'
import { api } from '@/lib/api'
import { Confetti } from '@/components'
import { tokens } from '@/theme/tokens'

/**
 * Top-up wizard — 4 slides:
 *   1. Pick kid (skipped if one kid)
 *   2. Pick amount ($5/$10/$20/$50/custom)
 *   3. Note (optional, with chips)
 *   4. Apple Pay sheet
 *
 * On success: confetti, push to kid, navigate back to dashboard.
 */

const NOTE_CHIPS = ['Just because', 'Chores', 'Homework', 'Birthday', 'Good behaviour']

export default function ParentTopup() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { kidId: prefilledKidId } = useLocalSearchParams<{ kidId?: string }>()
  const { data: famData } = useFamily()
  const kids = famData?.members.filter((m) => m.role === 'kid') ?? []

  const [step, setStep] = useState(prefilledKidId || kids.length === 1 ? 1 : 0)
  const [kidId, setKidId] = useState<string | undefined>(prefilledKidId ?? (kids.length === 1 ? kids[0].accountId : undefined))
  const [amountDollars, setAmountDollars] = useState(10)
  const [customAmount, setCustomAmount] = useState('')
  const [note, setNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(false)

  const { isPlatformPaySupported, confirmPlatformPayPayment } = usePlatformPay()
  const [applePayAvailable, setApplePayAvailable] = useState(false)

  // Check Apple Pay availability once on mount.
  useEffect(() => {
    isPlatformPaySupported().then(setApplePayAvailable).catch(() => setApplePayAvailable(false))
  }, [isPlatformPaySupported])

  const selectedKid = kids.find((k) => k.accountId === kidId)
  const accent = selectedKid?.persona?.color ?? tokens.color.purple
  const amountCents = amountDollars * 100
  const brainsToReceive = amountCents

  const handlePay = async () => {
    if (!kidId) return
    setPaying(true)

    try {
      // 1. Create PaymentIntent on the API
      const intentRes = await api<{ clientSecret: string }>('/payments/topup-intent', {
        method: 'POST',
        body: JSON.stringify({ amountCents, kidAccountId: kidId }),
      })

      // 2. Present Apple Pay
      const { error } = await confirmPlatformPayPayment(intentRes.clientSecret, {
        applePay: {
          cartItems: [
            {
              label: `Top up ${selectedKid?.persona?.name ?? 'kid'}`,
              amount: amountDollars.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'AU',
          currencyCode: 'AUD',
          requiredBillingContactFields: [],
        },
      })

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Payment failed', error.message)
        }
        setPaying(false)
        return
      }

      // 3. Success
      setSuccess(true)
      // Webhook will credit Brains. Trigger a refetch to show update.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['family'] })
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
      }, 1500)
    } catch (err) {
      Alert.alert('Something went wrong', 'Please try again.')
      console.error('topup error', err)
    } finally {
      setPaying(false)
    }
  }

  // Demo fallback (no Apple Pay) — uses internal /wallet/topup
  const handleDemoPay = async () => {
    if (!kidId) return
    setPaying(true)

    try {
      await api('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({
          kidAccountId: kidId,
          brainsDelta: brainsToReceive,
          note: note || 'Top up',
          kind: 'topup',
        }),
      })
      setSuccess(true)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['family'] })
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
      }, 1000)
    } catch (err) {
      Alert.alert('Could not top up', 'Please try again.')
    } finally {
      setPaying(false)
    }
  }

  if (success) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Confetti show onComplete={() => router.back()} />
        <Text style={s.successCheck}>✓</Text>
        <Text style={s.successTitle}>Sent!</Text>
        <Text style={s.successSub}>
          ${amountDollars.toFixed(2)} → {brainsToReceive.toLocaleString()} 🧠
        </Text>
        <Text style={s.successKid}>to {selectedKid?.persona?.name ?? 'kid'}</Text>
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={() => (step > 0 ? setStep(step - 1) : router.back())}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <View style={s.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[s.dot, i === step && s.dotActive]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Step 0 — Pick kid */}
        {step === 0 && (
          <>
            <Text style={s.title}>Who's getting topped up?</Text>
            <View style={s.kidList}>
              {kids.map((k) => (
                <Pressable
                  key={k.accountId}
                  style={[
                    s.kidCard,
                    kidId === k.accountId && { borderColor: k.persona?.color ?? tokens.color.accent },
                  ]}
                  onPress={() => {
                    setKidId(k.accountId)
                    setTimeout(() => setStep(1), 200)
                  }}
                >
                  <View style={[s.kidAvatar, { backgroundColor: (k.persona?.color ?? tokens.color.accent) + '22' }]}>
                    <Text style={s.kidAvatarEmoji}>{k.persona?.avatar ?? '🧒'}</Text>
                  </View>
                  <Text style={s.kidName}>{k.persona?.name ?? 'Kid'}</Text>
                  <Text style={s.kidBalance}>{k.cachedBalance} 🧠</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Step 1 — Amount */}
        {step === 1 && (
          <>
            <Text style={s.title}>How much?</Text>
            <Text style={s.subtitle}>For {selectedKid?.persona?.name ?? 'kid'}</Text>

            <View style={s.amountDisplay}>
              <Text style={[s.amountValue, { color: accent }]}>${amountDollars}</Text>
              <Text style={s.amountConversion}>→ {brainsToReceive.toLocaleString()} 🧠</Text>
            </View>

            <View style={s.chipRow}>
              {[5, 10, 20, 50, 100].map((amt) => (
                <Pressable
                  key={amt}
                  style={[s.chip, amountDollars === amt && { backgroundColor: accent }]}
                  onPress={() => {
                    setAmountDollars(amt)
                    setCustomAmount('')
                  }}
                >
                  <Text style={[s.chipText, amountDollars === amt && { color: '#000' }]}>${amt}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={s.customInput}
              placeholder="Custom amount"
              placeholderTextColor={tokens.color.textMuted}
              keyboardType="numeric"
              value={customAmount}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9]/g, '')
                setCustomAmount(cleaned)
                if (cleaned) setAmountDollars(parseInt(cleaned, 10))
              }}
            />

            <Pressable
              style={[s.cta, { backgroundColor: accent }, amountDollars < 1 && s.ctaDisabled]}
              onPress={() => setStep(2)}
              disabled={amountDollars < 1}
            >
              <Text style={s.ctaText}>Continue</Text>
            </Pressable>
          </>
        )}

        {/* Step 2 — Note */}
        {step === 2 && (
          <>
            <Text style={s.title}>Add a note?</Text>
            <Text style={s.subtitle}>Optional — your kid will see this</Text>

            <View style={s.chipRowWrap}>
              {NOTE_CHIPS.map((n) => (
                <Pressable
                  key={n}
                  style={[s.chip, note === n && { backgroundColor: accent }]}
                  onPress={() => setNote(n === note ? '' : n)}
                >
                  <Text style={[s.chipText, note === n && { color: '#000' }]}>{n}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={s.customInput}
              placeholder="Or type your own..."
              placeholderTextColor={tokens.color.textMuted}
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />

            <Pressable style={[s.cta, { backgroundColor: accent }]} onPress={() => setStep(3)}>
              <Text style={s.ctaText}>Continue</Text>
            </Pressable>
          </>
        )}

        {/* Step 3 — Pay */}
        {step === 3 && (
          <>
            <Text style={s.title}>Confirm</Text>
            <View style={s.summaryCard}>
              <Text style={s.summaryRow}>
                Sending <Text style={{ color: tokens.color.text, fontWeight: '700' }}>${amountDollars}</Text>
              </Text>
              <Text style={s.summaryRow}>
                to <Text style={{ color: accent, fontWeight: '700' }}>{selectedKid?.persona?.name ?? 'kid'}</Text>
              </Text>
              {note ? <Text style={s.summaryNote}>"{note}"</Text> : null}
              <View style={s.summaryDivider} />
              <Text style={s.summaryConvert}>= {brainsToReceive.toLocaleString()} 🧠</Text>
            </View>

            {paying ? (
              <View style={s.payingState}>
                <ActivityIndicator color={accent} />
                <Text style={s.payingText}>Processing...</Text>
              </View>
            ) : applePayAvailable ? (
              <PlatformPayButton
                onPress={handlePay}
                type={PlatformPay.ButtonType.Pay}
                appearance={PlatformPay.ButtonStyle.Black}
                borderRadius={28}
                style={s.applePayBtn}
              />
            ) : (
              <Pressable style={[s.cta, { backgroundColor: accent }]} onPress={handleDemoPay}>
                <Text style={s.ctaText}>Pay ${amountDollars} (sandbox)</Text>
              </Pressable>
            )}

            <Text style={s.payHint}>
              {applePayAvailable ? 'Double-click side button to confirm' : 'Demo mode — no real payment'}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: tokens.spacing[8] },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.surface2 },
  dotActive: { width: 18, backgroundColor: tokens.color.accent },

  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginTop: tokens.spacing[5] },
  subtitle: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5] },

  kidList: { gap: tokens.spacing[3], marginTop: tokens.spacing[4] },
  kidCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 2, borderColor: 'transparent',
  },
  kidAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  kidAvatarEmoji: { fontSize: 24 },
  kidName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  kidBalance: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },

  amountDisplay: { alignItems: 'center', paddingVertical: tokens.spacing[5] },
  amountValue: { fontSize: 84, fontWeight: '900', letterSpacing: -3 },
  amountConversion: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: tokens.spacing[2] },

  chipRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    flexWrap: 'wrap',
    marginVertical: tokens.spacing[3],
  },
  chipRowWrap: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    flexWrap: 'wrap',
    marginVertical: tokens.spacing[4],
  },
  chip: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
  },
  chipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  customInput: {
    backgroundColor: tokens.color.surface,
    height: 56,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2],
  },

  summaryCard: {
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[5],
    borderRadius: tokens.radius.lg,
    marginTop: tokens.spacing[4],
  },
  summaryRow: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginVertical: 2 },
  summaryNote: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontStyle: 'italic', marginTop: tokens.spacing[2] },
  summaryDivider: { height: 1, backgroundColor: tokens.color.surface2, marginVertical: tokens.spacing[3] },
  summaryConvert: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800', textAlign: 'center' },

  cta: {
    height: 56,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing[5],
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },

  applePayBtn: { height: 56, marginTop: tokens.spacing[5] },
  payingState: {
    height: 56, alignItems: 'center', justifyContent: 'center',
    marginTop: tokens.spacing[5],
    flexDirection: 'row', gap: tokens.spacing[3],
  },
  payingText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md },
  payHint: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, textAlign: 'center', marginTop: tokens.spacing[3] },

  successCheck: {
    fontSize: 80,
    color: tokens.color.accent,
    fontWeight: '900',
  },
  successTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginTop: tokens.spacing[3] },
  successSub: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700', marginTop: tokens.spacing[3] },
  successKid: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: tokens.spacing[2] },
})
