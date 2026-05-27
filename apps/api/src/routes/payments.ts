import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import { accounts, ledger, memberships } from '../db/schema'
import { loadEnv } from '../env'
import { logger } from '../logger'
import { requireAuth, authedAccountId } from '../middleware/auth'
import {
  createTopupIntent,
  createCheckoutIntent,
  constructWebhookEvent,
} from '../services/stripe'
import { sendPushToAccount, PushTemplates } from '../services/push'
import { eq, sql } from 'drizzle-orm'

const env = loadEnv()

export const payments = new Hono()

// ─── POST /payments/topup-intent ─────────────────────────────────────
// Parent creates a PaymentIntent to top up their own or a kid's wallet.
// Returns clientSecret for the mobile Stripe SDK to present Apple Pay.
//
// Body: { amountCents: number, kidAccountId?: string }
// Auth: parent JWT required
payments.post('/payments/topup-intent', requireAuth, async (c) => {
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      amountCents: z.number().int().min(100).max(100_000), // $1–$1000
      kidAccountId: z.string().uuid().optional(),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { amountCents, kidAccountId } = parsed.data

  try {
    const intent = await createTopupIntent(amountCents, accountId, kidAccountId)
    logger.info({ accountId, amountCents, kidAccountId, intentId: intent.id }, 'payments.topup_intent_created')
    return c.json({ clientSecret: intent.client_secret, intentId: intent.id })
  } catch (err) {
    logger.error({ err: String(err), accountId }, 'payments.topup_intent_failed')
    return c.json({ error: 'stripe_error' }, 500)
  }
})

// ─── POST /payments/checkout-intent ──────────────────────────────────
// Kid creates a PaymentIntent for cart checkout.
// Returns clientSecret for Apple Pay sheet.
//
// Body: { amountCents: number, brainsDelta: number, cartSummary: string }
// Auth: kid JWT required
payments.post('/payments/checkout-intent', requireAuth, async (c) => {
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      amountCents: z.number().int().min(1).max(50_000), // up to $500
      brainsDelta: z.number().int(),
      cartSummary: z.string().max(500).default('Cart checkout'),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { amountCents, brainsDelta, cartSummary } = parsed.data

  try {
    const intent = await createCheckoutIntent(amountCents, accountId, brainsDelta, cartSummary)
    logger.info({ accountId, amountCents, brainsDelta, intentId: intent.id }, 'payments.checkout_intent_created')
    return c.json({ clientSecret: intent.client_secret, intentId: intent.id })
  } catch (err) {
    logger.error({ err: String(err), accountId }, 'payments.checkout_intent_failed')
    return c.json({ error: 'stripe_error' }, 500)
  }
})

// ─── POST /payments/webhook ───────────────────────────────────────────
// Stripe webhook — handles payment_intent.succeeded.
// On success: credits Brains to the correct account + writes ledger row.
//
// No auth middleware — Stripe signs the payload instead.
payments.post('/payments/webhook', async (c) => {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    // In dev without a webhook secret, accept all events (local testing only)
    logger.warn('payments.webhook: STRIPE_WEBHOOK_SECRET not set — skipping signature check')
  }

  const rawBody = await c.req.text()
  const signature = c.req.header('stripe-signature') ?? ''

  let event: ReturnType<typeof constructWebhookEvent>

  if (webhookSecret) {
    try {
      event = constructWebhookEvent(rawBody, signature, webhookSecret)
    } catch (err) {
      logger.warn({ err: String(err) }, 'payments.webhook_signature_invalid')
      return c.json({ error: 'invalid_signature' }, 400)
    }
  } else {
    // Dev fallback — parse without verification
    try {
      event = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as {
      id: string
      amount: number
      metadata: Record<string, string>
    }

    const { brainpal_account_id, brainpal_kid_account_id, brains_delta, source } = intent.metadata
    const targetAccountId = brainpal_kid_account_id || brainpal_account_id
    const brainsDelta = parseInt(brains_delta ?? '0', 10)

    if (!targetAccountId || isNaN(brainsDelta)) {
      logger.warn({ intentId: intent.id }, 'payments.webhook: missing metadata, skipping')
      return c.json({ received: true })
    }

    try {
      // Fetch account + family in one go.
      const [account] = await db
        .select({ cachedBalance: accounts.cachedBalance })
        .from(accounts)
        .where(eq(accounts.id, targetAccountId))
        .limit(1)

      if (!account) {
        logger.warn({ targetAccountId }, 'payments.webhook: account not found')
        return c.json({ received: true })
      }

      // Resolve familyId from memberships.
      const [memberRow] = await db
        .select({ familyId: memberships.familyId })
        .from(memberships)
        .where(eq(memberships.accountId, targetAccountId))
        .limit(1)

      if (!memberRow) {
        logger.warn({ targetAccountId }, 'payments.webhook: no family membership found')
        return c.json({ received: true })
      }

      const familyId = memberRow.familyId
      const balanceAfter = account.cachedBalance + brainsDelta

      // Update cached balance.
      await db
        .update(accounts)
        .set({ cachedBalance: sql`${accounts.cachedBalance} + ${brainsDelta}` })
        .where(eq(accounts.id, targetAccountId))

      // Write ledger row with correct familyId and balance_after.
      await db.insert(ledger).values({
        familyId,
        accountId: targetAccountId,
        actorId: brainpal_account_id,
        kind: source === 'topup' ? 'topup_stripe' : 'cart_checkout',
        brainsDelta,
        balanceAfter,
        metadata: {
          stripeIntentId: intent.id,
          amountCents: intent.amount,
          source,
        },
      })

      logger.info(
        { targetAccountId, familyId, brainsDelta, balanceAfter, intentId: intent.id, source },
        'payments.webhook: brains credited',
      )

      // Push to kid on Stripe-funded topup — non-blocking.
      if (source === 'topup') {
        sendPushToAccount(
          targetAccountId,
          PushTemplates.topupReceived(brainsDelta),
        ).catch(() => undefined)
      }
    } catch (err) {
      logger.error({ err: String(err), intentId: intent.id }, 'payments.webhook: db write failed')
      // Return 200 so Stripe doesn't retry — log and investigate manually
    }
  }

  return c.json({ received: true })
})
