-- StudyPal: S3 Vectors wrapper + study tables
-- Run via: supabase db push or supabase migration up

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Enable S3 Vectors Wrapper (Foreign Data Wrapper)
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists wrappers with schema extensions;

-- Create the S3 Vectors foreign server
create foreign data wrapper s3_vectors_wrapper
  handler s3_vectors_fdw_handler
  validator s3_vectors_fdw_validator;

-- Store AWS credentials in vault (use your actual creds)
-- Run these separately or replace with your values:
-- select vault.create_secret('s3_vectors_access_key', '<AWS_ACCESS_KEY_ID>');
-- select vault.create_secret('s3_vectors_secret_key', '<AWS_SECRET_ACCESS_KEY>');

create server s3_vectors_server
  foreign data wrapper s3_vectors_wrapper
  options (
    region 'ap-southeast-2'
  );

-- Create the foreign table for study chunks
create foreign table study_chunks (
  id text,
  topic_id text,
  document_id text,
  account_id text,
  content text,
  metadata jsonb,
  embedding vector(1536)
)
server s3_vectors_server
options (
  bucket_name 'brainpal-vectors',
  vector_collection 'study_chunks'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Study tables (relational data in Postgres)
-- ═══════════════════════════════════════════════════════════════════════

create table study_topics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  emoji text default '📚',
  status text not null default 'active',
  cards_due integer not null default 0,
  total_cards integer not null default 0,
  created_at timestamptz not null default now()
);
create index study_topics_account_idx on study_topics(account_id, status);

create table study_documents (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references study_topics(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  file_url text not null,
  file_type text not null,
  file_size integer default 0,
  page_count integer,
  processing_status text not null default 'pending',
  chunk_count integer default 0,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index study_docs_topic_idx on study_documents(topic_id);

create table study_cards (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references study_topics(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  document_id uuid references study_documents(id) on delete set null,
  chunk_ref text,
  front text not null,
  back text not null,
  difficulty integer not null default 0,
  ease_factor numeric(4,2) not null default 2.50,
  interval integer not null default 0,
  review_count integer not null default 0,
  status text not null default 'new',
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index study_cards_review_idx on study_cards(topic_id, next_review_at);
create index study_cards_account_due_idx on study_cards(account_id, next_review_at);

create table study_concepts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  topic_id uuid not null references study_topics(id) on delete cascade,
  concept text not null,
  understanding numeric(3,2) not null default 0.00,
  connections jsonb not null default '[]'::jsonb,
  review_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_reviewed_at timestamptz
);
create index study_concepts_account_idx on study_concepts(account_id, topic_id);

create table study_quizzes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references study_topics(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  question_count integer not null,
  correct_count integer not null default 0,
  score_pct integer not null default 0,
  weak_concepts jsonb not null default '[]'::jsonb,
  brains_earned integer not null default 0,
  status text not null default 'in_progress',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index study_quizzes_account_idx on study_quizzes(account_id, created_at);

create table study_interviews (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references study_topics(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  focus_areas jsonb not null default '[]'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  duration_secs integer default 0,
  score integer,
  brains_earned integer default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index study_interviews_account_idx on study_interviews(account_id, created_at);

create table study_streaks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_study_date timestamptz,
  updated_at timestamptz not null default now()
);
create index study_streaks_account_idx on study_streaks(account_id);
