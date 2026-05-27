# Implementation Plan: Healthy Shopping Game (HSG)

## Status Summary

**Nothing from HSG has been built yet.** All 13 task groups are pending.

### What exists (reusable foundation)
- ✅ `apps/api/src/db/schema.ts` — base tables (`accounts`, `families`, `memberships`, `ledger`, `inbox`, `goals`, `cart_items`, `invites`). `ledger.kind` already accepts `'scan_skip_reward'` (migration 0002). No HSG tables yet.
- ✅ `apps/api/src/services/bedrock.ts` — Bedrock Nova Lite client (shelf-scan will reuse)
- ✅ `apps/api/src/services/elevenlabs.ts` — ElevenLabs TTS client (voice will reuse)
- ✅ `apps/api/src/services/llm.ts` — OpenAI client (reasoning will reuse)
- ✅ `apps/api/src/ws/handler.ts`, `perception.ts`, `voice.ts`, `framing.ts` — existing WebSocket pipeline (HSG adds a sibling module, does NOT modify these)
- ✅ `apps/mobile/app/(app)/camera.tsx` — existing camera screen (HSG round screen reuses patterns, does NOT modify it)
- ✅ `apps/mobile/stores/auth.ts`, `family.ts` — existing Zustand stores
- ✅ `packages/shared/src/` — shared types package wired to both api and mobile; no HSG types yet
- ✅ `supabase/migrations/0001–0003` — base schema applied; `0004_shopping_game.sql` does not exist yet
- ✅ `expo-camera`, `expo-audio`, `expo-image-manipulator` — already installed in mobile

### What's missing (everything HSG-specific)
- ❌ Migration `0004_shopping_game.sql`
- ❌ Drizzle HSG tables in `schema.ts`
- ❌ `packages/shared/src/shopping-game.ts`
- ❌ API services: `voice-persona.ts`, `shelf-scan.ts`, `round-finalize.ts`, `shopping-game-llm.ts`
- ❌ WS module: `apps/api/src/ws/shopping-game-perception.ts`
- ❌ HTTP routes: `shopping-game.ts`, `shopping-game.schemas.ts` (parent setup + history + thumbnail upload + speak proxy only — game loop is WS)
- ❌ `SHOPPING_GAME_ENABLED` env var and `/me` flag
- ❌ Mobile screens: start, round, round-summary, session-summary, parent settings, parent history
- ❌ Mobile store `shoppingGame.ts`, API client wrappers, feature-flag hook
- ❌ Storage bucket bootstrap script
- ❌ Privacy/retention cron
- ❌ Rollout docs and Fargate env vars

---

## Overview

Implements [`requirements.md`](./requirements.md) per the technical plan in [`design.md`](./design.md). Tasks deliver HSG as a vertical slice across DB → shared types → API services → WS pipeline → HTTP routes → mobile state → mobile screens → privacy cron → rollout. Each task is the **WHAT**; design.md is the **HOW**.

**Architecture note:** The HSG game loop (session start, live frame streaming, productCard events, card selection, hints, corrections, round transitions) runs entirely over the existing `/live` WebSocket at `ws://…/live?mode=shopping-game`. HTTP routes handle only: parent threshold-profile CRUD, session/round history reads, post-selection thumbnail upload, and the speak proxy for parent history replays. This is the final design — tasks 4.3–4.6 below reflect this split.

Sequencing minimises rework: schema and shared types land first so both API and mobile compile against them; pure services land before the routes and WS handler that wire them; the mobile store lands before screens that consume it; tests close each layer.

**Tech context:**
- API: Hono + Node 20 + Drizzle in `apps/api`, deployed to AWS Fargate via `.github/workflows/deploy-api.yml`. Verify with `pnpm --filter @brainpal/api typecheck` before pushing.
- Mobile: Expo SDK 54 / React Native 0.81 with `expo-router`. Every visual task must be exercised on iOS and Android.
- DB: Supabase Postgres; migrations in `supabase/migrations/`, applied via `supabase db push`.
- Shared types: `packages/shared` (workspace package, importable from both api and mobile).

## Tasks

