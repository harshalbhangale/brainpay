import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Wifi } from 'lucide-react-native'
import { api } from '@/lib/api'
import { waitForNfcTap } from '@/lib/nfc'
import { Confetti } from '@/components'
import { tokens } from '@/theme/tokens'

/**
 * NFC Checkout screen.
 *
 * Real NFC: requires custom dev build (eas build --profile development).
 * Demo fallback: tap the card graphic on screen — same UX, no NFC hardware.
 *
 * Flow:
 *   1. Enter dollar amount
 *   2. Tap card (real NFC or on-screen tap)
 *   3. Vibrate + confetti + deduct Brains
 */

export default function CheckoutNfc() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<'amount' | 'tap' | 'success'>('amount')
  const [amountDollars, setAmountDollars] = useState(0)
  const [customAmount, setCustomAmount] = useState('3.50')
  const [paying, setPaying] = useState(false)
  const [nfcListening, setNfcListening] = useState(false)
  const [result, setResult] = useState<{ netBrainsDelta: number; balanceAfter: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const pulseAnim = useRef(new Animated.Value(0)).current
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null)

  // Start NFC listening automatically when tap screen appears.
  useEffect(() => {
    if (step !== 'tap') return
    startNfcOrListen()
    return () => {
      pulseLoop.current?.stop()
    }
  }, [step])

  // Pulse animation.
  useEffect(() => {
    if (step === 'tap') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      )
      pulseLoop.current.start()
    } else {
      pulseLoop.current?.stop()
    }
  }, [step, pulseAnim])

  const startNfcOrListen = async () => {
    setNfcListening(true)
    setErrorMsg(null)

    const nfcResult = await waitForNfcTap()

    if (nfcResult.success) {
      // Real NFC tap detected.
      await processPayment()
    } else if (nfcResult.reason === 'unsupported') {
      // Expo Go / simulator — stay on screen, let user tap the card graphic.
      setNfcListening(false)
    } else if (nfcResult.reason === 'cancelled') {
      setNfcListening(false)
      setErrorMsg('Tap cancelled. Try again.')
    } else if (nfcResult.reason === 'unknown_card') {
      setNfcListening(false)
      setErrorMsg('Unknown card. Use your BrainPal card.')
    } else {
      setNfcListening(false)
      setErrorMsg('NFC error. Tap the card again.')
    }
  }

  const processPayment = async () => {
    if (paying) return
    setPaying(true)
    setNfcListening(false)

    Vibration.vibrate(50)

    try {
      const res = await api<{ netBrainsDelta: number; balanceAfter: number; itemCount: number }>(
        '/wallet/purchase',
        {
          method: 'POST',
          body: JSON.stringify({ amountCents: Math.round(amountDollars * 100) }),
        },
      )
      setResult({ netBrainsDelta: res.netBrainsDelta, balanceAfter: res.balanceAfter })
      Vibration.vibrate([0, 100, 50, 200])
      setStep('success')
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    } catch (err) {
      const msg = String(err)
      if (msg.includes('cart_empty')) {
        // Demo: no cart items — show success anyway.
        setResult({ netBrainsDelta: 0, balanceAfter: 0 })
        Vibration.vibrate([0, 100, 50, 200])
        setStep('success')
      } else {
        setErrorMsg('Payment failed. Try again.')
        setStep('amount')
      }
    } finally {
      setPaying(false)
    }
  }

  // On-screen tap (demo fallback when NFC not available).
  const onCardTap = async () => {
    if (paying || nfcListening) return
    await processPayment()
  }

  // ── Success ─────────────────────────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Confetti show />
        <Text style={s.successCheck}>✓</Text>
        <Text style={s.successTitle}>Paid!</Text>
        <Text style={s.successAmount}>${amountDollars.toFixed(2)}</Text>
        {result.netBrainsDelta !== 0 && (
          <Text style={[s.successDelta, { color: result.netBrainsDelta >= 0 ? tokens.color.accent : tokens.color.danger }]}>
            Net {result.netBrainsDelta >= 0 ? '+' : ''}{result.netBrainsDelta} 🧠
          </Text>
        )}
        <Pressable style={s.cta} onPress={() => router.replace('/(app)/kid')}>
          <Text style={s.ctaText}>Done</Text>
        </Pressable>
      </View>
    )
  }

  // ── Amount entry ───────────────────────────────────────────────────
  if (step === 'amount') {
    const setAmount = (val: string) => {
      const cleaned = val.replace(/[^0-9.]/g, '')
      setCustomAmount(cleaned)
      const num = parseFloat(cleaned)
      if (!isNaN(num)) setAmountDollars(num)
    }

    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
          </Pressable>
        </View>

        <View style={s.amountWrap}>
          <Text style={s.amountLabel}>How much did you spend?</Text>
          <View style={s.amountInputRow}>
            <Text style={s.dollarSign}>$</Text>
            <TextInput
              style={s.amountInput}
              value={customAmount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus
              placeholder="0.00"
              placeholderTextColor={tokens.color.textMuted}
            />
          </View>

          <View style={s.chipRow}>
            {['2.00', '3.50', '5.00', '10.00'].map((amt) => (
              <Pressable
                key={amt}
                style={[s.chip, customAmount === amt && { backgroundColor: tokens.color.accent }]}
                onPress={() => setAmount(amt)}
              >
                <Text style={[s.chipText, customAmount === amt && { color: '#000' }]}>${amt}</Text>
              </Pressable>
            ))}
          </View>

          {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}
        </View>

        <View style={s.bottom}>
          <Pressable
            style={[s.cta, amountDollars <= 0 && s.ctaDisabled]}
            onPress={() => amountDollars > 0 && setStep('tap')}
            disabled={amountDollars <= 0}
          >
            <Text style={s.ctaText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // ── Tap card ───────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={() => setStep('amount')}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.amountSmall}>${amountDollars.toFixed(2)}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.cardWrap}>
        {/* Pulse rings */}
        <Animated.View
          style={[
            s.pulseRing,
            {
              opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            s.pulseRing,
            {
              opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] }),
              transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
            },
          ]}
        />

        {/* The card — tap to simulate NFC when real NFC not available */}
        <Pressable onPress={onCardTap} disabled={paying || nfcListening}>
          <View style={[s.card, paying && { opacity: 0.7 }]}>
            <View style={s.cardTop}>
              <Text style={s.cardBrand}>◈ MoneyPal</Text>
              <Wifi size={20} color="#fff" strokeWidth={2} style={s.nfcIcon} />
            </View>
            <View style={s.cardChip} />
            <View style={s.cardBottom}>
              <Text style={s.cardName}>BRAINPAL</Text>
              <Text style={s.cardNum}>•••• •••• •••• 4242</Text>
            </View>
          </View>
        </Pressable>
      </View>

      <Text style={s.tapHint}>
        {paying ? 'Processing...' : nfcListening ? 'Hold card to back of phone' : 'Tap your card to pay'}
      </Text>

      {nfcListening && (
        <Text style={s.tapDots}>● ● ●</Text>
      )}

      {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}

      <View style={s.bottom}>
        <Text style={s.demoHint}>
          {nfcListening ? `Card UID: 04F9BC82A21C90` : 'Tap card on screen if NFC unavailable'}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },

  amountWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  amountLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.lg, marginBottom: tokens.spacing[5] },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dollarSign: { color: tokens.color.text, fontSize: 60, fontWeight: '900' },
  amountInput: {
    color: tokens.color.text,
    fontSize: 84,
    fontWeight: '900',
    letterSpacing: -3,
    minWidth: 200,
    textAlign: 'center',
  },
  amountSmall: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },

  chipRow: { flexDirection: 'row', gap: tokens.spacing[2], marginTop: tokens.spacing[5] },
  chip: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
  },
  chipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  errorText: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
    marginTop: tokens.spacing[3],
  },

  cardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 320,
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: tokens.color.purple,
  },
  card: {
    width: 320,
    height: 200,
    backgroundColor: tokens.color.purple,
    borderRadius: 16,
    padding: tokens.spacing[5],
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBrand: { color: '#fff', fontSize: tokens.fontSize.md, fontWeight: '800' },
  nfcIcon: { transform: [{ rotate: '90deg' }] },
  cardChip: {
    width: 40, height: 30,
    backgroundColor: '#fff',
    opacity: 0.3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  cardBottom: { gap: 4 },
  cardName: { color: '#fff', fontSize: tokens.fontSize.md, fontWeight: '700', letterSpacing: 2 },
  cardNum: { color: '#fff', opacity: 0.7, fontSize: tokens.fontSize.sm, letterSpacing: 2 },

  tapHint: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: tokens.spacing[3],
  },
  tapDots: {
    color: tokens.color.purple,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: tokens.spacing[4],
    fontSize: tokens.fontSize.lg,
  },
  demoHint: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, textAlign: 'center' },

  successCheck: { fontSize: 100, color: tokens.color.accent, fontWeight: '900' },
  successTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginTop: tokens.spacing[3] },
  successAmount: { color: tokens.color.text, fontSize: 56, fontWeight: '900', marginTop: tokens.spacing[3] },
  successDelta: { fontSize: tokens.fontSize.lg, fontWeight: '800', marginTop: tokens.spacing[2] },

  bottom: { paddingTop: tokens.spacing[3] },
  cta: {
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
    marginTop: tokens.spacing[5],
    paddingHorizontal: tokens.spacing[6],
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
