-- 0003 — Fix infinite recursion in RLS policies (Postgres error 42P17)
--
-- 0002 created policies on memberships / families / ledger / goals / invites
-- that all do `family_id in (select family_id from public.memberships where ...)`.
-- The policy on memberships itself queries memberships → triggers its own
-- policy → recurses. Postgres detects this and refuses every read.
--
-- Standard Supabase fix: extract the inner query into SECURITY DEFINER
-- helper functions. They run as the function owner (postgres role) which
-- bypasses RLS, breaking the recursion loop.
--
-- After this migration, every previously-broken table read returns 200.

-- ─── helpers ─────────────────────────────────────────────────────────
create or replace function public.user_family_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select family_id from public.memberships where account_id = auth.uid();
$$;

create or replace function public.user_parent_family_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select family_id from public.memberships
  where account_id = auth.uid()
    and role in ('primary_parent', 'co_parent');
$$;

-- These functions must be callable by authenticated end-users.
grant execute on function public.user_family_ids() to authenticated, anon;
grant execute on function public.user_parent_family_ids() to authenticated, anon;

-- ─── memberships ─────────────────────────────────────────────────────
drop policy if exists memberships_family_visible on public.memberships;
create policy memberships_family_visible on public.memberships
  for select using (family_id in (select public.user_family_ids()));

-- ─── families ────────────────────────────────────────────────────────
drop policy if exists families_member_read on public.families;
create policy families_member_read on public.families
  for select using (id in (select public.user_family_ids()));

drop policy if exists families_parent_write on public.families;
create policy families_parent_write on public.families
  for all
  using (id in (select public.user_parent_family_ids()))
  with check (id in (select public.user_parent_family_ids()));

-- ─── ledger ──────────────────────────────────────────────────────────
drop policy if exists ledger_family_scope on public.ledger;
create policy ledger_family_scope on public.ledger
  for all
  using (family_id in (select public.user_family_ids()))
  with check (family_id in (select public.user_family_ids()));

-- ─── goals ───────────────────────────────────────────────────────────
drop policy if exists goals_family_scope on public.goals;
create policy goals_family_scope on public.goals
  for all
  using (family_id in (select public.user_family_ids()))
  with check (family_id in (select public.user_family_ids()));

-- ─── invites ─────────────────────────────────────────────────────────
drop policy if exists invites_family_read on public.invites;
create policy invites_family_read on public.invites
  for select using (family_id in (select public.user_family_ids()));

drop policy if exists invites_parent_write on public.invites;
create policy invites_parent_write on public.invites
  for all
  using (family_id in (select public.user_parent_family_ids()))
  with check (family_id in (select public.user_parent_family_ids()));
