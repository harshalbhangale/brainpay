import { Hono } from 'hono'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { accounts, chores, ledger, memberships } from '../db/schema'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { logger } from '../logger'
import { sendPushToAccount, sendPushToAccounts, PushTemplates } from '../services/push'
import { verifyChorePhoto } from '../services/chore-verify'
import { sql } from 'drizzle-orm'

/**
 * Chores API — Sprint 1 Part 4.
 *
 *   POST   /chores                  parent creates a chore
 *   GET    /chores                  list chores for the family (role-filtered)
 *   PATCH  /chores/:id              update status (kid marks done, parent approves/rejects)
 *   POST   /chores/:id/verify       kid submits photo → GPT-4o Vision → verdict
 */

export const choresRoutes = new Hono<{ Variables: AuthVars }>()
choresRoutes.use('*', requireAuth)

// ─── Helper: get family + role for an account ─────────────────────────
async function getMembership(accountId: string) {
  const [row] = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1)
  return row ?? null
}

// ─── Helper: get all parent account IDs in a family ───────────────────
async function getParentIds(familyId: string): Promise<string[]> {
  const rows = await db
    .select({ accountId: memberships.accountId })
    .from(memberships)
    .where(
      and(
        eq(memberships.familyId, familyId),
        inArray(memberships.role, ['primary_parent', 'co_parent']),
      ),
    )
  return rows.map((r) => r.accountId)
}