- [ ] 1. Schema and shared types
  - [ ] 1.1 Author SQL migration `supabase/migrations/0004_shopping_game.sql`
    - Create `threshold_profiles`, `game_sessions`, `game_rounds`, `kid_streaks` tables with columns, defaults, and CHECK constraints from design § 3.4.
    - Add indexes: `threshold_profiles_family_idx`, `game_sessions_family_started_idx`, `game_sessions_account_started_idx`, `game_rounds_session_idx`, `game_rounds_family_created_idx`, and `unique (account_id)` on `threshold_profiles`.
    - Enable RLS on all four tables; create `*_family_scope` policies and `kid_streaks_self_or_family`.
    - Add `shelf_frames_family_read` policy on `storage.objects` for the `shelf-frames` bucket.
    - Confirm `'scan_skip_reward'` is already valid in `ledger.kind` (migration 0002) — no new CHECK needed.
    - Migration must be idempotent (`supabase db push` safe to re-run).
    - _Requirements: 1.3, 1.4, 1.5, 2.2, 2.3, 4.6, 8.6, 11.1, 15.2, 15.3_
    - _Design: § 3.4_

  - [ ] 1.2 Append Drizzle schema to `apps/api/src/db/schema.ts`
    - Add four `pgTable` definitions from design § 3.1: `thresholdProfiles`, `gameSessions`, `gameRounds`, `kidStreaks` with matching indexes and `$type` jsonb casts.
    - Re-use existing imports (`uuid`, `text`, `integer`, `numeric`, `jsonb`, `timestamp`, `index`, `uniqueIndex`, `sql`).
    - `pnpm --filter @brainpal/api db:generate` must produce no drift versus `0004_shopping_game.sql`.
    - _Requirements: 1.4, 4.6, 8.6_
    - _Design: § 3.1_

  - [ ] 1.3 Author shared types in `packages/shared/src/shopping-game.ts`
    - Export `TrafficLight`, `ProductCategory`, `ProductCard`, `ProductCardRow`, `ShelfScanResponse`, `RoundOutcome`, `SelectRoundResponse`, `PromptKind` per design § 3.2.
    - Re-export from `packages/shared/src/index.ts` so both `apps/api` and `apps/mobile` can `import type { ProductCard } from '@brainpal/shared'`.
    - Numeric fields typed as `number`; `bbox` is a 4-tuple `[number, number, number, number]`.
    - _Requirements: 13.1, 13.2_
    - _Design: § 3.2_

- [ ] 2. Pure API services (no HTTP or WS coupling)
  - [ ] 2.1 Implement `apps/api/src/services/voice-persona.ts`
    - Export `VOICE_PERSONAS` map from design § 7.2 (sarcastic, cool, wise, hyped, chill, auntie) keyed to `{ elevenVoiceId, tone }`.
    - Export `resolvePersona(voiceId?)` — returns sarcastic persona for unknown/missing ids, falling back to `env.ELEVENLABS_VOICE_ID`.
    - Add six `ELEVENLABS_VOICE_ID_*` env vars to `apps/api/src/env.ts` with defaults pointing at `ELEVENLABS_VOICE_ID`.
    - _Requirements: 5.5, 14.3_
    - _Design: § 7.2, § 8.1_

  - [ ] 2.2 Implement `apps/api/src/services/shelf-scan.ts`
    - Bedrock Nova Lite `Converse` call with `report_shelf` tool spec from design § 5.3, `temperature: 0`, `maxTokens: 1500`.
    - Apply `ProductCardRaw` zod schema (§ 5.5); drop invalid items with `shelf_scan.invalid_card` warn per Req 13.3; never throw on partial failure.
    - Implement `computeTrafficLight`, `scoreCard`, `pickBest` per § 5.4; run prompt-kind decision tree from § 5.1 step 7 (best-of-bad > pop-quiz > best-choice).
    - Pop-quiz: bounded by `1/roundsPlanned`, never fires when `roundsPlanned === 1`, never fires twice in the same session.
    - Log `shelf_scan.invoked` with `{ account_id, family_id, shelf_scan_id, item_count, duration_ms }` via `apps/api/src/logger.ts`; never log raw JPEG bytes (Req 15.5, 15.6).
    - Accept `(jpegBytes, profile, allowed, sessionContext)` — unit-testable without a Hono or WS context.
    - _Requirements: 3.3, 3.4, 4.1–4.6, 6.1–6.3, 7.1, 7.3, 13.1–13.4, 14.4, 15.5, 15.6_
    - _Design: § 5_

  - [ ]* 2.3 Property tests for `shelf-scan.ts`
    - **Property 4:** For random `(card, profile)` tuples, `computeTrafficLight` is `green` iff every metric ≤ threshold AND category is allowed; `yellow` iff worst-overage ≤ 25%; `red` otherwise.
    - **Property 9:** For random `roundsPlanned ∈ [1..5]`, pop-quiz appears at most once per session and never on a 1-round session.
    - Schema-validation: random malformed `ProductCardRaw` inputs are dropped, valid ones pass through.
    - File: `apps/api/src/services/__tests__/shelf-scan.prop.test.ts`. Use `fast-check`.
    - _Requirements: 4.1–4.6, 6.1–6.3, 13.2, 13.3_
    - _Design: § 5, Properties 4 and 9_

  - [ ] 2.4 Implement `apps/api/src/services/round-finalize.ts`
    - `finalizeRound(roundId, selectedCardId, ctx)` — runs the transaction from design § 6.2 with `SELECT … FOR UPDATE` on the round and streak row.
    - Constants: `BASE_CORRECT = 5`, `BASE_INCORRECT = 1`, `HINT_FACTOR = 0.5`, `BEST_OF_BAD_FACTOR = 0.5`, `streakMultiplier()` boundaries from § 6.1.
    - Streak: `correct && !isBestOfBad` → `+1`; `!correct` → `0`; `isBestOfBad` → unchanged.
    - Final award: `Math.max(1, Math.floor(base * multiplier))` — always ≥ 1.
    - Insert `ledger` row `kind = 'scan_skip_reward'` with full metadata: `{ game_session_id, round_id, selected_card_id, best_card_id, outcome, streak_before, streak_after, multiplier, hint_used, prompt_kind }`.
    - `balance_after` lock-and-compute pattern from § 6.3 so ledger agrees with `accounts.cached_balance` trigger.
    - Upsert `kid_streaks` with `longest_streak = greatest(existing, streak_after)`.
    - On last round: flip `game_sessions.status = 'completed'`, set `completed_at`, write `hsg_session_complete` inbox row per parent — all in the same transaction.
    - Call `writeParentInboxEvents` (§ 6.4) to write `pal_feed_hsg_round` rows for every parent in the family.
    - Accept reasoning string as input/callback — keeps function testable in isolation.
    - _Requirements: 5.6, 5.7, 7.4, 7.5, 8.1–8.8, 9.4, 11.1–11.3, 12.3_
    - _Design: § 6_

  - [ ]* 2.5 Property tests for streak and reward math
    - **Property 1:** For random `(streak, isCorrect, hintUsed, isBestOfBad)`, `awarded ≥ 1`.
    - **Property 2:** For a random sequence of `(correct, isBestOfBad)`, running streak matches a reference TS implementation.
    - **Property 3:** `∀ a ≤ b. streakMultiplier(a) ≤ streakMultiplier(b)`; boundary checks at 0, 2, 3, 4, 5, 9, 10, 99.
    - File: `apps/api/src/services/__tests__/streak.prop.test.ts`. Use `fast-check` with `numRuns: 200`.
    - _Requirements: 7.5, 8.1–8.4, 8.8_
    - _Design: § 14.3, Properties 1, 2, 3_

  - [ ] 2.6 Implement `apps/api/src/services/shopping-game-llm.ts`
    - `generateReasoning(round, selected, profile, voicePersona)` and `generateHint(topTwo, voicePersona)`.
    - Re-use existing `llm.ts` OpenAI client; target `gpt-4o-mini`, `response_format: { type: 'json_object' }`, `temperature: 0.6`, `max_tokens: 120`.
    - Apply `VOICE_PERSONAS[voicePersona].tone` into system prompt prefix.
    - Include deterministic `templateReasoning` fallback for every prompt kind (correct, incorrect, best_of_bad, all three pop quizzes) — WS select handler never fails on LLM error.
    - `celebrate` is `true` only when `outcome === 'correct'` AND `prompt_kind !== 'best_of_bad'`.
    - Hint returns `null` on upstream error (WS handler maps to 503 without consuming the hint, Req 9.5).
    - Hint names top-2 cards by `score` only — never `best_card_id`.
    - All output strings ≤ 240 chars.
    - _Requirements: 5.4, 5.5, 5.7, 5.8, 9.3, 9.5_
    - _Design: § 7_

  - [ ]* 2.7 Property tests for reasoning and hint
    - **Property 8:** For random `(selected, best, promptKind)`, `templateReasoning` is non-empty; when `selected.id !== best.id`, string contains a numeric nutrition-delta gap.
    - **Property 10:** For random card lists, hint string never contains `best_card_id`'s name exclusively; must reference top-2 by score.
    - File: `apps/api/src/services/__tests__/shopping-game-llm.prop.test.ts`.
    - _Requirements: 5.6–5.8, 9.2, 9.3_
    - _Design: § 7.4, § 7.5, Properties 8 and 10_

