import { Expo, type ExpoPushMessage } from 'expo-server-sdk'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts } from '../db/schema'
import { logger } from '../logger'

/**
 * Push notification service — Expo Push API.
 *
 * Sends to one or more Expo push tokens. Silently skips invalid tokens
 * and logs errors without throwing so callers never fail because of a
 * push delivery issue.
 *
 * Usage:
 *   await sendPush(token, { title: '...', body: '...', data: { screen: 'wallet' } })
 *   await sendPushToAccount(accountId, { title: '...', body: '...' })
 */

const expo = new Expo()

export type PushPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
  badge?: number
}

// ─── Send to a known token ────────────────────────────────────────────
export async function sendPush(
  token: string,
  payload: PushPayload,
): Promise<void> {
  if (!Expo.isExpoPushToken(token)) {
    logger.warn({ token: String(token).slice(0, 30) }, 'push.invalid_token')
    return
  }

  const message: ExpoPushMessage = {
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: 'default',
    badge: payload.badge,
  }

  try {
    const chunks = expo.chunkPushNotifications([message])
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk)
      for (const receipt of receipts) {
        if (receipt.status === 'error') {
          logger.warn(
            { error: receipt.message, details: receipt.details },
            'push.delivery_error',
          )
        }
      }
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'push.send_failed')
  }
}

// ─── Send to an account (looks up push token from DB) ─────────────────
export async function sendPushToAccount(
  accountId: string,
  payload: PushPayload,
): Promise<void> {
  const [acct] = await db
    .select({ pushToken: accounts.pushToken })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!acct?.pushToken) {
    logger.debug({ accountId }, 'push.no_token_for_account')
    return
  }

  await sendPush(acct.pushToken, payload)
}

// ─── Send to multiple accounts ────────────────────────────────────────
export async function sendPushToAccounts(
  accountIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (accountIds.length === 0) return
  await Promise.all(accountIds.map((id) => sendPushToAccount(id, payload)))
}

// ─── Notification templates ───────────────────────────────────────────
// Centralised so copy is consistent across all callers.

export const PushTemplates = {
  topupReceived: (brainsDelta: number, note?: string | null) => ({
    title: 'Money arrived 💸',
    body: note
      ? `+${brainsDelta} 🧠 — "${note}"`
      : `+${brainsDelta} 🧠 added to your wallet`,
    data: { screen: 'wallet' },
  }),

  choreSubmitted: (kidName: string, choreTitle: string) => ({
    title: `${kidName} completed a chore`,
    body: `"${choreTitle}" — tap to review`,
    data: { screen: 'chores' },
  }),

  choreAiApproved: (choreTitle: string, rewardBrains: number) => ({
    title: 'AI approved ✅',
    body: `"${choreTitle}" looks done — approve to pay ${rewardBrains} 🧠`,
    data: { screen: 'chores' },
  }),

  choreAiRejected: (choreTitle: string) => ({
    title: 'Chore needs review 📸',
    body: `"${choreTitle}" — AI wasn't sure. Take a look.`,
    data: { screen: 'chores' },
  }),

  choreParentApproved: (choreTitle: string, rewardBrains: number) => ({
    title: `Chore paid! 🎉`,
    body: `+${rewardBrains} 🧠 for "${choreTitle}"`,
    data: { screen: 'wallet' },
  }),

  choreParentRejected: (choreTitle: string, note?: string | null) => ({
    title: 'Chore rejected ❌',
    body: note ? `"${choreTitle}" — ${note}` : `"${choreTitle}" was rejected. Try again.`,
    data: { screen: 'chores' },
  }),

  purchaseCompleted: (kidName: string, itemName: string, brainsDelta: number) => ({
    title: `${kidName} bought something 🛒`,
    body: `${itemName} · ${brainsDelta >= 0 ? '+' : ''}${brainsDelta} 🧠`,
    data: { screen: 'feed' },
  }),

  streakMilestone: (days: number, bonusBrains: number) => ({
    title: `${days}-day streak! 🔥`,
    body: `+${bonusBrains} 🧠 bonus. Keep it up.`,
    data: { screen: 'home' },
  }),

  goalCompleted: (goalName: string) => ({
    title: 'Goal reached! 🎯',
    body: `"${goalName}" is complete!`,
    data: { screen: 'goals' },
  }),
} as const
