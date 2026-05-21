-- BrainPal — initial schema
-- Source of truth: Detailed Feature Build Spec § 1.4
-- Drizzle schema mirrors this in apps/api/src/db/schema.ts

create extension if not exists "uuid-ossp";

-- ─── users ────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default uuid_generate_v4(),
  phone         text unique not null,
  display_name  text,
  avatar_emoji  text default '🧒',
  created_at    timestamptz default now() not null,
  last_seen_at  timestamptz
);

-- ─── kids ─────────────────────────────────────────────────────────────
create table if not exists public.kids (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  display_name  text not null,
  age           int,
  balance_cents int not null default 10000,
  created_at    timestamptz default now() not null
);

-- ─── items (catalog) ──────────────────────────────────────────────────
create table if not exists public.items (
  id              uuid primary key default uuid_generate_v4(),
  brand           text not null,
  product         text not null,
  category        text,
  coin_delta      int not null,
  reason_template text not null,
  emoji           text default '🛒',
  created_at      timestamptz default now() not null,
  unique (brand, product)
);

-- ─── ledger_entries (append-only) ────────────────────────────────────
create table if not exists public.ledger_entries (
  id            uuid primary key default uuid_generate_v4(),
  kid_id        uuid not null references public.kids(id) on delete cascade,
  item_id       uuid references public.items(id),
  kind          text not null check (kind in ('purchase', 'topup', 'reward', 'adjustment')),
  coin_delta    int not null,
  balance_after int not null,
  note          text,
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz default now() not null
);
create index if not exists ledger_kid_created_idx on public.ledger_entries (kid_id, created_at desc);

-- ─── sessions (camera live sessions) ─────────────────────────────────
create table if not exists public.sessions (
  id                 uuid primary key default uuid_generate_v4(),
  kid_id             uuid not null references public.kids(id) on delete cascade,
  started_at         timestamptz default now() not null,
  ended_at           timestamptz,
  frames_sent        int default 0 not null,
  detections         int default 0 not null,
  reactions          int default 0 not null,
  estimated_cost_usd numeric(10,4) default 0
);

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.users          enable row level security;
alter table public.kids           enable row level security;
alter table public.items          enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.sessions       enable row level security;

-- users: a user can read/update their own row
create policy users_self on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- kids: kid row is readable/writable by the owning user
create policy kids_self on public.kids
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ledger_entries: kid can read/write rows for their own kid record
create policy ledger_self on public.ledger_entries
  for all
  using   (kid_id in (select id from public.kids where user_id = auth.uid()))
  with check (kid_id in (select id from public.kids where user_id = auth.uid()));

-- sessions: same scope as ledger
create policy sessions_self on public.sessions
  for all
  using   (kid_id in (select id from public.kids where user_id = auth.uid()))
  with check (kid_id in (select id from public.kids where user_id = auth.uid()));

-- items: read-only public, writes only via service role (RLS bypassed)
create policy items_read on public.items for select using (true);

-- ─── seed: v1 catalog (Coca-Cola + Coles Mixed Nuts) ─────────────────
insert into public.items (brand, product, category, coin_delta, reason_template, emoji)
values
  ('Coca-Cola',    'Classic 375ml can',  'drink', -10, '39g of sugar in one can',                  '🥤'),
  ('Coles',        'Mixed Nuts 150g',    'snack',  15, 'protein and good fats, brain food',        '🥜')
on conflict (brand, product) do nothing;
