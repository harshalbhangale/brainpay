import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * BrainPay P0 — family-first schema.
 * Source of truth: docs/p0-spec.md § 11.1 + supabase/migrations/0002_family_schema.sql.
 *
 * Brains: integer points stored directly. 1 Brain == 1 cent (P1+).
 *
 * accounts.id matches auth.users.id (Supabase Auth) so JWT.sub maps directly.
 */

// ─── accounts ─────────────────────────────────────────────────────────
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  phone: text('phone').notNull().unique(), // E.164
  accountType: text('account_type'), // 'parent' | 'kid' | 'extended' (null until onboarded)
  persona: jsonb('persona').notNull().default(sql`'{}'::jsonb`),
  cachedBalance: integer('cached_balance').default(0).notNull(),
  pushToken: text('push_token'), // Expo push token — set on first login
  lastLocation: jsonb('last_location'), // { lat, lng, accuracy, at } — kid device location
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
})

// ─── families ─────────────────────────────────────────────────────────
export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  avatar: text('avatar').default('🏡'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── memberships ──────────────────────────────────────────────────────
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .references(() => families.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(), // 'primary_parent' | 'co_parent' | 'guardian' | 'kid'
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueFamilyAccount: uniqueIndex('memberships_family_account_unique').on(t.familyId, t.accountId),
    byFamily: index('memberships_family_idx').on(t.familyId),
    byAccount: index('memberships_account_idx').on(t.accountId),
  }),
)

// ─── ledger ───────────────────────────────────────────────────────────
export const ledger = pgTable(
  'ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .references(() => families.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id')
      .references(() => accounts.id, { onDelete: 'restrict' })
      .notNull(),
    kind: text('kind').notNull(),
    // 'topup' | 'scan_skip_reward' | 'purchase' | 'goal_lock' | 'goal_unlock'
    // | 'streak_bonus' | 'adjustment' | 'cart_checkout'
    brainsDelta: integer('brains_delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byFamilyCreated: index('ledger_family_created_idx').on(t.familyId, t.createdAt),
    byAccountCreated: index('ledger_account_created_idx').on(t.accountId, t.createdAt),
  }),
)

// ─── goals ────────────────────────────────────────────────────────────
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id')
    .references(() => families.id, { onDelete: 'cascade' })
    .notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }), // null = family goal
  name: text('name').notNull(),
  targetBrains: integer('target_brains').notNull(),
  currentBrains: integer('current_brains').default(0).notNull(),
  emoji: text('emoji').default('🎯'),
  status: text('status').default('active').notNull(), // 'active' | 'completed' | 'abandoned'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

// ─── cart_items ───────────────────────────────────────────────────────
export const cartItems = pgTable('cart_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  detectionId: text('detection_id'),
  itemName: text('item_name').notNull(),
  itemEmoji: text('item_emoji').default('🛒'),
  brainsDelta: integer('brains_delta').notNull(),
  palQuote: text('pal_quote'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true })
    .default(sql`(now() + interval '24 hours')`)
    .notNull(),
})

// ─── invites ──────────────────────────────────────────────────────────
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyId: uuid('family_id')
    .references(() => families.id, { onDelete: 'cascade' })
    .notNull(),
  invitedBy: uuid('invited_by')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  code: text('code').notNull().unique(),
  token: text('token').notNull().unique(),
  expectedRole: text('expected_role').notNull(), // 'co_parent' | 'guardian' | 'kid'
  kidSeed: jsonb('kid_seed').notNull().default(sql`'{}'::jsonb`),
  initialTopup: integer('initial_topup').default(0).notNull(),
  recipientPhone: text('recipient_phone'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  status: text('status').default('pending').notNull(),
})

// ─── chat_messages ────────────────────────────────────────────────────
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccountCreated: index('chat_account_created_idx').on(t.accountId, t.createdAt),
  }),
)

// ─── inbox ────────────────────────────────────────────────────────────
export const inbox = pgTable('inbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── items (catalog, unchanged from MVP) ──────────────────────────────
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brand: text('brand').notNull(),
    product: text('product').notNull(),
    category: text('category'),
    coinDelta: integer('coin_delta').notNull(),
    reasonTemplate: text('reason_template').notNull(),
    emoji: text('emoji').default('🛒'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandProductUnique: uniqueIndex('items_brand_product_unique').on(t.brand, t.product),
  }),
)

// ─── sessions (camera analytics, migrated from kid_id → account_id) ──
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  framesSent: integer('frames_sent').default(0).notNull(),
  detections: integer('detections').default(0).notNull(),
  reactions: integer('reactions').default(0).notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 4 }).default('0'),
})

