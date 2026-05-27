import { usePlatformPay, PlatformPayButton, PlatformPay } from '@stripe/stripe-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { api } from '@/lib/api'
import { tokens } from '@/theme/tokens'

/**
 * ApplePayCheckout — presents the native Apple Pay sheet for a cart checkout.
 *
 * Uses Stripe's usePlatformPay hook which handles Apple Pay on iOS
 * and Google Pay on Android from a single API.
 *
 * Props:
 *   amountCents   Real dollar amount in cents (e.g. 850 = $8.50)
 *   brainsDelta   Net Brains effect from cart items (can be negative)
 *   cartSummary   Short description shown in Stripe dashboard
 *   onSuccess     Called after payment confirmed + Brains updated
 *   onCancel      Called if user dismisses the sheet
 */

type Props = {
  amountCents: number
  brainsDelta: number
  cartSummary: string
  onSuccess: (brainsDelta: number) => void
  onCancel?: () => void
}

type IntentResponse = { clientSecret: string; intentId: string }

export function ApplePayCheckout({ amountCents, brainsDelta, cartSummary, onSuccess, onCancel }: Props) {
  const { isPlatformPaySupported, confirmPlatformPayPayment } = usePlatformPay()
  const [loading, setLoading] = useState(false)

  const dollars = (amountCents / 100).toFixed(2)
  const brainsLabel = brainsDelta >= 0 ? `+${brainsDelta} 🧠` : `${brainsDelta} 🧠`

  const handlePay = async () => {
    setLoading(true)
    try {
      // 1. Get PaymentIntent client secret from our API
      const res = await api<IntentResponse>('/payments/checkout-intent', {
        method: 'POST',
        body: JSON.stringify({ amountCents, brainsDelta, cartSummary }),
      })

      if (!res.clientSecret) throw new Error('No client secret returned')

      // 2. Confirm payment via native Apple Pay / Google Pay sheet
      const { error } = await confirmPlatformPayPayment(res.clientSecret, {
        applePay: {
          cartItems: [
            {
              label: cartSummary.slice(0, 60),
              amount: dollars,
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'AU',
          currencyCode: 'AUD',
          requiredBillingContactFields: [],
        },
      })

      if (error) {
        if (error.code === 'Canceled') {
          onCancel?.()
        } else {
          Alert.alert('Payment failed', error.message)
        }
        return
      }

      // 3. Success — webhook credits Brains server-side
      // Optimistically update UI immediately
      onSuccess(brainsDelta)
    } catch (err) {
      Alert.alert('Something went wrong', 'Please try again.')
      console.error('ApplePayCheckout error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fallback for simulators / devices without Apple Pay set up
  if (!isPlatformPaySupported) {
    return (
      <CardPayFallback
        amountCents={amountCents}
        brainsDelta={brainsDelta}
        onSuccess={onSuccess}
      />
    )
  }

  return (
    <View style={s.container}>
      {/* Brains effect summary */}
      <View style={s.summary}>
        <Text style={s.summaryLabel}>Net Brains effect</Text>
        <Text style={[s.summaryValue, { color: brainsDelta >= 0 ? '#3DDC84' : tokens.color.danger }]}>
          {brainsLabel}
        </Text>
      </View>

      {/* Native Apple Pay button from Stripe SDK */}
      {loading ? (
        <View style={s.loadingBtn}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <PlatformPayButton
          onPress={handlePay}
          type={PlatformPay.ButtonType.Pay}
          appearance={PlatformPay.ButtonStyle.Black}
          borderRadius={28}
          style={s.platformPayBtn}
          accessibilityLabel={`Pay $${dollars} with Apple Pay`}
        />
      )}

      <Text style={s.hint}>Double-click side button to confirm with Face ID</Text>
    </View>
  )
}

/**
 * CardPayFallback — shown on simulator or when Apple Pay isn't available.
 * Simulates the payment locally (demo only — no real Stripe call).
 */
function CardPayFallback({
  amountCents,
  brainsDelta,
  onSuccess,
}: {
  amountCents: number
  brainsDelta: number
  onSuccess: (brainsDelta: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const dollars = (amountCents / 100).toFixed(2)
  const brainsLabel = brainsDelta >= 0 ? `+${brainsDelta} 🧠` : `${brainsDelta} 🧠`

  const handleDemo = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1200))
    setLoading(false)
    onSuccess(brainsDelta)
  }

  return (
    <View style={s.container}>
      <View style={s.summary}>
        <Text style={s.summaryLabel}>Net Brains effect</Text>
        <Text style={[s.summaryValue, { color: brainsDelta >= 0 ? '#3DDC84' : tokens.color.danger }]}>
          {brainsLabel}
        </Text>
      </View>

      <View style={s.demoCard}>
        <Text style={s.demoCardLabel}>💳  Visa •••• 4242</Text>
        <Text style={s.demoCardSub}>Stripe sandbox test card</Text>
      </View>

      <Pressable
        style={[s.fallbackBtn, loading && s.fallbackBtnDisabled]}
        onPress={handleDemo}
        disabled={loading}
        accessibilityLabel={`Pay $${dollars} demo`}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={s.fallbackBtnText}>Pay ${dollars} (sandbox)</Text>
        )}
      </Pressable>

      <Text style={s.hint}>Apple Pay not available on this device</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    gap: tokens.spacing[4],
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.md,
  },
  summaryLabel: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '900',
  },
  platformPayBtn: {
    height: 56,
    width: '100%',
  },
  loadingBtn: {
    height: 56,
    backgroundColor: '#000',
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.xs,
    textAlign: 'center',
  },
  demoCard: {
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    gap: 4,
  },
  demoCardLabel: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  demoCardSub: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.xs,
  },
  fallbackBtn: {
    height: 56,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackBtnDisabled: {
    opacity: 0.5,
  },
  fallbackBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: tokens.fontSize.md,
  },
})
