-- BrainPal Agent Foundation — memory layer + audit log.
-- Source of truth: .kiro/specs/brainpal-agent-foundation/design.md § Components 2 + § Data Model Summary.
-- Idempotent: safe to re-run.

-- ─── memory_facts (personal + behavioral memory) ─────────────────────
create table if not exists public.memory_facts (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families(id) on delete cascade,
  account_id    uuid references public.accounts(id) on delete cascade, -- null = family-wide
  layer         text not null check (layer in ('personal','behavioral')),
  key           text not null,
  value         jsonb not null default '{}'::jsonb,
  source        text not null,                       -- 'onboarding' | 'health_pal' | 'consolidation' | ...
  confidence    numeric(3,2) not null default 1.0,
  status        text not null default 'proposed' check (status in ('proposed','confirmed','expired')),
  confirmed_by  uuid references public.accounts(id) on delete set null,
  confirmed_at  timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists memory_facts_family_idx   on public.memory_facts (family_id);
create index if not exists memory_facts_account_idx  on public.memory_facts (account_id, status);
create index if not exists memory_facts_status_idx   on public.memory_facts (status, expires_at);

-- ─── family_rules (family memory / policy inputs) ────────────────────
create table if not exists public.family_rules (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  kind        text not null,   -- 'sugar_limit_g' | 'weekly_allowance' | 'spend_limit_per_txn'
                               -- | 'approved_merchants' | 'safe_zones' | 'health_threshold' | 'savings_bias'
  value       jsonb not null default '{}'::jsonb,
  status      text not null default 'confirmed' check (status in ('proposed','confirmed')),
  created_by  uuid references public.accounts(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index if not exists family_rules_family_kind_idx on public.family_rules (family_id, kind);

-- ─── agent_turns (audit log) ─────────────────────────────────────────
create table if not exists public.agent_turns (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid references public.accounts(id) on delete cascade,
  family_id             uuid references public.families(id) on delete cascade,
  pal                   text not null,
  intent                text not null,
  risk                  text not null default 'low' check (risk in ('low','medium','high')),
  needs_parent_approval boolean not null default false,
  memory_used           jsonb not null default '[]'::jsonb,
  constraints           jsonb not null default '[]'::jsonb,
  tool_calls            jsonb not null default '[]'::jsonb,
  suggestion            text,
  outcome               text not null check (outcome in ('executed','denied','pending_parent')),
  created_at            timestamptz not null default now()
);

create index if not exists agent_turns_account_idx on public.agent_turns (account_id, created_at desc);

-- ─── RLS (family-scope, mirrors chores_family_scope) ─────────────────
alter table public.memory_facts enable row level security;
alter table public.family_rules enable row level security;
alter table public.agent_turns  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'memory_facts' and policyname = 'memory_facts_family_scope') then
    create policy memory_facts_family_scope on public.memory_facts for all
      using (family_id in (select family_id from public.memberships where account_id = auth.uid()))
      with check (family_id in (select family_id from public.memberships where account_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'family_rules' and policyname = 'family_rules_family_scope') then
    create policy family_rules_family_scope on public.family_rules for all
      using (family_id in (select family_id from public.memberships where account_id = auth.uid()))
      with check (family_id in (select family_id from public.memberships where account_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'agent_turns' and policyname = 'agent_turns_family_scope') then
    create policy agent_turns_family_scope on public.agent_turns for all
      using (family_id in (select family_id from public.memberships where account_id = auth.uid()))
      with check (family_id in (select family_id from public.memberships where account_id = auth.uid()));
  end if;
end $$;
