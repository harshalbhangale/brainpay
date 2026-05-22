-- BrainPay P0 — family-first schema migration
-- Replaces the kid-only model with accounts/families/memberships/ledger.
-- Source of truth: docs/p0-spec.md § 11.1.
--
-- Camera pipeline IS preserved: the `sessions` table is migrated in place
-- (kid_id → account_id), keeping perception.ts working with the new schema.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Drop old RLS policies if their tables still exist ──────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='users') then
    execute 'drop policy if exists users_self on public.users';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='kids') then
    execute 'drop policy if exists kids_self on public.kids';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='ledger_entries') then
    execute 'drop policy if exists ledger_self on public.ledger_entries';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='sessions') then
    execute 'drop policy if exists sessions_self on public.sessions';
  end if;
end $$;

-- ─── accounts ────────────────────────────────────────────────────────
-- One row per phone number / authed human. account_type set during onboarding.
create table if not exists public.accounts (
  id              uuid primary key,                        -- matches auth.users.id
  phone           text unique not null,
  account_type    text check (account_type in ('parent','kid','extended')),
  persona         jsonb default '{}'::jsonb not null,      -- { name, avatar, color, age, voiceId, style, ... }
  cached_balance  int default 0 not null,
  created_at      timestamptz default now() not null,
  last_seen_at    timestamptz
);

-- ─── families ────────────────────────────────────────────────────────
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar      text default '🏡',
  created_at  timestamptz default now() not null
);

-- ─── memberships ─────────────────────────────────────────────────────
create table if not exists public.memberships (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  role         text not null check (role in ('primary_parent','co_parent','guardian','kid')),
  joined_at    timestamptz default now() not null,
  unique (family_id, account_id)
);
create index if not exists memberships_family_idx  on public.memberships (family_id);
create index if not exists memberships_account_idx on public.memberships (account_id);

-- ─── ledger ──────────────────────────────────────────────────────────
-- Single source of truth for every Brains movement. Append-only.
create table if not exists public.ledger (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  account_id      uuid not null references public.accounts(id) on delete cascade,
  actor_id        uuid not null references public.accounts(id) on delete restrict,
  kind            text not null check (kind in (
                     'topup','scan_skip_reward','purchase','goal_lock','goal_unlock',
                     'streak_bonus','adjustment','cart_checkout'
                   )),
  brains_delta    int not null,
  balance_after   int not null,
  metadata        jsonb default '{}'::jsonb not null,
  created_at      timestamptz default now() not null
);
create index if not exists ledger_family_created_idx  on public.ledger (family_id, created_at desc);
create index if not exists ledger_account_created_idx on public.ledger (account_id, created_at desc);

-- ─── goals ───────────────────────────────────────────────────────────
create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete cascade,  -- null = family goal (P3)
  name            text not null,
  target_brains   int not null,
  current_brains  int default 0 not null,
  emoji           text default '🎯',
  status          text default 'active' check (status in ('active','completed','abandoned')),
  created_at      timestamptz default now() not null,
  completed_at    timestamptz
);
create index if not exists goals_account_idx on public.goals (account_id) where account_id is not null;
create index if not exists goals_family_idx  on public.goals (family_id);

-- ─── cart_items ──────────────────────────────────────────────────────
-- Kid's active cart. Auto-expires after 24h.
create table if not exists public.cart_items (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  detection_id   text,
  item_name      text not null,
  item_emoji     text default '🛒',
  brains_delta   int not null,
  pal_quote      text,
  metadata       jsonb default '{}'::jsonb not null,
  created_at     timestamptz default now() not null,
  expires_at     timestamptz default (now() + interval '24 hours') not null
);
create index if not exists cart_account_idx on public.cart_items (account_id, created_at desc);

-- ─── invites ─────────────────────────────────────────────────────────
create table if not exists public.invites (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  invited_by      uuid not null references public.accounts(id) on delete cascade,
  code            text unique not null,                 -- short, SMS-friendly
  token           text unique not null,                 -- signed JWT
  expected_role   text not null check (expected_role in ('co_parent','guardian','kid')),
  kid_seed        jsonb default '{}'::jsonb not null,   -- pre-fill for kid persona wizard
  initial_topup   int default 0 not null,
  recipient_phone text,                                  -- when delivered via SMS
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  status          text default 'pending' check (status in ('pending','viewed','accepted','expired','revoked'))
);
create index if not exists invites_code_idx   on public.invites (code) where status = 'pending';
create index if not exists invites_family_idx on public.invites (family_id);

-- ─── chat_messages ───────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  role        text not null check (role in ('user','assistant','system')),
  content     text not null,
  created_at  timestamptz default now() not null
);
create index if not exists chat_account_created_idx on public.chat_messages (account_id, created_at desc);

-- ─── inbox ───────────────────────────────────────────────────────────
-- In-app notifications (replaces push for P0).
create table if not exists public.inbox (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  metadata     jsonb default '{}'::jsonb not null,
  read_at      timestamptz,
  created_at   timestamptz default now() not null
);
create index if not exists inbox_account_idx on public.inbox (account_id, created_at desc);