// ─── POST /chores ─────────────────────────────────────────────────────
// Parent creates a chore and assigns it to a kid.
// Body: { assignedTo, title, rewardBrains }
choresRoutes.post('/chores', async (c) => {
  const actorId = authedAccountId(c)
  const membership = await getMembership(actorId)

  if (!membership) return c.json({ error: 'no_family' }, 403)
  if (!['primary_parent', 'co_parent'].includes(membership.role)) {
    return c.json({ error: 'only_parents_can_create_chores' }, 403)
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      assignedTo: z.string().uuid(),
      title: z.string().min(1).max(200).trim(),
      rewardBrains: z.number().int().min(1).max(10_000),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { assignedTo, title, rewardBrains } = parsed.data

  // Verify kid is in the same family.
  const kidMembership = await getMembership(assignedTo)
  if (!kidMembership || kidMembership.familyId !== membership.familyId) {
    return c.json({ error: 'kid_not_in_family' }, 403)
  }

  const [chore] = await db
    .insert(chores)
    .values({
      familyId: membership.familyId,
      assignedTo,
      createdBy: actorId,
      title,
      rewardBrains,
      status: 'pending',
    })
    .returning()

  logger.info({ choreId: chore.id, assignedTo, title, rewardBrains }, 'chores.created')

  return c.json({ chore }, 201)
})

// ─── GET /chores ──────────────────────────────────────────────────────
// List chores for the family.
// Parents see all chores. Kids see only their own.
// Optional query: ?status=pending,submitted,ai_approved
choresRoutes.get('/chores', async (c) => {
  const accountId = authedAccountId(c)
  const membership = await getMembership(accountId)
  if (!membership) return c.json({ chores: [] })

  const isParent = ['primary_parent', 'co_parent'].includes(membership.role)
  const statusFilter = c.req.query('status')?.split(',').filter(Boolean)

  // Build where clause.
  const conditions = [eq(chores.familyId, membership.familyId)]
  if (!isParent) {
    // Kids only see their own chores.
    conditions.push(eq(chores.assignedTo, accountId))
  }

  const rows = await db
    .select()
    .from(chores)
    .where(and(...conditions))
    .orderBy(desc(chores.createdAt))
    .limit(100)

  // Apply status filter in JS (simpler than dynamic SQL for small sets).
  const filtered = statusFilter?.length
    ? rows.filter((r) => statusFilter.includes(r.status))
    : rows

  return c.json({ chores: filtered })
})

// ─── PATCH /chores/:id ────────────────────────────────────────────────
// Update chore status.
//
// Kid can:   pending → submitted
// Parent can: submitted/ai_approved/ai_rejected/ai_uncertain → parent_approved/parent_rejected
//             parent_approved → paid (triggers ledger write + push)
//
// Body: { status, parentNote? }
choresRoutes.patch('/chores/:id', async (c) => {
  const actorId = authedAccountId(c)
  const choreId = c.req.param('id')
  const membership = await getMembership(actorId)
  if (!membership) return c.json({ error: 'no_family' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      status: z.enum([
        'submitted',
        'parent_approved',
        'parent_rejected',
      ]),
      parentNote: z.string().max(300).optional(),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400)
  }

  const { status: newStatus, parentNote } = parsed.data
  const isParent = ['primary_parent', 'co_parent'].includes(membership.role)

  // Load the chore.
  const [chore] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.familyId, membership.familyId)))
    .limit(1)

  if (!chore) return c.json({ error: 'chore_not_found' }, 404)

  // Validate transitions.
  if (newStatus === 'submitted') {
    if (chore.assignedTo !== actorId) return c.json({ error: 'not_your_chore' }, 403)
    if (chore.status !== 'pending') return c.json({ error: 'already_submitted' }, 409)
  }

  if (['parent_approved', 'parent_rejected'].includes(newStatus)) {
    if (!isParent) return c.json({ error: 'only_parents_can_approve' }, 403)
    const approvableStatuses = ['submitted', 'ai_approved', 'ai_rejected', 'ai_uncertain']
    if (!approvableStatuses.includes(chore.status)) {
      return c.json({ error: 'chore_not_awaiting_approval' }, 409)
    }
  }

  // Build update payload.
  const updates: Partial<typeof chore> = { status: newStatus }
  if (newStatus === 'submitted') updates.submittedAt = new Date()
  if (newStatus === 'parent_approved') updates.completedAt = new Date()
  if (parentNote) updates.parentNote = parentNote

  // ── parent_approved: payout Brains atomically ──────────────────────
  if (newStatus === 'parent_approved') {
    await db.transaction(async (tx) => {
      // Lock kid account.
      const [kidAcct] = await tx
        .select({ cachedBalance: accounts.cachedBalance })
        .from(accounts)
        .where(eq(accounts.id, chore.assignedTo))
        .for('update')

      if (!kidAcct) throw new Error('kid_account_not_found')

      const balanceAfter = kidAcct.cachedBalance + chore.rewardBrains

      // Credit Brains.
      await tx
        .update(accounts)
        .set({ cachedBalance: sql`${accounts.cachedBalance} + ${chore.rewardBrains}` })
        .where(eq(accounts.id, chore.assignedTo))

      // Write ledger row.
      await tx.insert(ledger).values({
        familyId: chore.familyId,
        accountId: chore.assignedTo,
        actorId,
        kind: 'chore_payout',
        brainsDelta: chore.rewardBrains,
        balanceAfter,
        metadata: {
          choreId: chore.id,
          choreTitle: chore.title,
          approvedBy: actorId,
        },
      })

      // Update chore status.
      await tx
        .update(chores)
        .set({ ...updates, status: 'paid' })
        .where(eq(chores.id, choreId))
    })

    // Push to kid — non-blocking.
    sendPushToAccount(
      chore.assignedTo,
      PushTemplates.choreParentApproved(chore.title, chore.rewardBrains),
    ).catch(() => undefined)

    logger.info({ choreId, kidId: chore.assignedTo, rewardBrains: chore.rewardBrains }, 'chores.paid')
    const [updated] = await db.select().from(chores).where(eq(chores.id, choreId)).limit(1)
    return c.json({ chore: updated })
  }

  // ── parent_rejected ────────────────────────────────────────────────
  if (newStatus === 'parent_rejected') {
    await db.update(chores).set(updates).where(eq(chores.id, choreId))

    sendPushToAccount(
      chore.assignedTo,
      PushTemplates.choreParentRejected(chore.title, parentNote),
    ).catch(() => undefined)

    logger.info({ choreId, reason: parentNote }, 'chores.rejected')
    const [updated] = await db.select().from(chores).where(eq(chores.id, choreId)).limit(1)
    return c.json({ chore: updated })
  }

  // ── submitted: notify parents ──────────────────────────────────────
  await db.update(chores).set(updates).where(eq(chores.id, choreId))

  if (newStatus === 'submitted') {
    const kidAcct = await db
      .select({ persona: accounts.persona })
      .from(accounts)
      .where(eq(accounts.id, actorId))
      .limit(1)
    const kidName = (kidAcct[0]?.persona as { name?: string } | null)?.name ?? 'Your kid'

    const parentIds = await getParentIds(chore.familyId)
    sendPushToAccounts(
      parentIds,
      PushTemplates.choreSubmitted(kidName, chore.title),
    ).catch(() => undefined)

    logger.info({ choreId, kidId: actorId }, 'chores.submitted')
  }

  const [updated] = await db.select().from(chores).where(eq(chores.id, choreId)).limit(1)
  return c.json({ chore: updated })
})