- [ ] 3. Storage and feature flag
  - [ ] 3.1 Storage bucket bootstrap script
    - Create `infra/scripts/create-shelf-frames-bucket.ts` per design § 11.1.
    - Call `supabaseAdmin.storage.createBucket('shelf-frames', { public: false, fileSizeLimit: '4MB', allowedMimeTypes: ['image/jpeg'] })`; idempotent on re-run.
    - Document the one-time `pnpm tsx infra/scripts/create-shelf-frames-bucket.ts` command in `infra/README.md`.
    - _Requirements: 15.1, 15.2_
    - _Design: § 11.1_

  - [ ] 3.2 Feature-flag env and `/me` flag exposure
    - Add `SHOPPING_GAME_ENABLED` to `apps/api/src/env.ts` (default `'false'`).
    - Extend `GET /me` (`apps/api/src/routes/me.ts`) response with `flags.shopping_game: boolean`. Initial logic: `env.SHOPPING_GAME_ENABLED === 'true'`; bucket logic lands in task 12.2.
    - Add the var to `.env.example` with a comment pointing at design § 15.1.
    - _Requirements: 14.1_
    - _Design: § 15.1_

- [ ] 4. WebSocket game loop + HTTP support routes
  - [ ] 4.1 WS module `apps/api/src/ws/shopping-game-perception.ts`
    - New sibling to `perception.ts` — does NOT modify the existing file.
    - Export `newShoppingGameSession(ws)`, `getShoppingGameSession(ws)`, `dropShoppingGameSession(ws)`, `onShoppingGameFrame(ws, jpeg)`, `onShoppingGameMessage(ws, msg)`.
    - Per-connection state: active `GameSession` id, `ThresholdProfile`, `roundIndex`, `popQuizUsed`, multi-card hysteresis map (1 hit to appear, 5 misses to clear).
    - On `shopping-game.session.start` message: validate kid auth, check `revoked` and profile existence (send `hsg_threshold_missing` inbox + error event if missing), insert `game_sessions` row, reply `shopping-game.session.started` with `{ sessionId, prompt, promptKind, roundIndex: 1 }`.
    - On binary `[0x01][JPEG]` frame (when in shopping-game mode): call `shelf-scan` service, run hysteresis, emit `productCard.appeared`, `productCard.updated`, `productCard.cleared` events with `{ cardId, anchor, trafficLight, name, category, nutrition, confidence }`.
    - On `shopping-game.select`: call `round-finalize`, stream reasoning audio via existing `voice.ts` (`speech.started` → binary `[0x02]` chunks → `speech.ended`), reply `shopping-game.round.completed` with `SelectRoundResponse`; then emit `shopping-game.round.next` or `shopping-game.session.completed`.
    - On `shopping-game.hint`: call `generateHint`; enforce one hint per round; reply `shopping-game.hint.result` or `shopping-game.hint.unavailable`.
    - On `shopping-game.card.correct`: implement remove/rename per Req 10.3/10.4; recompute `best_card_id`; reply `shopping-game.cards.updated`; return `shopping-game.too_few_cards` when < 2 remain.
    - On session abandon (app backgrounded > 10 min): flip `game_sessions.status = 'abandoned'` and reply `shopping-game.session.abandoned`.
    - _Requirements: 1.8, 1.9, 2.3–2.6, 3.1–3.9, 5.1–5.8, 6.1–6.3, 7.1–7.5, 8.1–8.8, 9.1–9.5, 10.1–10.5, 11.1–11.2, 13.1–13.4, 14.2–14.4_
    - _Design: § 5, § 5.1, § 5.2_

  - [ ] 4.2 Wire WS module into `apps/api/src/ws/handler.ts`
    - Add `mode=shopping-game` branch in `onConnect`: call `newShoppingGameSession(ws)`, send `shopping-game.ready`.
    - In `onMessage` binary path: check `getShoppingGameSession(ws)` first; if present, route to `onShoppingGameFrame`; otherwise fall through to existing `onFrame`.
    - In `onMessage` JSON path: route `msg.type.startsWith('shopping-game.')` to `onShoppingGameMessage`; existing `interrupt` / `session.end` dispatch unchanged.
    - In `onClose`: call `dropShoppingGameSession(ws)` then existing `dropSession(ws)`.
    - Existing single-product camera flow (`camera.tsx` without `mode=shopping-game`) is completely unaffected.
    - `pnpm --filter @brainpal/api typecheck` must pass.
    - _Requirements: 3.1, 3.2_
    - _Design: § 5.1_

  - [ ] 4.3 HTTP route module skeleton, zod schemas, flag guard
    - Create `apps/api/src/routes/shopping-game.ts` (Hono router) and `apps/api/src/routes/shopping-game.schemas.ts`.
    - HTTP surface (parent setup + history + thumbnail upload + speak proxy only — game loop is WS):
      - `POST /shopping-game/threshold-profiles`
      - `GET  /shopping-game/threshold-profiles/:kidId`
      - `GET  /shopping-game/sessions/:id`
      - `GET  /shopping-game/sessions?kidId=…`
      - `PUT  /shopping-game/rounds/:id/thumbnail`
      - `POST /shopping-game/speak`
    - Add `SHOPPING_GAME_ENABLED` middleware: returns 503 `feature_disabled` when flag is off.
    - Add `requireFamilyMembership(kidId)` helper asserting caller shares `family_id` with kid via `memberships`.
    - All endpoints require existing `requireAuth` middleware.
    - _Requirements: 14.1, 15.3_
    - _Design: § 4, § 4.1, § 15.1_

  - [ ] 4.4 Threshold-profile routes — `POST` and `GET`
    - `POST /shopping-game/threshold-profiles` (parent only): clamp values to Req 1.3 ranges server-side; upsert on `account_id`; return `{ profile, updated_at, clamped? }`.
    - `GET /shopping-game/threshold-profiles/:kidId` (parent or kid-self): return `{ profile }` or `{ profile: null }` — never 404 on missing.
    - Persist `set_by_account_id` from caller's auth. Toggling `revoked` writes the same row, never deletes.
    - _Requirements: 1.1–1.5, 1.7, 15.4_
    - _Design: § 4.1_

  - [ ] 4.5 Session and round history routes — `GET` only
    - `GET /shopping-game/sessions/:id` (parent or kid-self): full session detail with rounds, signed `shelf_frame_url` (TTL ≤ 30 days), full `product_cards`, selection, reasoning per Req 11.4.
    - `GET /shopping-game/sessions?kidId=…` (parent only): reverse-chronological list, default page 20, max 50.
    - _Requirements: 11.3–11.5, 15.3_
    - _Design: § 4.1_

  - [ ] 4.6 Thumbnail upload route — `PUT /shopping-game/rounds/:id/thumbnail`
    - Multipart JPEG ≤ 1 MB; upload to `shelf-frames/family/<fid>/round/<rid>.jpg`.
    - Validate `game_rounds.outcome` is non-null before accepting (kid cannot exfiltrate mid-game frames).
    - Return `{ shelf_frame_url, shelf_frame_key }`.
    - Return 409 `already_uploaded` if `shelf_frame_key` already set; 410 `round_not_finalized` if outcome is null; 413 `file_too_large` if > 1 MB.
    - _Requirements: 11.4, 15.1, 15.2_
    - _Design: § 4.1_

  - [ ] 4.7 Speak route — `POST /shopping-game/speak`
    - Accept `{ text, voiceId }`, resolve persona via `resolvePersona`, proxy ElevenLabs Flash v2.5 (`model_id=eleven_flash_v2_5`, `output_format=mp3_44100_128`), return `audio/mpeg`.
    - Hard-cap `text.length ≤ 500`; return 400 `invalid_input` otherwise.
    - Return 503 `tts_failed` on upstream error. Never leak ElevenLabs API key in logs or error bodies.
    - Used by parent history replays only — live in-game audio plays over WS.
    - _Requirements: 5.5, 14.3_
    - _Design: § 8.1_

  - [ ] 4.8 Mount the router in `apps/api/src/routes/index.ts`
    - Import `shoppingGame` from `./shopping-game` and register with `routes.route('/', shoppingGame)`.
    - `pnpm --filter @brainpal/api typecheck` must pass.
    - `curl /shopping-game/sessions/<bogus-id>` returns 401 (no auth) or 503 (flag off).
    - _Requirements: 14.1_
    - _Design: § 4_

  - [ ]* 4.9 Integration tests for routes and WS handler
    - **Property 5:** `Promise.all([select, select])` on same round id → exactly one ledger row; one 200, one 409.
    - **Property 6:** For every code path (correct, incorrect, hint+correct, best-of-bad, last-round), `ledger.metadata` contains all ten required keys.
    - **Property 8 follow-up:** `outcome === 'correct'` iff `selected_card_id === best_card_id`.
    - Cover seven scenarios from design § 14.2: correct, incorrect, best-of-bad correct, hint+correct, threshold-missing race, double-tap concurrency, session complete (parent inbox written, `game_sessions.status = 'completed'`).
    - File: `apps/api/src/routes/__tests__/shopping-game.int.test.ts`. Stub Bedrock + OpenAI + ElevenLabs at service boundary; use env-gated Supabase test instance.
    - _Requirements: 5.2, 5.6, 5.7, 7.4, 7.5, 8.1–8.8, 9.4, 11.3, 13.4_
    - _Design: § 14.2, Properties 5, 6, 8_

