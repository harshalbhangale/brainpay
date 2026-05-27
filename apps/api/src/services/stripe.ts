import Stripe from 'stripe'
import { loadEnv } from '../env'

/**
 * Stripe client — sandbox (test) mode.
 * STRIPE_SECRET_KEY must be sk_test_* for sandbox.
 * Swap to sk_live_* in production env only.
 */

const env = loadEnv()

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

/**
 * Create a PaymentIntent for a wallet top-up.
 *
 * @param amountCents  Amount in the smallest currency unit (cents AUD).
 * @param accountId    BrainPal account ID — stored as metadata for webhook reconciliation.
 * @param kidAccountId Optional kid account ID when parent is topping up a kid.
 */
export async function createTopupIntent(
  amountCents: number,
  accountId: string,
  kidAccountId?: string,
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    payment_method_types: ['card'],
    metadata: {
      brainpal_account_id: accountId,
      brainpal_kid_account_id: kidAccountId ?? '',
      brains_delta: Math.round(amountCents), // 1 cent = 1 Brain (1:1 peg)
      source: 'topup',
    },
    description: 'BrainPal wallet top-up',
  })
}

/**
 * Create a PaymentIntent for a cart checkout.
 *
 * @param amountCents  Real dollar amount the kid typed (what they paid IRL).
 * @param accountId    Kid's BrainPal account ID.
 * @param brainsDelta  Net Brains effect from cart items (can be negative).
 * @param cartSummary  Short description for the Stripe dashboard.
 */
export async function createCheckoutIntent(
  amountCents: number,
  accountId: string,
  brainsDelta: number,
  cartSummary: string,
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    payment_method_types: ['card'],
    metadata: {
      brainpal_account_id: accountId,
      brains_delta: brainsDelta,
      source: 'cart_checkout',
      cart_summary: cartSummary.slice(0, 500),
    },
    description: `BrainPal cart: ${cartSummary.slice(0, 100)}`,
  })
}

/**
 * Verify a Stripe webhook signature.
 * Returns the event or throws if signature is invalid.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}
