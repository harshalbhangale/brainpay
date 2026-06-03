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
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlatformPay, PlatformPayButton, PlatformPay } from '@stripe/stripe-react-native'
import { ArrowLeft, CheckCircle2, Star } from 'lucide-react-native'
import { useFamily } from '@/hooks/useFamily'
import { api } from '@/lib/api'
import { Confetti } from '@/components'
import { Lottie } from '@/components/Lottie'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Top-up wizard — redesigned.
 * 4 steps: Pick kid → Amount → Note → Pay
 *
 * AUD is the real currency. Brain points shown as a reward layer.
 */

const NOTE_CHIPS = ['Just because', 'Chores', 'Homework', 'Birthday', 'Good behaviour']
const AMOUNTS = [5, 10, 20, 50, 100]

export default function ParentTopup() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { kidId: prefilledKidId } = useLocalSearchParams<{ kidId?: string }>()
  const { data: famData } = useFamily()
  const kids = famData?.members.filter((m) => m.role === 'kid') ?? []

  const [step, setStep] = useState(0)
  const [kidId, setKidId] = useState<string | undefined>(prefilledKidId)

  useEffect(() => {
    if (kids.length === 1 && !kidId) {
      setKidId(kids[0].accountId)
      setStep(1)
    } else if (prefilledKidId && !kidId) {
      setKidId(prefilledKidId)
      setStep(1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids.length, prefilledKidId])

  const [amountDollars, setAmountDollars] = useState(10)
  const [customAmount, setCustomAmount] = useState('')
  const [note, setNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(false)

  const { isPlatformPaySupported, confirmPlatformPayPayment } = usePlatformPay()
  const [applePayAvailable, setApplePayAvailable] = useState(false)

  useEffect(() => {
    isPlatformPaySupported().then(setApplePayAvailable).catch(() => setApplePayAvailable(false))
  }, [isPlatformPaySupported])

  const selectedKid = kids.find((k) => k.accountId === kidId)
  const accent = selectedKid?.persona?.color ?? tokens.color.purple
  const amountCents = amountDollars * 100
  // Brain points: 10 pts per $1
  const brainPoints = amountDollars * 10

  const handlePay = async () => {
    if (!kidId) return
    setPaying(true)
    try {
      const intentRes = await api<{ clientSecret: string }>('/payments/topup-intent', {
        method: 'POST',
        body: JSON.stringify({ amountCents, kidAccountId: kidId }),
      })

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
        if (error.code !== 'Canceled') Alert.alert('Payment failed', error.message)
        setPaying(false)
        return
      }

      setSuccess(true)
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

  const handleDemoPay = async () => {
    if (!kidId) return
    setPaying(true)
    try {
      await api('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({
          kidAccountId: kidId,
          brainsDelta: amountCents,
          note: note || 'Top up',
          kind: 'topup',
        }),
      })
      setSuccess(true)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['family'] })
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
      }, 1000)
    } catch {
      Alert.alert('Could not top up', 'Please try again.')
    } finally {
      setPaying(false)
    }
  }

  // Success screen
  if (success) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Confetti show onComplete={() => router.back()} />
        <Lottie name="success" size={150} loop={false} />
        <Text style={s.successTitle}>Sent!</Text>
        <Text style={s.successAmount}>${amountDollars.toFixed(2)}</Text>
        <Text style={s.successSub}>
          to {selectedKid?.persona?.name ?? 'kid'}
        </Text>
        <View style={s.successBrainRow}>
          <Star size={14} color={tokens.color.coin} strokeWidth={2.5} fill={tokens.color.coin} />
          <Text style={s.successBrainText}>+{brainPoints} Brain Points added</Text>
        </View>
      </View>
    )
  }

  // Loading state while family data loads
  if (!famData) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={tokens.color.purple} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          hitSlop={12}
          style={s.backBtn}
          onPress={() => (step > 0 ? setStep(step - 1) : router.back())}
        >
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={1.8} />
        </Pressable>
        {/* Step dots */}
        <View style={s.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === step && { width: 20, backgroundColor: accent },
                i < step && { backgroundColor: accent + '66' },
              ]}
            />
          ))}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 0: Pick kid ── */}
        {step === 0 && (
          <>
            <Text style={s.stepTitle}>Who's getting topped up?</Text>
            <View style={s.kidList}>
              {kids.map((k) => {
                const kAccent = k.persona?.color ?? tokens.color.purple
                const selected = kidId === k.accountId
                return (
                  <Pressable
                    key={k.accountId}
                    style={({ pressed }) => [
                      s.kidCard,
                      selected && { borderColor: kAccent },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => {
                      setKidId(k.accountId)
                      setTimeout(() => setStep(1), 200)
                    }}
                  >
                    {selected && (
                      <LinearGradient
                        colors={[kAccent + '18', 'transparent']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    )}
                    <View style={[s.kidAvatar, { backgroundColor: kAccent + '22', borderColor: kAccent + '55' }]}>
                      <Text style={s.kidAvatarEmoji}>{k.persona?.avatar ?? '🧒'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.kidName}>{k.persona?.name ?? 'Kid'}</Text>
                      <Text style={s.kidBalance}>
                        ${((k.cachedBalance ?? 0) / 100).toFixed(2)} balance
                      </Text>
                    </View>
                    {selected && (
                      <CheckCircle2 size={20} color={kAccent} strokeWidth={2} />
                    )}
                  </Pressable>
                )
              })}
            </View>
          </>
        )}

        {/* ── Step 1: Amount ── */}
        {step === 1 && (
          <>
            <Text style={s.stepTitle}>How much?</Text>
            <Text style={s.stepSub}>For {selectedKid?.persona?.name ?? 'kid'}</Text>

            {/* Big amount display */}
            <View style={s.amountDisplay}>
              <Text style={s.amountCurrency}>$</Text>
              <Text style={[s.amountValue, { color: accent }]}>{amountDollars}</Text>
            </View>

            {/* Brain points preview */}
            <View style={s.brainPreview}>
              <Star size={14} color={tokens.color.coin} strokeWidth={2.5} fill={tokens.color.coin} />
              <Text style={s.brainPreviewText}>= {brainPoints} Brain Points</Text>
            </View>

            {/* Amount chips */}
            <View style={s.chipRow}>
              {AMOUNTS.map((amt) => (
                <Pressable
                  key={amt}
                  style={[s.amountChip, amountDollars === amt && { borderColor: accent }]}
                  onPress={() => {
                    setAmountDollars(amt)
                    setCustomAmount('')
                  }}
                >
                  {amountDollars === amt && (
                    <LinearGradient
                      colors={[accent + 'CC', accent + '88']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                  )}
                  <Text style={[s.amountChipText, amountDollars === amt && { color: '#fff' }]}>
                    ${amt}
                  </Text>
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
              style={[s.cta, amountDollars < 1 && s.ctaDisabled]}
              onPress={() => setStep(2)}
              disabled={amountDollars < 1}
            >
              <LinearGradient
                colors={[accent, accent + 'AA']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              <Text style={s.ctaText}>Continue</Text>
            </Pressable>
          </>
        )}

        {/* ── Step 2: Note ── */}
        {step === 2 && (
          <>
            <Text style={s.stepTitle}>Add a note?</Text>
            <Text style={s.stepSub}>Optional — your kid will see this</Text>

            <View style={s.noteChips}>
              {NOTE_CHIPS.map((n) => (
                <Pressable
                  key={n}
                  style={[s.noteChip, note === n && { borderColor: accent }]}
                  onPress={() => setNote(n === note ? '' : n)}
                >
                  {note === n && (
                    <LinearGradient
                      colors={[accent + 'CC', accent + '88']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                  )}
                  <Text style={[s.noteChipText, note === n && { color: '#fff' }]}>{n}</Text>
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

            <Pressable style={s.cta} onPress={() => setStep(3)}>
              <LinearGradient
                colors={[accent, accent + 'AA']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              <Text style={s.ctaText}>Continue</Text>
            </Pressable>
          </>
        )}

        {/* ── Step 3: Confirm & Pay ── */}
        {step === 3 && (
          <>
            <Text style={s.stepTitle}>Confirm</Text>

            {/* Summary card */}
            <View style={s.summaryCard}>
              <LinearGradient
                colors={[accent + '18', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={[s.summaryCardBorder, { borderColor: accent + '33' }]} />

              <View style={s.summaryKidRow}>
                <View style={[s.summaryKidAvatar, { backgroundColor: accent + '22' }]}>
                  <Text style={s.summaryKidEmoji}>{selectedKid?.persona?.avatar ?? '🧒'}</Text>
                </View>
                <Text style={s.summaryKidName}>{selectedKid?.persona?.name ?? 'Kid'}</Text>
              </View>

              <View style={s.summaryDivider} />

              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Amount</Text>
                <Text style={[s.summaryValue, { color: accent }]}>${amountDollars.toFixed(2)} AUD</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Brain Points</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Star size={12} color={tokens.color.coin} strokeWidth={2.5} fill={tokens.color.coin} />
                  <Text style={[s.summaryValue, { color: tokens.color.coin }]}>+{brainPoints} pts</Text>
                </View>
              </View>
              {note ? (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Note</Text>
                  <Text style={s.summaryNote}>"{note}"</Text>
                </View>
              ) : null}
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
              <Pressable style={s.cta} onPress={handleDemoPay}>
                <LinearGradient
                  colors={[accent, accent + 'AA']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
                <Text style={s.ctaText}>Pay ${amountDollars} AUD (sandbox)</Text>
              </Pressable>
            )}

            <Text style={s.payHint}>
              {applePayAvailable
                ? 'Double-click side button to confirm with Apple Pay'
                : 'Demo mode — no real payment processed'}
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
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.surface2 },

  stepTitle: {
    color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800',
    marginTop: tokens.spacing[5], letterSpacing: -0.3,
  },
  stepSub: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5],
  },

  // Step 0 — kid list
  kidList: { gap: tokens.spacing[3], marginTop: tokens.spacing[4] },
  kidCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5, borderColor: 'transparent',
    overflow: 'hidden',
  },
  kidAvatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  kidAvatarEmoji: { fontSize: 24 },
  kidName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  kidBalance: { color: tokens.color.textMuted, fontSize: 12, marginTop: 2 },

  // Step 1 — amount
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: tokens.spacing[5],
    gap: 4,
  },
  amountCurrency: {
    color: tokens.color.textMuted,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 12,
  },
  amountValue: {
    fontSize: 88,
    fontWeight: '900',
    letterSpacing: -3,
    lineHeight: 92,
  },
  brainPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: tokens.spacing[5],
  },
  brainPreviewText: {
    color: tokens.color.coin,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    flexWrap: 'wrap',
    marginBottom: tokens.spacing[4],
  },
  amountChip: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  amountChipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '800' },

  // Step 2 — note
  noteChips: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    flexWrap: 'wrap',
    marginVertical: tokens.spacing[4],
  },
  noteChip: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  noteChipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  customInput: {
    backgroundColor: tokens.color.surface,
    height: 56,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2],
    borderWidth: 1,
    borderColor: tokens.color.surface2,
  },

  // Step 3 — summary
  summaryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: tokens.spacing[5],
    marginTop: tokens.spacing[4],
    backgroundColor: tokens.color.surface,
    position: 'relative',
  },
  summaryCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  summaryKidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    marginBottom: tokens.spacing[4],
  },
  summaryKidAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryKidEmoji: { fontSize: 22 },
  summaryKidName: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  summaryDivider: { height: 1, backgroundColor: tokens.color.surface2, marginBottom: tokens.spacing[4] },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: tokens.spacing[3],
  },
  summaryLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },
  summaryValue: { fontSize: tokens.fontSize.md, fontWeight: '800' },
  summaryNote: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic' },

  cta: {
    height: 58,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing[5],
    overflow: 'hidden',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: tokens.fontSize.md },

  applePayBtn: { height: 58, marginTop: tokens.spacing[5] },
  payingState: {
    height: 58, alignItems: 'center', justifyContent: 'center',
    marginTop: tokens.spacing[5],
    flexDirection: 'row', gap: tokens.spacing[3],
  },
  payingText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md },
  payHint: {
    color: tokens.color.textMuted, fontSize: 12, textAlign: 'center',
    marginTop: tokens.spacing[3], lineHeight: 18,
  },

  // Success
  successIconWrap: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: tokens.spacing[4],
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  successTitle: {
    color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800',
    marginBottom: tokens.spacing[2],
  },
  successAmount: {
    color: tokens.color.text, fontSize: 56, fontWeight: '900',
    letterSpacing: -2, lineHeight: 60,
  },
  successSub: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2], marginBottom: tokens.spacing[4],
  },
  successBrainRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tokens.color.coin + '18',
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.pill,
  },
  successBrainText: { color: tokens.color.coin, fontSize: tokens.fontSize.sm, fontWeight: '700' },
})