- [ ] 5. Checkpoint — API end-to-end smoke
  - With `SHOPPING_GAME_ENABLED=true`, run the full happy path against a real Supabase + Bedrock + OpenAI + ElevenLabs sandbox:
    - Parent sets threshold profile via `POST /shopping-game/threshold-profiles`
    - Kid connects WS with `?mode=shopping-game`, sends `shopping-game.session.start`
    - Kid streams JPEG frames, receives `productCard.appeared` events
    - Kid sends `shopping-game.select`, receives `shopping-game.round.completed` + audio
    - Parent inbox row appears within 1 s (Supabase Realtime)
  - All unit and property tests from tasks 2 and 4 pass.

- [ ] 6. Mobile foundation
  - [ ] 6.1 New Zustand store `apps/mobile/stores/shoppingGame.ts`
    - Implement `ShoppingGameState` shape and reducers from design § 10.1: `setSession`, `startRound`, `setCapturedFrame`, `applyShelfScan`, `setSelected`, `markHint`, `applySelectResponse`, `removeCard`, `reset`.
    - All reducers are no-ops when `current === null` (never throw).
    - Export `useActiveRound` selector for screens.
    - Types compile against `@brainpal/shared`.
    - _Requirements: 2.4, 3.5, 5.1–5.3, 9.1_
    - _Design: § 10_

  - [ ] 6.2 API + WS client wrappers in `apps/mobile/lib/api/shopping-game.ts`
    - HTTP wrappers: `createThresholdProfile`, `getThresholdProfile`, `getSession`, `listSessions`, `uploadThumbnail`, `speak`.
    - WS helpers: typed send functions for `shopping-game.session.start`, `shopping-game.select`, `shopping-game.hint`, `shopping-game.card.correct` — connect to `/live?mode=shopping-game` via existing `apps/mobile/lib/ws.ts`.
    - Use existing JWT helper from `apps/mobile/stores/auth.ts`. Multipart upload uses `FormData` with `frame: File`.
    - Map error codes to typed classes: `HsgThresholdMissing`, `HsgRevoked`, `TooFewCards`, `VisionFailed`, `HintUnavailable`, `AlreadySelected`, `FeatureDisabled`.
    - `speak` returns `ArrayBuffer` ready for `expo-file-system` write.
    - All return shapes typed via `@brainpal/shared`.
    - _Requirements: 3.2, 3.6, 3.8, 5.4, 9.3_
    - _Design: § 4, § 5.2, § 8.2_

  - [ ] 6.3 Feature-flag hook `apps/mobile/hooks/useShoppingGameFlag.ts`
    - Read `flags.shopping_game` from cached `/me` response (existing `useFamily` / `useAuth` query).
    - Return `{ enabled, loading }`; non-blocking (`{ enabled: false, loading: true }` while `/me` is in flight).
    - Re-renders on `/me` cache update.
    - _Requirements: 14.1_
    - _Design: § 15.1_

