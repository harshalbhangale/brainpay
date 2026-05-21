# BrainPal

iOS-first kid money app: phone-OTP auth, Cash-App-style coin dashboard, and a live camera that puts a floating coin over snacks while a sarcastic PAL voice reacts in <800ms.

## Read these in order

1. **`BrainPal — MVP Build Plan…md`** — scope, timeline, locked decisions
2. **`BrainPal — Detailed Feature Build Spec…md`** — per-feature engineering
3. **`docs/build-deck.md`** — execution doc: repo layout, Fargate plan, day-by-day mapped to files

## Quickstart

```bash
# Node 20 LTS, pnpm 9.15.4
pnpm install
cp .env.example .env.local         # fill secrets (see docs/build-deck.md §4)

# API (Hono on Fargate locally)
pnpm --filter @brainpal/api dev

# Mobile (Expo, iOS only)
pnpm --filter @brainpal/mobile dev
```

## Layout

```
apps/api        Hono server → Fargate (ap-southeast-2)
apps/mobile     Expo iOS app
packages/shared zod schemas (HTTP + WS contract)
packages/config tsconfig + prettier
supabase/       edge functions (otp-start, otp-check) + migrations
infra/          ECS task def, deployment notes
docs/           build deck + future ADRs
```

Everything else lives in `docs/build-deck.md`.
