-- BrainPal Sprint 1 — Chores table + push token column.
-- Source of truth: docs/sprint-1-plan.md § 12.
-- Idempotent: safe to re-run.

-- ─── push_token on accounts ──────────────────────────────────────────
alter table public.accounts
  add column if not exists push_token text;

-- ─── chores ──────────────────────────────────────────────────────────
create table if not exists public.chores (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  assigned_to         uuid not null references public.accounts(id) on delete cascade,
  created_by          uuid not null references public.accounts(id) on delete restrict,
  title               text not null,
  reward_brains       int  not null check (reward_brains > 0),
  status              text not null default 'pending'
                        check (status in (
                          'pending',
                          'submitted',
                          'ai_approved',
                          'ai_rejected',
                          'ai_uncertain',
                          'parent_approved',
                          'parent_rejected',
                          'paid'
                        )),
  verification_photo  text,          -- storage URL of submitted photo
  ai_verdict          text           check (ai_verdict in ('approved','rejected','uncertain')),
  ai_reason           text,          -- PAL's reason string (max 15 words)
  parent_note         text,          -- optional note when parent rejects
  created_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  completed_at        timestamptz
);

create index if not exists chores_family_idx
  on public.chores (family_id, created_at desc);

create index if not exists chores_assigned_idx
  on public.chores (assigned_to, status);

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.chores enable row level security;

-- Family members can read/write chores in their family.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'chores' and policyname = 'chores_family_scope'
  ) then
    create policy chores_family_scope on public.chores
      for all
      using (
        family_id in (
          select family_id from public.memberships where account_id = auth.uid()
        )
      )
      with check (
        family_id in (
          select family_id from public.memberships where account_id = auth.uid()
        )
      );
  end if;
end $$;