- [ ] 7. Parent UI
  - [ ] 7.1 Parent threshold-settings screen
    - Path: `apps/mobile/app/(app)/parent/shopping-game-settings/[kidId].tsx`
    - Four numeric sliders (sugar, protein, calories, carbs) pre-populated from `getThresholdProfile`; fall back to age-band defaults when no profile (Req 1.2).
    - 10-category multi-select chips for `allowed_categories`; rounds-per-session stepper (1–5); voice-commands switch; log-to-journal switch; pause/resume toggle for `revoked`.
    - Save on confirm via `createThresholdProfile`; show inline validation message naming field and range when server returns a clamped value (Req 1.7).
    - Persistence completes within 500 ms server-side (Req 1.4). Identical layout on iOS and Android.
    - _Requirements: 1.1–1.5, 1.7, 2.2, 12.3, 14.1, 15.4_
    - _Design: § 9_

  - [ ] 7.2 Parent history-list screen
    - Path: `apps/mobile/app/(app)/parent/shopping-game-history/[kidId].tsx`
    - Reverse-chronological session list via `listSessions`; row shows date, rounds played, brains earned, ending streak.
    - Pull-to-refresh; empty state "no rounds played yet". Tap navigates to task 7.3.
    - _Requirements: 11.4, 11.5_
    - _Design: § 9_

  - [ ] 7.3 Parent session-detail screen
    - Path: `apps/mobile/app/(app)/parent/shopping-game-history/session-[sessionId].tsx`
    - Per round: signed-URL frame thumbnail via `expo-image` (caches within TTL), product cards with names + traffic light, kid's selection, best card, reasoning text.
    - Outcome chip per round (correct / incorrect / errored). Never log raw image bytes (Req 15.6).
    - _Requirements: 11.4, 11.5, 15.2, 15.3_
    - _Design: § 9, § 11_

  - [ ]* 7.4 Component test for parent threshold-settings clamping
    - Jest + RNTL: mount `shopping-game-settings/[kidId].tsx` against mocked API client.
    - Submitting `sugar_g: 999` triggers inline validation message naming `sugar_g` and `0–50` range.
    - Toggling `revoked` immediately calls `createThresholdProfile` with `revoked: true`.
    - File: `apps/mobile/app/(app)/parent/shopping-game-settings/__tests__/clamp.test.tsx`
    - _Requirements: 1.7, 15.4_
    - _Design: § 9_

