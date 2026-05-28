-- BrainPal Sprint 1 — extend ledger.kind CHECK constraint.
-- Adds: chore_payout, topup_stripe
-- Idempotent: drops and recreates the constraint.

alter table public.ledger
  drop constraint if exists ledger_kind_check;

alter table public.ledger
  add constraint ledger_kind_check check (kind = any (array[
    'topup',
    'topup_stripe',
    'scan_skip_reward',
    'purchase',
    'cart_checkout',
    'chore_payout',
    'goal_lock',
    'goal_unlock',
    'streak_bonus',
    'adjustment'
  ]));