// ─── POST /chores/:id/verify ──────────────────────────────────────────
// Kid submits a photo of the completed chore.
// GPT-4o Vision analyses it and returns a verdict.
// If approved/uncertain → notifies parents.
// If rejected → notifies kid only.
//
// Body: multipart/form-data with field "photo" (JPEG/PNG, ≤ 5MB)
//   OR  JSON { photoBase64: string, mimeType?: string }
choresRoutes.post('/chores/:id/verify', async (c) => {
  const actorId = authedAccountId(c)
  const choreId = c.req.param('id')
  const membership = await getMembership(actorId)
  if (!membership) return c.json({ error: 'no_family' }, 403)

  // Load chore — kid must be the assignee.
  const [chore] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.familyId, membership.familyId)))
    .limit(1)

  if (!chore) return c.json({ error: 'chore_not_found' }, 404)
  if (chore.assignedTo !== actorId) return c.json({ error: 'not_your_chore' }, 403)
  // Kid may verify a fresh chore, or retry one the AI previously rejected.
  if (!['pending', 'submitted', 'ai_rejected'].includes(chore.status)) {
    return c.json({ error: 'chore_already_verified' }, 409)
  }

  // Accept either multipart or JSON base64.
  let photoBase64: string
  let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'

  const contentType = c.req.header('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData().catch(() => null)
    const file = formData?.get('photo') as File | null
    if (!file) return c.json({ error: 'photo_required' }, 400)
    if (file.size > 5 * 1024 * 1024) return c.json({ error: 'photo_too_large' }, 413)

    const buffer = await file.arrayBuffer()
    photoBase64 = Buffer.from(buffer).toString('base64')
    if (file.type === 'image/png') mimeType = 'image/png'
    else if (file.type === 'image/webp') mimeType = 'image/webp'
  } else {
    const body = await c.req.json().catch(() => ({})) as {
      photoBase64?: string
      mimeType?: string
    }
    if (!body.photoBase64) return c.json({ error: 'photo_required' }, 400)
    photoBase64 = body.photoBase64
    if (body.mimeType === 'image/png') mimeType = 'image/png'
    else if (body.mimeType === 'image/webp') mimeType = 'image/webp'
  }

  // Run GPT-4o Vision.
  const { verdict, reason } = await verifyChorePhoto(chore.title, photoBase64, mimeType)

  // ── approved: auto-credit the kid immediately (Policy A) ────────────
  // Money moves on the AI verdict; the parent gets a "report / undo" path
  // (POST /chores/:id/report) that reverses the ledger if it was wrong.
  if (verdict === 'approved') {
    let balanceAfter = 0
    await db.transaction(async (tx) => {
      const [kidAcct] = await tx
        .select({ cachedBalance: accounts.cachedBalance })
        .from(accounts)
        .where(eq(accounts.id, chore.assignedTo))
        .for('update')

      if (!kidAcct) throw new Error('kid_account_not_found')
      balanceAfter = kidAcct.cachedBalance + chore.rewardBrains

      await tx
        .update(accounts)
        .set({ cachedBalance: sql`${accounts.cachedBalance} + ${chore.rewardBrains}` })
        .where(eq(accounts.id, chore.assignedTo))

      await tx.insert(ledger).values({
        familyId: chore.familyId,
        accountId: chore.assignedTo,
        actorId,
        kind: 'chore_payout',
        brainsDelta: chore.rewardBrains,
        balanceAfter,
        metadata: {
          choreId: chore.id,
          choreTitle: chore.title,
          approvedBy: 'ai',
          autoPaid: true,
        },
      })

      await tx
        .update(chores)
        .set({
          status: 'paid',
          aiVerdict: verdict,
          aiReason: reason,
          submittedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(chores.id, choreId))
    })

    // Kid celebration push + parent "review / report" push — non-blocking.
    sendPushToAccount(
      chore.assignedTo,
      PushTemplates.choreParentApproved(chore.title, chore.rewardBrains),
    ).catch(() => undefined)

    const [kidAcct] = await db
      .select({ persona: accounts.persona })
      .from(accounts)
      .where(eq(accounts.id, chore.assignedTo))
      .limit(1)
    const kidName = (kidAcct?.persona as { name?: string } | null)?.name ?? 'Your kid'

    const parentIds = await getParentIds(chore.familyId)
    sendPushToAccounts(
      parentIds,
      PushTemplates.choreAiAutoPaid(kidName, chore.title, chore.rewardBrains),
    ).catch(() => undefined)

    logger.info({ choreId, verdict, reason, autoPaid: true }, 'chores.verified')
    return c.json({ verdict, reason, status: 'paid', choreId, autoPaid: true })
  }

  // ── rejected / uncertain: no money moves ────────────────────────────
  const newStatus = verdict === 'rejected' ? 'ai_rejected' : 'ai_uncertain'

  await db
    .update(chores)
    .set({
      status: newStatus,
      aiVerdict: verdict,
      aiReason: reason,
      submittedAt: new Date(),
    })
    .where(eq(chores.id, choreId))

  // Uncertain → parent reviews manually. Rejected → kid simply retries.
  if (verdict === 'uncertain') {
    const parentIds = await getParentIds(chore.familyId)
    sendPushToAccounts(
      parentIds,
      PushTemplates.choreAiRejected(chore.title),
    ).catch(() => undefined)
  }

  logger.info({ choreId, verdict, reason }, 'chores.verified')

  return c.json({
    verdict,
    reason,
    status: newStatus,
    choreId,
    autoPaid: false,
  })
})


