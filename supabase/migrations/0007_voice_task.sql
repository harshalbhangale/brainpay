-- 0007_voice_task.sql
-- Voice-task feature: inbound phone calls + WhatsApp notifications.
-- Tables are append-only additions; no changes to existing schema.

-- ─── call_sessions ────────────────────────────────────────────────────
create table if not exists call_sessions (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid references accounts(id) on delete set null,
  from_phone        text not null,
  twilio_call_sid   text unique,
  openai_session_id text,
  status            text not null default 'active',  -- active | ended | failed
  transcript        jsonb not null default '[]'::jsonb,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz
);

create index if not exists call_sessions_account_idx on call_sessions(account_id);

-- ─── sms_messages ─────────────────────────────────────────────────────
create table if not exists sms_messages (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references accounts(id) on delete set null,
  to_phone     text not null,
  template     text not null,
  variables    jsonb not null default '{}'::jsonb,
  message_sid  text,
  status       text not null default 'sent',  -- sent | failed
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists sms_messages_account_idx on sms_messages(account_id);