// ─── chores ───────────────────────────────────────────────────────────
export const chores = pgTable(
  'chores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .references(() => families.id, { onDelete: 'cascade' })
      .notNull(),
    assignedTo: uuid('assigned_to')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => accounts.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    rewardBrains: integer('reward_brains').notNull(),
    // pending → submitted → ai_approved/ai_rejected/ai_uncertain
    //   → parent_approved/parent_rejected → paid
    status: text('status').notNull().default('pending'),
    verificationPhoto: text('verification_photo'), // storage URL of submitted photo
    aiVerdict: text('ai_verdict'),                 // 'approved' | 'rejected' | 'uncertain'
    aiReason: text('ai_reason'),                   // PAL's reason (max 15 words)
    parentNote: text('parent_note'),               // optional note when parent rejects
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    byFamilyCreated: index('chores_family_idx').on(t.familyId, t.createdAt),
    byAssignedStatus: index('chores_assigned_idx').on(t.assignedTo, t.status),
  }),
)

// ─── call_sessions (voice-task inbound phone calls) ───────────────────
export const callSessions = pgTable(
  'call_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }), // matched by caller ID, nullable
    fromPhone: text('from_phone').notNull(), // E.164 caller ID
    twilioCallSid: text('twilio_call_sid').unique(),
    openaiSessionId: text('openai_session_id'),
    status: text('status').notNull().default('active'), // 'active' | 'ended' | 'failed'
    transcript: jsonb('transcript').notNull().default(sql`'[]'::jsonb`), // [{ role, content }]
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    byAccount: index('call_sessions_account_idx').on(t.accountId),
  }),
)

// ─── sms_messages (notification audit) ────────────────────────────────
export const smsMessages = pgTable(
  'sms_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    toPhone: text('to_phone').notNull(), // E.164
    template: text('template').notNull(),
    variables: jsonb('variables').notNull().default(sql`'{}'::jsonb`),
    messageSid: text('message_sid'), // Twilio message SID
    status: text('status').notNull().default('sent'), // 'sent' | 'failed'
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccount: index('sms_messages_account_idx').on(t.accountId),
  }),
)


// ─── memory_facts (agent foundation — personal + behavioral memory) ───
export const memoryFacts = pgTable(
  'memory_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').references(() => families.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }), // null = family-wide
    layer: text('layer').notNull(), // 'personal' | 'behavioral'
    key: text('key').notNull(),
    value: jsonb('value').notNull().default(sql`'{}'::jsonb`),
    source: text('source').notNull(), // 'onboarding' | 'health_pal' | 'consolidation' | ...
    confidence: numeric('confidence', { precision: 3, scale: 2 }).default('1.0').notNull(),
    status: text('status').notNull().default('proposed'), // 'proposed' | 'confirmed' | 'expired'
    confirmedBy: uuid('confirmed_by').references(() => accounts.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byFamily: index('memory_facts_family_idx').on(t.familyId),
    byAccountStatus: index('memory_facts_account_idx').on(t.accountId, t.status),
    byStatus: index('memory_facts_status_idx').on(t.status, t.expiresAt),
  }),
)

// ─── family_rules (agent foundation — family memory / policy inputs) ──
export const familyRules = pgTable(
  'family_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .references(() => families.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind').notNull(), // 'sugar_limit_g' | 'spend_limit_per_txn' | 'health_threshold' | ...
    value: jsonb('value').notNull().default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('confirmed'), // 'proposed' | 'confirmed'
    createdBy: uuid('created_by').references(() => accounts.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byFamilyKind: index('family_rules_family_kind_idx').on(t.familyId, t.kind),
  }),
)

// ─── agent_turns (agent foundation — audit log) ───────────────────────
export const agentTurns = pgTable(
  'agent_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').references(() => families.id, { onDelete: 'cascade' }),
    pal: text('pal').notNull(),
    intent: text('intent').notNull(),
    risk: text('risk').notNull().default('low'), // 'low' | 'medium' | 'high'
    needsParentApproval: boolean('needs_parent_approval').notNull().default(false),
    memoryUsed: jsonb('memory_used').notNull().default(sql`'[]'::jsonb`),
    constraints: jsonb('constraints').notNull().default(sql`'[]'::jsonb`),
    toolCalls: jsonb('tool_calls').notNull().default(sql`'[]'::jsonb`),
    suggestion: text('suggestion'),
    outcome: text('outcome').notNull(), // 'executed' | 'denied' | 'pending_parent'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccount: index('agent_turns_account_idx').on(t.accountId, t.createdAt),
  }),
)