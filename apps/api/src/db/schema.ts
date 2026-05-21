import { sql } from 'drizzle-orm'
import {
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
 * BrainPal database schema.
 * See: Detailed Feature Build Spec § 1.4.
 *
 * Coin convention: integer points shown to user, cents stored in DB
 *   1 coin == 1 cent internally. 100 coins == 10000 in balance_cents.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(), // E.164
  displayName: text('display_name'),
  avatarEmoji: text('avatar_emoji').default('🧒'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
})

export const kids = pgTable('kids', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  displayName: text('display_name').notNull(),
  age: integer('age'),
  balanceCents: integer('balance_cents').default(10000).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brand: text('brand').notNull(),
    product: text('product').notNull(),
    category: text('category'), // drink | snack | dairy | produce | other
    coinDelta: integer('coin_delta').notNull(), // +15 or -10
    reasonTemplate: text('reason_template').notNull(),
    emoji: text('emoji').default('🛒'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandProductUnique: uniqueIndex('items_brand_product_unique').on(t.brand, t.product),
  }),
)

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kidId: uuid('kid_id')
      .references(() => kids.id, { onDelete: 'cascade' })
      .notNull(),
    itemId: uuid('item_id').references(() => items.id),
    kind: text('kind').notNull(), // 'purchase' | 'topup' | 'reward' | 'adjustment'
    coinDelta: integer('coin_delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    note: text('note'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byKidCreated: index('ledger_kid_created_idx').on(t.kidId, t.createdAt),
  }),
)

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  kidId: uuid('kid_id')
    .references(() => kids.id, { onDelete: 'cascade' })
    .notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  framesSent: integer('frames_sent').default(0).notNull(),
  detections: integer('detections').default(0).notNull(),
  reactions: integer('reactions').default(0).notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 4 }).default('0'),
})