- [ ] 8. Kid UI
  - [ ] 8.1 Kid start screen
    - Path: `apps/mobile/app/(app)/kid/shopping-game/start.tsx`
    - Streak header (`🔥 N-day streak`), round count badge, big "Start" CTA, sub-text "X rounds today".
    - On tap: connect WS `?mode=shopping-game`, send `shopping-game.session.start`.
    - Handle `hsg_threshold_missing` WS error → toast + navigate to kid home (Req 1.9 copy).
    - Handle `hsg_revoked` WS error → toast "your parent has paused this game" + navigate to kid home (Req 15.4).
    - On `shopping-game.session.started`, transition to round screen with `sessionId`.
    - _Requirements: 1.8, 1.9, 2.1–2.4, 15.4_
    - _Design: § 9_

  - [ ] 8.2 Kid round screen — live camera, productCard bubbles, hint, correction
    - Path: `apps/mobile/app/(app)/kid/shopping-game/round.tsx`
    - State machine per design § 9.1: `camera_idle → streaming → choice → revealing` plus correction modal.
    - Open WS `?mode=shopping-game` (reuse connection from start screen); stream JPEG frames at ~700 ms intervals via binary `[0x01]` tag.
    - Render `ProductCard` overlay bubbles positioned by `bbox` over live preview; color border by `trafficLight`; dashed border when `confidence < 0.6` (Req 10.1).
    - On `productCard.appeared/updated/cleared` WS events: add/move/fade bubbles in real time.
    - Choice prompt: single-selection invariant (Req 5.2) — tapping a second card replaces the first.
    - Show pop-quiz copy when `prompt_kind` is `pop_quiz_*`; show "every option here is junk, which is the least bad and why" when `prompt_kind === 'best_of_bad'`.
    - "Ask PAL" button: send `shopping-game.hint`; disable after one use per round (Req 9.2).
    - Long-press card: open correction modal with remove / rename / keep; send `shopping-game.card.correct`.
    - On `shopping-game.too_few_cards` or < 2 cards: show recapture banner, do NOT consume the round.
    - On WS disconnect or vision failure: show "scan paused, reconnecting" indicator; auto-reconnect; do NOT consume the round (Req 3.9).
    - Footer label: "this is a game, you are not actually buying" (Req 12.4).
    - First productCard bubble within 2000 ms of camera ready on 4G (Req 14.2).
    - Reuse `expo-camera` patterns from `camera.tsx`; downsize JPEG to 1024 px max edge via `expo-image-manipulator` before sending.
    - _Requirements: 3.1–3.9, 4.1, 5.1–5.3, 6.1–6.2, 7.1–7.2, 9.1–9.3, 9.5, 10.1–10.5, 12.4, 14.1–14.2_
    - _Design: § 9, § 9.1, § 12_

  - [ ] 8.3 Kid round-summary screen with audio playback
    - Path: `apps/mobile/app/(app)/kid/shopping-game/round-summary.tsx`
    - Render `SelectRoundResponse` from `shopping-game.round.completed` WS event: outcome banner, Brains delta with multiplier badge, reasoning text, best-card highlight, balance after.
    - Reasoning text appears immediately on event receipt — do not block on audio.
    - Auto-play reasoning audio in parallel: fetch `POST /shopping-game/speak`, write to `expo-file-system` cache, play via `expo-audio`. First audio frame within 800 ms of text appearing on stable network (Req 14.3).
    - "Next round" button when more rounds remain; "See summary" when last round.
    - _Requirements: 5.4–5.7, 8.5, 8.7, 14.2–14.3_
    - _Design: § 8.2, § 9_

  - [ ] 8.4 Kid session-summary screen
    - Path: `apps/mobile/app/(app)/kid/shopping-game/session-summary.tsx`
    - Total Brains for session, ending streak, per-round chips with traffic light + outcome.
    - On CTA: call `useShoppingGameStore.reset()`, close WS, navigate to kid home.
    - On resume after > 10 min in background mid-session: send `shopping-game.session.abandon` WS message, show "let's start fresh" copy (Req 2.6).
    - _Requirements: 2.5, 2.6, 8.7_
    - _Design: § 9_

  - [ ]* 8.5 Component smoke test for kid round-screen state machine
    - Jest + RNTL: drive `round.tsx` through `idle → streaming → choice → revealing` against mocked WS and API client.
    - Hint button disables after one use; correction-modal "remove" path re-renders without consuming the round; < 2 cards triggers recapture banner.
    - File: `apps/mobile/app/(app)/kid/shopping-game/__tests__/round.test.tsx`
    - _Requirements: 3.1, 3.2, 5.1, 9.2, 10.2, 10.5_
    - _Design: § 9.1_