// ─── POST /chores/:id/report ──────────────────────────────────────────
// Parent disputes a chore the AI auto-approved and paid (Policy A undo).
// Reverses the Brains payout with a compensating ledger entry and marks the
// chore parent_rejected. Only valid for AI-auto-paid chores.
//
// Body: { note?: string }
choresRoutes.post('/chores/:id/report', async (c) => {
  const actorId = authedAccountId(c)
  const choreId = c.req.param('id')
  const membership = await getMembership(actorId)
  if (!membership) return c.json({ error: 'no_family' }, 403)

  const isParent = ['primary_parent', 'co_parent'].includes(membership.role)
  if (!isParent) return c.json({ error: 'only_parents_can_report' }, 403)

  const body = await c.req.json().catch(() => ({})) as { note?: string }
  const note = typeof body.note === 'string' ? body.note.slice(0, 300) : undefined

  // Load chore — must belong to this family.
  const [chore] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.familyId, membership.familyId)))
    .limit(1)

  if (!chore) return c.json({ error: 'chore_not_found' }, 404)

  // Only AI-auto-paid chores can be reported/undone here.
  if (chore.status !== 'paid' || chore.aiVerdict !== 'approved') {
    return c.json({ error: 'chore_not_reportable' }, 409)
  }

  await db.transaction(async (tx) => {
    const [kidAcct] = await tx
      .select({ cachedBalance: accounts.cachedBalance })
      .from(accounts)
      .where(eq(accounts.id, chore.assignedTo))
      .for('update')

    if (!kidAcct) throw new Error('kid_account_not_found')
    const balanceAfter = kidAcct.cachedBalance - chore.rewardBrains

    // Debit the previously-credited Brains.
    await tx
      .update(accounts)
      .set({ cachedBalance: sql`${accounts.cachedBalance} - ${chore.rewardBrains}` })
      .where(eq(accounts.id, chore.assignedTo))

    // Compensating ledger entry — keeps the ledger as the source of truth.
    await tx.insert(ledger).values({
      familyId: chore.familyId,
      accountId: chore.assignedTo,
      actorId,
      kind: 'chore_reversal',
      brainsDelta: -chore.rewardBrains,
      balanceAfter,
      metadata: {
        choreId: chore.id,
        choreTitle: chore.title,
        reportedBy: actorId,
        note: note ?? null,
      },
    })

    await tx
      .update(chores)
      .set({
        status: 'parent_rejected',
        parentNote: note ?? 'A parent reported this chore.',
      })
      .where(eq(chores.id, choreId))
  })

  sendPushToAccount(
    chore.assignedTo,
    PushTemplates.choreParentRejected(chore.title, note),
  ).catch(() => undefined)

  logger.info({ choreId, reportedBy: actorId, note }, 'chores.reported')

  const [updated] = await db.select().from(chores).where(eq(chores.id, choreId)).limit(1)
  return c.json({ chore: updated })
})
