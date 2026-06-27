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
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts, families } from './schema'

/**
 * StudyPal schema — learning & study features.
 * Tied into the existing family model via accountId + familyId.
 * Vectors stored in S3 Vectors via FDW (not in these tables).
 */

// ─── study_topics ─────────────────────────────────────────────────────
export const studyTopics = pgTable(
  'study_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    familyId: uuid('family_id')
      .references(() => families.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    emoji: text('emoji').default('📚'),
    status: text('status').notNull().default('active'), // 'active' | 'completed' | 'archived'
    cardsDue: integer('cards_due').default(0).notNull(),
    totalCards: integer('total_cards').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccount: index('study_topics_account_idx').on(t.accountId, t.status),
  }),
)

// ─── study_documents ──────────────────────────────────────────────────
export const studyDocuments = pgTable(
  'study_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .references(() => studyTopics.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    fileUrl: text('file_url').notNull(),
    fileType: text('file_type').notNull(), // 'pdf' | 'image' | 'text'
    fileSize: integer('file_size').default(0), // bytes
    pageCount: integer('page_count'),
    processingStatus: text('processing_status').notNull().default('pending'),
    // 'pending' | 'processing' | 'ready' | 'failed'
    chunkCount: integer('chunk_count').default(0),
    rawText: text('raw_text'), // extracted/inline source text, for regeneration
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({
    byTopic: index('study_docs_topic_idx').on(t.topicId),
  }),
)

// ─── study_cards (flashcards with SM-2 spaced repetition) ─────────────
export const studyCards = pgTable(
  'study_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .references(() => studyTopics.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id').references(() => studyDocuments.id, { onDelete: 'set null' }),
    chunkRef: text('chunk_ref'), // S3 Vectors chunk ID reference
    chapter: text('chapter'), // chapter/section this concept belongs to (nullable)
    front: text('front').notNull(), // question / concept
    back: text('back').notNull(), // answer / explanation
    difficulty: integer('difficulty').default(0).notNull(), // 0=new, 1-5 after reviews
    easeFactor: numeric('ease_factor', { precision: 4, scale: 2 }).default('2.50').notNull(),
    interval: integer('interval').default(0).notNull(), // days until next review
    reviewCount: integer('review_count').default(0).notNull(),
    status: text('status').notNull().default('new'), // 'new' | 'learning' | 'mastered'
    bookmarked: boolean('bookmarked').notNull().default(false), // kid-saved important cards
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).defaultNow().notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTopicReview: index('study_cards_review_idx').on(t.topicId, t.nextReviewAt),
    byAccountDue: index('study_cards_account_due_idx').on(t.accountId, t.nextReviewAt),
    byBookmark: index('study_cards_bookmark_idx').on(t.accountId, t.bookmarked),
  }),
)

// ─── study_concepts (long-term knowledge map) ─────────────────────────
export const studyConcepts = pgTable(
  'study_concepts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    topicId: uuid('topic_id')
      .references(() => studyTopics.id, { onDelete: 'cascade' })
      .notNull(),
    concept: text('concept').notNull(), // "photosynthesis", "quadratic formula"
    understanding: numeric('understanding', { precision: 3, scale: 2 }).default('0.00').notNull(),
    // 0.00 to 1.00
    connections: jsonb('connections').notNull().default(sql`'[]'::jsonb`),
    // related concept IDs
    reviewCount: integer('review_count').default(0).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  },
  (t) => ({
    byAccountConcept: index('study_concepts_account_idx').on(t.accountId, t.topicId),
  }),
)

// ─── study_quizzes ────────────────────────────────────────────────────
export const studyQuizzes = pgTable(
  'study_quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .references(() => studyTopics.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    questionCount: integer('question_count').notNull(),
    correctCount: integer('correct_count').default(0).notNull(),
    scorePct: integer('score_pct').default(0).notNull(),
    weakConcepts: jsonb('weak_concepts').notNull().default(sql`'[]'::jsonb`),
    brainsEarned: integer('brains_earned').default(0).notNull(),
    status: text('status').notNull().default('in_progress'), // 'in_progress' | 'completed'
    questions: jsonb('questions').notNull().default(sql`'[]'::jsonb`),
    // [{question, options, correctAnswer, kidAnswer, isCorrect, aiFeedback}]
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    byAccount: index('study_quizzes_account_idx').on(t.accountId, t.createdAt),
  }),
)

// ─── study_interviews ─────────────────────────────────────────────────
export const studyInterviews = pgTable(
  'study_interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .references(() => studyTopics.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    focusAreas: jsonb('focus_areas').notNull().default(sql`'[]'::jsonb`),
    transcript: jsonb('transcript').notNull().default(sql`'[]'::jsonb`),
    durationSecs: integer('duration_secs').default(0),
    score: integer('score'), // 1-10
    brainsEarned: integer('brains_earned').default(0),
    status: text('status').notNull().default('active'), // 'active' | 'completed'
    // Chapter-scoped Tavus video interview fields.
    chapter: text('chapter'),
    mode: text('mode').notNull().default('chapter'), // 'chapter' | 'concept' | 'viva'
    tavusConversationId: text('tavus_conversation_id'),
    tavusConversationUrl: text('tavus_conversation_url'),
    summary: text('summary'),
    keepPractising: jsonb('keep_practising').notNull().default(sql`'[]'::jsonb`),
    focus: jsonb('focus'), // { lookingPct, flags: string[], notes } — for the parent
    // Rich AI analysis of the viva (strengths, weak points, recommendations,
    // per-concept ratings, level, headline, encouragement). Shown to kids after
    // the interview, in Past interviews, and to parents. Nullable for old rows.
    analysis: jsonb('analysis'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    byAccount: index('study_interviews_account_idx').on(t.accountId, t.createdAt),
  }),
)

// ─── study_streaks ────────────────────────────────────────────────────
export const studyStreaks = pgTable(
  'study_streaks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    currentStreak: integer('current_streak').default(0).notNull(),
    longestStreak: integer('longest_streak').default(0).notNull(),
    lastStudyDate: timestamp('last_study_date', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccount: index('study_streaks_account_idx').on(t.accountId),
  }),
)