- [ ] 9. Mobile integration
  - [ ] 9.1 Kid home tile
    - Add "Healthy Shopping Game" tile to `apps/mobile/app/(app)/kid/index.tsx`.
    - Gate on `useShoppingGameFlag().enabled` (hidden when `false`).
    - Show streak count beside title when streak ≥ 1.
    - Show disabled copy "your parent has paused this game" when `threshold_profiles.revoked = 1` (Req 15.4).
    - _Requirements: 2.1, 14.1, 15.4_
    - _Design: § 9_

  - [ ] 9.2 Parent kid-detail card
    - Add "Healthy Shopping Game" card to `apps/mobile/app/(app)/parent/kid-detail.tsx` linking to settings (task 7.1) and history (task 7.2).
    - Render only when `useShoppingGameFlag().enabled === true`.
    - Both links navigate with kid's `accountId` as path param.
    - _Requirements: 11.4_
    - _Design: § 9_

  - [ ] 9.3 Deep linking and nav guards
    - Register `shopping-game/*` routes in `expo-router`'s typed routes; update `apps/mobile/app/(app)/_layout.tsx` if needed.
    - Nav guards: kid cannot navigate to parent screens; non-kid cannot navigate to round screens.
    - Deep link `brainpal://kid/shopping-game/start` opens start screen for authed kid; bounces parent to parent home.
    - _Requirements: 14.1, 15.3_
    - _Design: § 9_

- [ ] 10. Checkpoint — full mobile flow
  - On both iOS and Android simulators, complete a 3-round session end-to-end against deployed staging API:
    - Parent sets profile → kid plays three rounds via WS → parent sees PAL feed entries within 1 s → parent views session in history with thumbnails.
  - All tests from tasks 6, 7, 8 pass.

- [ ] 11. Privacy and retention
  - [ ] 11.1 Shelf-frame TTL cleanup cron
    - **Property 7: Shelf frames are scoped, signed, and expire**
    - Use `pg_cron` (already provisioned) to schedule a daily SQL block selecting `shelf_frame_key` where `created_at < now() - interval '30 days'`.
    - Call `supabaseAdmin.storage.from('shelf-frames').remove(keys)` from a server-side script triggered by `pg_cron` via the `http` extension (or a dedicated Edge Function).
    - Set `game_rounds.shelf_frame_url = ''` for purged rows so signed URLs cannot be regenerated.
    - Cron is idempotent — second run on the same day is a no-op.
    - Verification: insert a `game_rounds` row with `created_at = now() - interval '31 days'` and confirm one cron run removes its Storage object.
    - _Requirements: 15.1–15.3_
    - _Design: § 11, § 16.1_