-- ─── sessions: migrate kid_id → account_id (only if table exists) ────
-- The camera pipeline writes to this table. Migrate columns in place to
-- keep perception.ts working with minimal changes.
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='sessions') then
    -- Fresh project: create the sessions table from scratch.
    execute $sql$
      create table public.sessions (
        id                 uuid primary key default gen_random_uuid(),
        account_id         uuid not null references public.accounts(id) on delete cascade,
        started_at         timestamptz default now() not null,
        ended_at           timestamptz,
        frames_sent        int default 0 not null,
        detections         int default 0 not null,
        reactions          int default 0 not null,
        estimated_cost_usd numeric(10,4) default 0
      )
    $sql$;
    return;
  end if;

  -- Existing project: rename column if still using kid_id.
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='sessions' and column_name='kid_id') then
    alter table public.sessions drop constraint if exists sessions_kid_id_fkey;
    alter table public.sessions rename column kid_id to account_id;
  end if;

  -- Drop any session rows whose account no longer exists, then re-link FK.
  delete from public.sessions
    where account_id is not null
      and account_id not in (select id from public.accounts);
  alter table public.sessions
    drop constraint if exists sessions_account_id_fkey;
  alter table public.sessions
    add constraint sessions_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete cascade;
end $$;

-- ─── balance trigger ─────────────────────────────────────────────────
-- On every ledger insert, update accounts.cached_balance atomically.
create or replace function public.bump_cached_balance()
returns trigger language plpgsql as $$
begin
  update public.accounts
    set cached_balance = cached_balance + new.brains_delta,
        last_seen_at   = now()
  where id = new.account_id;
  return new;
end;
$$;

drop trigger if exists ledger_bump_balance on public.ledger;
create trigger ledger_bump_balance
  after insert on public.ledger
  for each row execute function public.bump_cached_balance();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.accounts       enable row level security;
alter table public.families       enable row level security;
alter table public.memberships    enable row level security;
alter table public.ledger         enable row level security;
alter table public.goals          enable row level security;
alter table public.cart_items     enable row level security;
alter table public.invites        enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.inbox          enable row level security;
alter table public.sessions       enable row level security;

-- accounts: read/write own row
drop policy if exists accounts_self on public.accounts;
create policy accounts_self on public.accounts
  for all using (id = auth.uid()) with check (id = auth.uid());

-- families: members can read, primary_parent can write
drop policy if exists families_member_read on public.families;
create policy families_member_read on public.families
  for select using (
    id in (select family_id from public.memberships where account_id = auth.uid())
  );

drop policy if exists families_parent_write on public.families;
create policy families_parent_write on public.families
  for all
  using (
    id in (select family_id from public.memberships
           where account_id = auth.uid() and role in ('primary_parent','co_parent'))
  )
  with check (
    id in (select family_id from public.memberships
           where account_id = auth.uid() and role in ('primary_parent','co_parent'))
  );

-- memberships: members can see all rows in their family
drop policy if exists memberships_family_visible on public.memberships;
create policy memberships_family_visible on public.memberships
  for select using (
    family_id in (select family_id from public.memberships where account_id = auth.uid())
  );

-- ledger: scoped to families the user is a member of
drop policy if exists ledger_family_scope on public.ledger;
create policy ledger_family_scope on public.ledger
  for all
  using (
    family_id in (select family_id from public.memberships where account_id = auth.uid())
  )
  with check (
    family_id in (select family_id from public.memberships where account_id = auth.uid())
  );

-- goals: same family scope
drop policy if exists goals_family_scope on public.goals;
create policy goals_family_scope on public.goals
  for all
  using (
    family_id in (select family_id from public.memberships where account_id = auth.uid())
  )
  with check (
    family_id in (select family_id from public.memberships where account_id = auth.uid())
  );

-- cart_items: own only
drop policy if exists cart_self on public.cart_items;
create policy cart_self on public.cart_items
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- invites: family-scoped read for any member; write for parents
drop policy if exists invites_family_read on public.invites;
create policy invites_family_read on public.invites
  for select using (
    family_id in (select family_id from public.memberships where account_id = auth.uid())
  );
drop policy if exists invites_parent_write on public.invites;
create policy invites_parent_write on public.invites
  for all
  using (
    family_id in (select family_id from public.memberships
                  where account_id = auth.uid() and role in ('primary_parent','co_parent'))
  )
  with check (
    family_id in (select family_id from public.memberships
                  where account_id = auth.uid() and role in ('primary_parent','co_parent'))
  );

-- chat_messages: own only
drop policy if exists chat_self on public.chat_messages;
create policy chat_self on public.chat_messages
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- inbox: own only
drop policy if exists inbox_self on public.inbox;
create policy inbox_self on public.inbox
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- sessions: own only
drop policy if exists sessions_self_v2 on public.sessions;
create policy sessions_self_v2 on public.sessions
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- items: ensure the catalog table exists (would normally come from 0001).
-- Self-sufficient so 0002 can run on a fresh DB.
create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  brand           text not null,
  product         text not null,
  category        text,
  coin_delta      int not null,
  reason_template text not null,
  emoji           text default '🛒',
  created_at      timestamptz default now() not null,
  unique (brand, product)
);

alter table public.items enable row level security;
drop policy if exists items_read on public.items;
create policy items_read on public.items for select using (true);

-- Seed catalog (idempotent).
insert into public.items (brand, product, category, coin_delta, reason_template, emoji)
values
  ('Coca-Cola', 'Classic 375ml can', 'drink', -10, '39g of sugar in one can',           '🥤'),
  ('Coles',     'Mixed Nuts 150g',   'snack',  15, 'protein and good fats, brain food', '🥜')
on conflict (brand, product) do nothing;

-- ─── Drop legacy tables LAST ────────────────────────────────────────
-- Cascades through any remaining FKs we missed.
drop table if exists public.ledger_entries cascade;
drop table if exists public.kids           cascade;
drop table if exists public.users          cascade;
