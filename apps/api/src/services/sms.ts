import { eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts, smsMessages } from '../db/schema'
import { logger } from '../logger'

/**
 * SMS notification service — Twilio Messaging API.
 *
 * Reuses the same Twilio account as Verify (TWILIO_ACCOUNT_SID /
 * TWILIO_AUTH_TOKEN). Sender is either a Messaging Service SID (preferred
 * for AU) or a plain From number.
 *
 * Mirrors push.ts: never throws, logs failures, writes an audit row to
 * sms_messages. Used as the notification channel for the voice-task feature.
 *
 * Config:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_MESSAGING_SERVICE_SID  (preferred)  OR  TWILIO_MESSAGING_FROM
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID
const MESSAGING_FROM = process.env.TWILIO_MESSAGING_FROM

export type SmsSend = {
  toPhone: string // E.164
  body: string
  accountId?: string
  template: string // label for audit
  variables?: Record<string, unknown>
}

// ─── Core send ────────────────────────────────────────────────────────
export async function sendSms(input: SmsSend): Promise<{ ok: boolean; messageSid?: string }> {
  // Dev/no-config fallback — log + audit, return ok so callers don't break.
  if (!ACCOUNT_SID || !AUTH_TOKEN || (!MESSAGING_SERVICE_SID && !MESSAGING_FROM)) {
    logger.warn({ to: input.toPhone, template: input.template }, 'sms.not_configured — skipping send')
    await auditMessage(input, null, 'sent', 'dev_stub').catch(() => undefined)
    return { ok: true, messageSid: 'dev-stub' }
  }

  const params = new URLSearchParams({ To: input.toPhone, Body: input.body })
  if (MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', MESSAGING_SERVICE_SID)
  else if (MESSAGING_FROM) params.set('From', MESSAGING_FROM)

  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      },
    )

    if (!res.ok) {
      const text = await res.text()
      logger.error({ status: res.status, body: text.slice(0, 300) }, 'sms.send_failed')
      await auditMessage(input, null, 'failed', `http_${res.status}`).catch(() => undefined)
      return { ok: false }
    }

    const data = (await res.json()) as { sid?: string }
    await auditMessage(input, data.sid ?? null, 'sent').catch(() => undefined)
    return { ok: true, messageSid: data.sid }
  } catch (err) {
    logger.error({ err: String(err) }, 'sms.send_error')
    await auditMessage(input, null, 'failed', String(err)).catch(() => undefined)
    return { ok: false }
  }
}

async function auditMessage(
  input: SmsSend,
  messageSid: string | null,
  status: 'sent' | 'failed',
  error?: string,
): Promise<void> {
  await db.insert(smsMessages).values({
    accountId: input.accountId ?? null,
    toPhone: input.toPhone,
    template: input.template,
    variables: input.variables ?? {},
    messageSid,
    status,
    error: error ?? null,
  })
}

// ─── Send to an account (looks up phone from DB) ──────────────────────
export async function sendSmsToAccount(
  accountId: string,
  msg: Omit<SmsSend, 'toPhone' | 'accountId'>,
): Promise<{ ok: boolean }> {
  const [acct] = await db
    .select({ phone: accounts.phone })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!acct?.phone) {
    logger.debug({ accountId }, 'sms.no_phone_for_account')
    return { ok: false }
  }

  return sendSms({ ...msg, toPhone: acct.phone, accountId })
}

// ─── Templates — consistent copy, mirrors PushTemplates ───────────────
export const SmsTemplates = {
  taskCreated: (childName: string, taskTitle: string, reward: number) => ({
    template: 'task_created',
    body: `BrainPal: Task created for ${childName} — "${taskTitle}". Reward: ${reward} Brains. They'll see it now.`,
    variables: { childName, taskTitle, reward },
  }),

  taskAssigned: (taskTitle: string, reward: number) => ({
    template: 'task_assigned',
    body: `BrainPal: New task from your parent — "${taskTitle}". Finish it to earn ${reward} Brains.`,
    variables: { taskTitle, reward },
  }),

  taskCompleted: (childName: string, taskTitle: string) => ({
    template: 'task_completed',
    body: `BrainPal: ${childName} finished "${taskTitle}". Open the app to approve and pay.`,
    variables: { childName, taskTitle },
  }),

  rewardPaid: (taskTitle: string, reward: number) => ({
    template: 'reward_paid',
    body: `BrainPal: You earned ${reward} Brains for "${taskTitle}". Nice work.`,
    variables: { taskTitle, reward },
  }),
} as const