- [ ] 12. Rollout
  - [ ] 12.1 Env vars on Fargate
    - Add `SHOPPING_GAME_ENABLED`, `SHOPPING_GAME_PHASE_PERCENT`, `SHOPPING_GAME_ALLOWLIST`, and the six `ELEVENLABS_VOICE_ID_*` persona vars to `infra/ecs-task-definition.json` and to the GitHub Actions secrets list in `.github/workflows/deploy-api.yml`.
    - Initial production values: `SHOPPING_GAME_ENABLED=false`, `SHOPPING_GAME_PHASE_PERCENT=0`, allowlist empty.
    - After next push to `main`: `/me` returns `flags.shopping_game = false` for everyone; every `/shopping-game/*` route returns 503 `feature_disabled`.
    - _Requirements: 14.1_
    - _Design: § 15.1, § 15.2_

  - [ ] 12.2 10% family bucket logic in `/me`
    - Replace simple env-only check from task 3.2 in `apps/api/src/routes/me.ts` with:
      `enabled = SHOPPING_GAME_ENABLED === 'true' && (allowList.includes(account_id) || bucket(family_id) < phasePercent)`
    - `bucket(family_id) = parseInt(sha256(family_id).slice(0,4), 16) % 100` — stable across requests.
    - Read `SHOPPING_GAME_PHASE_PERCENT` (default `0`) and `SHOPPING_GAME_ALLOWLIST` (comma-separated `account_id`s) from `apps/api/src/env.ts`.
    - Allow-list overrides bucket regardless of `SHOPPING_GAME_PHASE_PERCENT`.
    - Toggling `SHOPPING_GAME_ENABLED=false` disables for everyone instantly.
    - _Requirements: 14.1_
    - _Design: § 15.2_

  - [ ] 12.3 Phased rollout playbook
    - Add `docs/hsg-rollout.md` documenting three phases from design § 15.2: internal allow-list → 10% → 100%.
    - Include rollback procedure (flip `SHOPPING_GAME_ENABLED=false`) and smoke checks at each phase.
    - Link from `docs/p0-spec.md` § 5.4 and `infra/README.md`.
    - _Design: § 15.2_

- [ ] 13. Final checkpoint — production-like dry run
  - On staging Fargate with `SHOPPING_GAME_ENABLED=true` and `SHOPPING_GAME_PHASE_PERCENT=100`, complete a full session from a real iOS device and a real Android device.
  - Confirm parent inbox + history populate correctly; shelf-frame URLs resolve from a parent device on the same family.
  - All CI tests pass.

---

## Notes

- Tasks marked `*` are optional test sub-tasks encoding the ten correctness properties from `design.md`. Strongly recommended before 10% rollout.
- Every task references specific requirement IDs and a design section — use as the diff-review checklist.
- API tasks: deploy is automatic on push to `main` via `.github/workflows/deploy-api.yml`. Run `pnpm --filter @brainpal/api typecheck` before pushing; never push schema changes without the matching migration in the same PR.
- Mobile tasks: every visual change must be exercised on both iOS and Android before marking done. Camera and audio behave differently across platforms.
- **WS vs HTTP split:** Session start, frame streaming, productCard events, card selection, hints, and corrections are all WS (`/live?mode=shopping-game`). HTTP handles only: threshold-profile CRUD, session/round history reads, thumbnail upload, and speak proxy.
- Property test mapping:
  - Properties 1, 2, 3 → task 2.5 (streak/reward math)
  - Properties 4, 9 → task 2.3 (shelf-scan: traffic light, scoring, prompt-kind)
  - Properties 5, 6, 8 → task 4.9 (route + WS integration: round finalization)
  - Property 7 → task 11.1 (shelf-frame cleanup cron)
  - Properties 8 (templated reasoning), 10 → task 2.7 (reasoning + hint privacy)

## Task Dependency Graph

Waves respect two constraints: (1) every task executes only after its hard dependencies finish, (2) tasks writing to the same file are in different waves. Routes 4.3–4.7 all extend `shopping-game.ts`, so they serialize across waves 3–7.

```json
{
  "waves": [
    { "id": 0,  "tasks": ["1.1", "1.3", "3.1", "3.2"] },
    { "id": 1,  "tasks": ["1.2", "4.1", "4.2", "6.1", "6.3", "11.1", "12.2"] },
    { "id": 2,  "tasks": ["2.1", "2.2", "6.2"] },
    { "id": 3,  "tasks": ["2.3", "2.6", "4.3"] },
    { "id": 4,  "tasks": ["2.4", "2.7", "4.4"] },
    { "id": 5,  "tasks": ["2.5", "4.5"] },
    { "id": 6,  "tasks": ["4.6"] },
    { "id": 7,  "tasks": ["4.7"] },
    { "id": 8,  "tasks": ["4.8", "7.1", "7.2", "8.1"] },
    { "id": 9,  "tasks": ["4.9", "7.3", "7.4", "8.2", "9.2"] },
    { "id": 10, "tasks": ["8.3", "8.5", "9.1"] },
    { "id": 11, "tasks": ["8.4", "12.1"] },
    { "id": 12, "tasks": ["9.3"] },
    { "id": 13, "tasks": ["12.3"] }
  ]
}
```
