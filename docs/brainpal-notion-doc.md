# BrainPal — Complete Product & Engineering Documentation

> Last updated: May 2026. This document covers everything built so far — architecture, features, screens, APIs, data model, and the agent-centric roadmap. Intended as the single source of truth for the Notion workspace.

---

## Table of Contents

1. [What BrainPal Is](#1-what-brainpal-is)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Data Model](#4-data-model)
5. [Auth Flow](#5-auth-flow)
6. [Onboarding Flow](#6-onboarding-flow)
7. [Parent Features](#7-parent-features)
8. [Kid Features](#8-kid-features)
9. [Camera & HealthPAL](#9-camera--healthpal)
10. [PAL Chat (AI Agent)](#10-pal-chat-ai-agent)
11. [Chores System](#11-chores-system)
12. [Payments & Wallet](#12-payments--wallet)
13. [Family & Invite System](#13-family--invite-system)
14. [Voice Layer](#14-voice-layer)
15. [Agent Architecture (Roadmap)](#15-agent-architecture-roadmap)
16. [Known Edge Cases Fixed](#16-known-edge-cases-fixed)
17. [Environment Variables](#17-environment-variables)

---

## 1. What BrainPal Is

BrainPal is a family money app for kids aged 8–17. It teaches financial literacy and healthy food choices through a gamified AI experience.

**Core loop:**
- Parent sets up a family, adds kids, tops up their balance in AUD
- Kid scans products with the camera — PAL (the AI) gives a verdict with a health score and Brain Points delta
- Kid earns Brain Points by making good choices (skipping junk, completing chores)
- Brain Points map to real AUD (1 Brain Point = 1 cent)
- Kid saves toward goals (AirPods, games, sneakers)
- Parent watches the PAL feed in real time and manages chores/top-ups

**Currency:** AUD is the real currency. Brain Points are the gamified layer on top (1 pt = 1 cent). Both are stored as integers in cents/points in the same `cached_balance` column.

**Two user types:**
- **Parent** — manages family, tops up kids, creates chores, approves chore completions
- **Kid** — scans products, earns/spends Brain Points, completes chores, saves toward goals

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native + Expo (SDK 52), Expo Router v3 |
| State | Zustand (auth store, family store, cart store) |
| Server state | TanStack Query v5 |
| API | Hono on Node.js, deployed on Railway |
| Database | PostgreSQL via Supabase (schema managed with Drizzle ORM) |
| Auth | Custom OTP flow — Twilio Verify for SMS, BrainPal-issued HS256 JWT |
| AI / LLM | OpenAI GPT-4o-mini (chat, intent parsing), GPT-4o Vision (chore verification) |
| Voice TTS | OpenAI TTS-1 (nova voice) for onboarding, ElevenLabs for PAL reactions |
| Voice realtime | OpenAI Realtime API (gpt-4o-realtime-preview) via WebSocket |
| Camera | expo-camera, expo-image-manipulator, custom WebSocket frame streaming |
| Payments | Stripe (Apple Pay via PlatformPayButton), demo mode fallback |
| Push | Expo Push Notifications |
| Monorepo | Turborepo |

---

## 3. Repository Structure

```
brainpal/
├── apps/
│   ├── api/                    # Hono API server
│   │   └── src/
│   │       ├── db/             # Drizzle schema + migrations
│   │       ├── middleware/     # JWT auth middleware
│   │       ├── routes/         # All HTTP routes
│   │       ├── services/       # LLM, Stripe, Twilio, ElevenLabs, etc.
│   │       └── ws/             # WebSocket handlers (camera, voice)
│   └── mobile/                 # Expo React Native app
│       ├── app/
│       │   ├── (auth)/         # Onboarding screens
│       │   └── (app)/          # Main app screens
│       │       ├── parent/     # Parent tab screens
│       │       └── kid/        # Kid tab screens
│       ├── components/         # Shared UI components
│       ├── hooks/              # TanStack Query hooks
│       ├── lib/                # API client, WebSocket, env
│       ├── stores/             # Zustand stores
│       └── theme/              # Design tokens
├── supabase/migrations/        # SQL migration files
└── docs/                       # Documentation
```

---

## 4. Data Model

All tables live in Supabase PostgreSQL. Drizzle ORM is the query layer.

### accounts
The core user table. One row per phone number.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Matches Supabase auth.users.id |
| phone | text unique | E.164 format |
| account_type | text | `'parent'` \| `'kid'` \| `'extended'` \| null (null = not onboarded) |
| persona | jsonb | Freeform — name, avatar, color, age, voiceId, style, learned_traits, etc. |
| cached_balance | int | Denormalised from ledger. In cents/Brain Points. |
| push_token | text | Expo push token |
| created_at | timestamptz | |
| last_seen_at | timestamptz | |

**Persona JSONB shape — Parent:**
```json
{
  "name": "Sarah",
  "avatar": "👩‍🦰",
  "style": "balanced",
  "money_upbringing": "open",
  "parenting_style": "guided",
  "kid_situation": "two",
  "primary_goal": "save"
}
```

**Persona JSONB shape — Kid:**
```json
{
  "name": "Jamie",
  "age": 12,
  "color": "#A855F7",
  "avatar": "🧒",
  "voiceId": "sarcastic",
  "spend_style": "impulse",
  "streak": 4
}
```

### families
One row per household.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Smith Family" |
| avatar | text | Emoji |
| created_at | timestamptz | |

### memberships
Links accounts to families with a role.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid FK → families | |
| account_id | uuid FK → accounts | |
| role | text | `'primary_parent'` \| `'co_parent'` \| `'guardian'` \| `'kid'` |
| joined_at | timestamptz | |

Unique constraint on (family_id, account_id).

### ledger
Every Brains movement. Single source of truth for balances.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid FK | |
| account_id | uuid FK | Whose balance this affects |
| actor_id | uuid FK | Who triggered it |
| kind | text | See kinds below |
| brains_delta | int | Positive = credit, negative = debit |
| balance_after | int | Snapshot at this moment |
| metadata | jsonb | item_name, pal_quote, choreTitle, note, etc. |
| created_at | timestamptz | |

**Ledger kinds:** `topup`, `scan_skip_reward`, `purchase`, `goal_lock`, `goal_unlock`, `streak_bonus`, `adjustment`, `cart_checkout`, `chore_payout`

### goals
Kid savings targets.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid FK | |
| account_id | uuid FK | null = family goal |
| name | text | |
| target_brains | int | |
| current_brains | int | Denormalised |
| emoji | text | |
| status | text | `'active'` \| `'completed'` \| `'abandoned'` |

### cart_items
Ephemeral — expires after 24h.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | uuid FK | The kid's cart |
| detection_id | text | Ref to original scan |
| item_name | text | |
| item_emoji | text | |
| brains_delta | int | |
| pal_quote | text | |
| metadata | jsonb | |
| expires_at | timestamptz | now() + 24h |

### invites
Used for both old invite-code flow AND the new join-request flow.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid FK | |
| invited_by | uuid FK | Parent account |
| code | text unique | `JR` prefix for join requests |
| token | text | JWT for invite-code flow |
| expected_role | text | `'kid'` \| `'co_parent'` \| `'guardian'` |
| kid_seed | jsonb | Pre-filled persona data from parent |
| initial_topup | int | Brains to credit on accept |
| recipient_phone | text | For join-request flow |
| expires_at | timestamptz | 30 days for join requests |
| status | text | `'pending'` \| `'accepted'` \| `'revoked'` |

### chores

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid FK | |
| assigned_to | uuid FK | Kid account |
| created_by | uuid FK | Parent account |
| title | text | |
| reward_brains | int | |
| status | text | See status flow below |
| verification_photo | text | Storage URL |
| ai_verdict | text | `'approved'` \| `'rejected'` \| `'uncertain'` |
| ai_reason | text | Max 15 words |
| parent_note | text | Rejection reason |

**Chore status flow:** `pending` → `submitted` → `ai_approved` / `ai_rejected` / `ai_uncertain` → `parent_approved` / `parent_rejected` → `paid`

### chat_messages

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | uuid FK | |
| role | text | `'user'` \| `'assistant'` \| `'system'` |
| content | text | |
| created_at | timestamptz | |

---

## 5. Auth Flow

BrainPal owns auth end-to-end. No Supabase Auth dependency.

```
POST /auth/otp/start  { phone }        → Twilio Verify sends SMS
POST /auth/otp/check  { phone, code }  → BrainPal HS256 JWT returned
POST /auth/logout                      → 204 (client clears SecureStore)
```

**JWT:** HS256, signed with `JWT_SECRET` env var. Payload: `{ accountId, phone, iat, exp }`. Stored in `expo-secure-store` as `brainpal.auth.token`.

**Post-OTP routing logic (otp.tsx):**
1. `hasPendingInvite` (join request waiting) → `/(auth)/join-request`
2. `onboardingComplete` (accountType set + persona has name) → `/` → app
3. `accountType === 'kid'` but no persona name → `/(auth)/kid-persona` (resume)
4. `accountType === 'parent'` but no persona name → `/(auth)/parent-onboarding` (resume)
5. No accountType → `/(auth)/role-select` (new user)

**`onboardingComplete` definition:** `accountType !== null && persona.name !== null && persona.name.length > 0`

This is computed in `stores/auth.ts` and persisted in SecureStore via the cached account JSON.

---

## 6. Onboarding Flow

### Parent onboarding

**Primary path (web):** `/(auth)/parent-onboarding` — PAL-voiced chat interface. 5 questions:
1. Name / preferred title → `persona.name`
2. Money upbringing (open / private / mixed) → `persona.money_upbringing`
3. Parenting instinct (autonomous / guided / structured) → `persona.parenting_style` + `persona.style`
4. Kid situation (one young / one teen / two / three+ / mixed) → `persona.kid_situation`
5. Primary goal (impulse / save / food / understand / responsible / all) → `persona.primary_goal`

**Primary path (native):** `/(auth)/voice-onboard` — OpenAI Realtime WebSocket voice mode. Animated orb UI. Falls back to `parent-onboarding` if mic permission denied or on web.

**Fallback path:** `/(auth)/parent-persona` — same 5 questions as a SlidingWizard (no voice).

All paths call `PATCH /me` with `{ accountType: 'parent', persona: {...} }`.

### Kid onboarding

Kids always come in via a join request (parent enters their phone in add-kid screen). After accepting:

`/(auth)/kid-persona` — 7-slide SlidingWizard:
1. Confirm name (pre-filled from kidSeed, editable)
2. Age (8–17 picker)
3. Accent color (8 vibrant hues)
4. Avatar (emoji grid)
5. PAL voice (6 characters: Sarcastic Robot, Cool Friend, Wise Wizard, Hype Coach, Deadpan Detective, Chaos Gremlin)
6. Spend style (impulse / thinker / saver / moody) → `persona.spend_style`
7. First goal (optional, skippable)

Calls `PATCH /me` with `{ accountType: 'kid', persona: {...} }` and optionally `POST /goals`.

### Onboarding guard

Every onboarding screen has a `useEffect` guard: if `onboardingComplete === true`, immediately redirect to the app. The `AuthGate` in `_layout.tsx` also enforces this globally, with exceptions for: `invite-accept`, `kid-persona`, `parent-onboarding`, `parent-persona`, `voice-onboard`.

---

## 7. Parent Features

### Home screen (`/(app)/parent/index.tsx`)
- Gradient family hero card showing total family AUD balance
- Kid cards with per-kid AUD balance + Brain Points, accent color, today's event count
- Action row: Top Up, Chores, PAL, Add Kid
- PAL insight card (dynamic one-liner based on family state)
- Co-parents section (if multiple parents)
- Empty state with "Set up family" CTA if no family yet

### Top-up (`/(app)/parent/topup.tsx`)
4-step wizard:
1. Pick kid (auto-skipped if only one kid)
2. Amount — big AUD display, Brain Points preview, quick chips ($5/$10/$20/$50/$100), custom input
3. Note — preset chips (Just because, Chores, Homework, Birthday, Good behaviour) + custom text
4. Confirm & Pay — summary card, Apple Pay (PlatformPayButton) or demo mode fallback

On success: confetti animation, balance updated via TanStack Query invalidation.

**API:** `POST /payments/topup-intent` → Stripe PaymentIntent → Apple Pay confirmation. Demo fallback: `POST /wallet/topup`.

### Chores (`/(app)/parent/chores.tsx`)
- Three sections: Needs Your Approval, Waiting for Kid, Recently Done
- Add chore bottom sheet:
  - Title input
  - Assign to (kid picker, horizontal scroll)
  - Reward Brain Points (chips: 10/20/30/50/100/200)
  - **Bonus Reward** (optional real-world reward: preset chips + custom text field) → stored in `chore.metadata.rewardNote`
- Approve & Pay button triggers ledger write + push notification to kid
- Reject with optional note
- AI verdict badge (AI verified / AI rejected / Pending review)

### Add Kid (`/(app)/parent/add-kid.tsx`)
- Enter kid's phone number (country picker: AU/US/UK/IN/NZ)
- Optional kid name
- Starting Brains (None / 50 / 100 / 200 / 500)
- Sends `POST /join-requests` — no SMS, no invite codes
- Kid sees the request when they sign in

### Kid Detail (`/(app)/parent/kid-detail.tsx`)
- Per-kid view: balance, streak, active goal progress
- PAL feed for that kid
- Top Up shortcut
- Chores for that kid

### PAL Chat (`/(app)/parent/chat.tsx`)
Same component as kid chat, `role="parent"`. See Section 10.

---

## 8. Kid Features

### Home screen (`/(app)/kid/index.tsx`)
- Streak chip (flame icon + day count)
- Cart icon with badge count
- Greeting with kid's name
- Hero balance card (glassmorphism):
  - AUD balance as primary (large, accent-colored)
  - Brain Points as secondary reward layer
- Action row: Scan, Goals, PAL, Cart
- Chores tile (shortcut to chores screen)
- Streak card (if streak > 0)
- Today's activity feed (last 5 events, grouped by kind with icons)

### Camera / Scan — see Section 9

### PAL Chat (`/(app)/kid/chat.tsx`) — see Section 10

### Chores (`/(app)/kid/chores.tsx`)
- Summary bar: To Do / In Review / Paid counts
- To Do: tap to go to chore-verify screen (camera verification)
- In Review: shows AI verdict status with color coding
- Paid Out: completed chores with reward shown

### Chore Verify (`/(app)/kid/chore-verify.tsx`)
- Kid takes a photo of the completed chore
- `POST /chores/:id/verify` with photo (multipart or base64)
- GPT-4o Vision analyses the photo against the chore title
- Returns verdict: `approved` / `rejected` / `uncertain`
- Approved/uncertain → notifies parents for final approval
- Rejected → kid sees PAL's reason

### Goals (`/(app)/kid/goals.tsx`)
- Active goal with progress bar
- Goal templates: AirPods (500), Game (1000), Sneakers (800), Phone case (200), Art supplies (300)
- Custom goal creation
- Completed goals history

### Cart (`/(app)/kid/cart.tsx`)
- Items added from camera scan
- PAL one-liner per item
- Swipe to remove
- PAL's take on the whole basket
- "Pay with Brains" → checkout flow
- Brains deducted only on checkout, not on add-to-cart

### Checkout (`/(app)/kid/checkout-nfc.tsx`)
- Enter real-world dollar amount paid
- Hold-to-pay gesture (800ms long press, ring fill, haptic)
- Confetti on success
- Cart cleared, ledger entries written

---

## 9. Camera & HealthPAL

The camera screen (`/(app)/camera.tsx`) is the most technically complex part of the app.

### How it works

1. **Frame capture loop** — every 700ms, `expo-camera` takes a photo, `expo-image-manipulator` resizes it to max 384px wide (JPEG, 60% quality), reads it as base64, converts to `Uint8Array`, and sends it over a WebSocket to the API.

2. **WebSocket protocol** — binary frames are tagged with `0x01` prefix. The server (`/live` WebSocket endpoint) receives frames and runs them through the perception pipeline.

3. **Perception pipeline** (server-side, `ws/perception.ts`):
   - GPT-4o Vision identifies the product (brand, product name, category)
   - Looks up the item in the `items` catalog table
   - If not found, generates a verdict on the fly
   - Returns: `detectionId`, `brand`, `product`, `coinDelta`, `emoji`, `anchor` (x/y position as 0–1 fractions), `verdict` object

4. **Verdict object:**
   ```json
   {
     "trafficLight": "green" | "amber" | "red",
     "ingredientsSummary": "...",
     "whyBad": "...",
     "whyGood": "...",
     "healthContext": "...",
     "estimatedPrice": "..."
   }
   ```

5. **PAL voice reaction** — server streams MP3 audio chunks tagged with `0x02` prefix. Client buffers them by `detectionId`, assembles the full MP3, writes to cache, plays with `expo-audio`.

6. **Multi-detection** — multiple items can be detected simultaneously. Each gets its own coin badge positioned at the `anchor` coordinates. Badges animate in with a spring + ripple ring.

### UI elements

- **Fog wake animation** — on first open, a green fog dissolves to reveal the camera. Radial gradient layers fade out over 900ms.
- **Coin badge** — circular badge at the item's position showing delta (e.g. `-10 🧠`), color-coded by traffic light. Tap to open detail sheet.
- **Scanning frame** — corner brackets shown when nothing is detected.
- **Caption bar** — bottom strip showing all detected items as chips.
- **Detail sheet** — slides up from bottom with full verdict: traffic light, PAL quote, ingredients, why bad/good, health context, estimated price. Actions: Skip (+2 🧠) or Add to cart.
- **Cart button** — top right, shows badge count.
- **Added toast** — green toast when item added to cart.

### WebSocket message types (server → client)

| Type | Payload | Meaning |
|---|---|---|
| `detection.appeared` | detectionId, brand, product, coinDelta, emoji, anchor, verdict | New item detected |
| `detection.updated` | detectionId, anchor | Item moved (anchor updated) |
| `detection.cleared` | detectionId | Item left frame |
| `speech.started` | detectionId | PAL starting to speak |
| `speech.ended` | detectionId, text | PAL finished, text transcript |
| Binary `0x02` prefix | MP3 chunk | Audio data |

### Skip reward
Tapping "Skip it +2 🧠" on the detail sheet calls `POST /cart/skip` which writes a `scan_skip_reward` ledger entry (+2 Brains) immediately.

### Add to cart
Tapping "Add to cart" calls `POST /cart` which creates a `cart_items` row. Brains are NOT deducted yet — only on checkout.

---

## 10. PAL Chat (AI Agent)

### Architecture

PAL chat is a standard HTTP request/response chat (not streaming). Each message:
1. Client sends `POST /chat { message: string }`
2. Server loads context via `loadPalContext(accountId)` — live family data
3. Server runs intent detection via `parseIntent(message, ctx)` — GPT-4o-mini
4. If actionable intent detected → returns `{ reply, intent, requiresConfirmation: true }`
5. Client shows an **Intent Confirmation Card** inline in the chat
6. User confirms → `POST /chat/execute { intent }` → action executed
7. Server returns `{ confirmationMessage }` → shown as PAL's reply

### Context loading (`services/pal-context.ts`)

Every chat request loads:
- Caller's name, role, balance
- All kids in the family with: balance, streak, pending chores count, active goal, last 10 ledger entries (7 days)
- Family name

This is serialised into a system prompt via `contextToSystemPrompt()`.

**Parent system prompt includes:** family overview, per-kid stats, tone rules (concise, direct, not sycophantic).

**Kid system prompt includes:** balance, active goal, streak, pending chores, spend style (from onboarding), recent activity. Tone: sarcastic, dry-witted, max 2 sentences.

### Intent types

| Intent | Trigger words | Action |
|---|---|---|
| `add_chore` | "add chore", "create chore" | Creates chore for kid |
| `topup` | "top up", "send", "topup" | Credits Brains to kid |
| `set_goal` | "set goal", "add goal" | Creates savings goal |
| `query` | anything else | Just a text reply |

### Voice in chat

PAL's text replies are spoken aloud via `palSpeakAsync()` — calls `GET /voice/onboard/speak?text=...` which uses OpenAI TTS-1 (nova voice). On web, uses `window.Audio`. On native, uses `expo-audio`.

### Suggestion chips

Empty state shows quick-start chips:
- **Kid:** "What's my balance?", "How far to my goal?", "Roast my last buy", "Should I buy a Coke?"
- **Parent:** "How are my kids doing?", "Add a chore for Jamie", "Top up Riley $10", "What did Jamie buy today?"

### Voice mic

The input bar has a `VoiceMic` component. When no text is typed, the mic button appears. Tap to record (VAD-based, no hold required). Transcript is sent as a chat message.

### Chat history

Stored in `chat_messages` table. `GET /chat/history` returns last 50 messages. TanStack Query caches with 30s stale time.

---

## 11. Chores System

### Full flow

**Parent creates:**
1. Opens chores screen → taps `+`
2. Fills: title, assign to kid, Brain Points reward, optional bonus reward (real-world treat)
3. `POST /chores { assignedTo, title, rewardBrains, rewardNote? }`
4. Chore appears in kid's "To Do" list

**Kid completes:**
1. Taps chore → goes to `/(app)/kid/chore-verify`
2. Takes a photo of the completed chore
3. `POST /chores/:id/verify` with photo
4. GPT-4o Vision analyses: did they actually do it?
5. Verdict: `approved` → status `ai_approved`, `rejected` → `ai_rejected`, `uncertain` → `ai_uncertain`
6. Parents notified (push + in-app) for approved/uncertain

**Parent approves:**
1. Sees chore in "Needs Your Approval" section with AI verdict badge
2. Taps "Approve & Pay"
3. `PATCH /chores/:id { status: 'parent_approved' }`
4. Server runs DB transaction: credits Brains to kid, writes ledger row, marks chore `paid`
5. Push notification to kid

**Parent rejects:**
1. Taps "Reject" → prompted for optional note
2. `PATCH /chores/:id { status: 'parent_rejected', parentNote: '...' }`
3. Push notification to kid with reason

### Bonus reward
When creating a chore, parent can add a real-world bonus (e.g. "Ice cream 🍦", "Screen time 📱"). Stored in `chore.metadata.rewardNote`. Displayed as a gold tag on the chore card.

---

## 12. Payments & Wallet

### Currency model
- Everything stored in cents (integers)
- `cached_balance` on `accounts` = AUD cents = Brain Points (same number, different display)
- Display: `balance / 100` = AUD, `balance` = Brain Points
- 1 Brain Point = 1 cent = $0.01 AUD

### Top-up flow (real money)
1. `POST /payments/topup-intent { amountCents, kidAccountId }` → creates Stripe PaymentIntent
2. Client confirms with Apple Pay via `confirmPlatformPayPayment`
3. Stripe webhook `payment_intent.succeeded` → server credits Brains to kid's ledger
4. `cached_balance` updated via trigger

### Top-up flow (demo/sandbox)
`POST /wallet/topup { kidAccountId, brainsDelta, note, kind }` — direct ledger write, no Stripe. Used when Apple Pay not available.

### Ledger writes
All balance changes go through the `ledger` table. `cached_balance` is a denormalised snapshot updated by a DB trigger on ledger insert. Never update `cached_balance` directly except via the trigger.

### Cart checkout
1. Kid taps "Pay with Brains" on cart screen
2. Enters real-world dollar amount (for their records)
3. Hold-to-pay gesture (800ms)
4. `POST /cart/checkout { amountDollars }` → writes `cart_checkout` ledger entries for each item, clears cart
5. Brains deducted = sum of negative `brains_delta` values in cart

---

## 13. Family & Invite System

### Join Request flow (current — no SMS)
1. Parent enters kid's phone in Add Kid screen
2. `POST /join-requests { phone, kidSeed, initialTopup }` — stores pending invite in `invites` table with `recipientPhone` set and `code` prefixed `JR`
3. Kid signs in with their phone
4. After OTP: `GET /join-requests/pending` — returns any pending requests for their phone
5. Kid sees request screen, taps Accept
6. `POST /join-requests/:id/accept` — DB transaction: sets `accountType='kid'`, creates membership, credits initial Brains, marks invite accepted
7. Kid routed to `/(auth)/kid-persona` with `kidSeed` pre-filled

### Invite code flow (legacy — still supported)
Deep link `brainpay://inv/<CODE>` → `/(auth)/invite-accept` → `GET /invites/<code>` → preview → `POST /invites/<code>/accept` → kid persona wizard.

### Family creation
`/(auth)/family-create` — 3-slide wizard: name → avatar → confirm. `POST /family`. Parent routed to home after.

### Multi-parent
A family can have multiple parents (primary_parent, co_parent). Co-parents share the parent dashboard. Co-parents can be added via invite-accept flow with `expectedRole: 'co_parent'`.

---

## 14. Voice Layer

### Onboarding TTS
`GET /voice/onboard/speak?text=<encoded>` → OpenAI TTS-1 (nova voice) → MP3 bytes. Cached 24h. Used in `parent-onboarding.tsx` chat flow.

### PAL chat TTS
`palSpeakAsync(text)` in `lib/pal-speak.ts` — same endpoint. Called after every PAL reply in chat.

### Camera PAL reactions
ElevenLabs (or OpenAI TTS) streams MP3 chunks over the camera WebSocket. Tagged with `0x02` binary prefix. Client buffers and plays.

### Realtime voice onboarding (native only)
`/(auth)/voice-onboard.tsx` uses `useRealtimeVoice` hook which connects to `/voice-rt` WebSocket.

**Server side (`ws/voice-realtime.ts`):**
- Connects to OpenAI Realtime API (`gpt-4o-realtime-preview`)
- Configures session: server VAD, PCM16 audio, whisper-1 transcription
- PAL speaks first (triggers `response.create` on connect)
- Extracts `[PERSONA: {...}]` tags from responses to build persona incrementally
- Detects `[DONE]` to signal onboarding complete
- Streams audio back as binary `0x04`-tagged chunks

**On web:** immediately redirects to `parent-onboarding` (HTTP TTS chat) or `kid-persona` (text wizard) — expo-audio PCM streaming doesn't work in browsers.

**On native with mic denied:** same fallback.

---

## 15. Agent Architecture (Roadmap)

This section documents the planned evolution from the current screen-based UI to a fully agent-centric product.

### The vision

The app becomes a collection of specialised AI agents, each with a persistent chat thread and a custom knowledge base built from onboarding data. The chat interface IS the app — payments, chores, camera results, and goals all happen as inline action cards inside the conversation.

### Agent roster

| Agent | User | Responsibility |
|---|---|---|
| **ParentPAL** | Parent | Onboarding, family management, chore creation/approval, top-ups, spending insights |
| **KidPAL** | Kid | Balance/goal tracking, chore status, shopping decisions, streak coaching |
| **HealthPAL** | Kid | Camera scan verdicts, food education, health streaks |
| **StudyPAL** | Kid | (Future) Learning goals tied to Brains rewards |
| **MoneyPAL** | Kid | (Future) Financial literacy, savings simulations |

### Memory architecture

**The problem:** Persistent chat threads grow indefinitely. Sending full history to the LLM is expensive and slow.

**The solution — two-layer memory:**

**Layer 1 — Display thread (infinite, DB only)**
All messages stored in `chat_messages`. User sees full history. Never truncated.

**Layer 2 — Working context (bounded, assembled per request)**
What the LLM actually sees:
- System prompt: live data (balances, goals, chores) + `learned_traits` from persona
- Compressed memory: distilled facts from past conversations (~2000 tokens)
- Recent turns: last 15 messages only

**Summarisation job:** After each session (or every 20 turns), a background job runs:
> "Given this conversation, extract any new facts about the user that should be remembered permanently."

Output written to `accounts.persona.learned_traits[]`. Examples:
- "Prefers to be called Dad, not David"
- "Always asks about Coca-Cola — it's their weakness"
- "Gets motivated when PAL mentions the streak"

**Result:** LLM context stays flat (~6000-8000 tokens) regardless of account age. Agent gets smarter over time.

### Inline action cards

Instead of navigating to separate screens, actions happen as cards inside the chat thread:

```
PAL: Jamie submitted his chore — "Clean room". AI says it looks good.

     ┌─────────────────────────────┐
     │ 🧹 Clean room               │
     │ Jamie · 50 🧠               │
     │ AI: "Room looks tidy. ✓"    │
     │  [Reject]  [Approve & Pay]  │
     └─────────────────────────────┘
```

Card types to build:
- `ChoreApprovalCard` — approve/reject inline
- `TopupConfirmCard` — hold-to-send inside chat
- `ScanResultCard` — camera verdict in KidPAL thread
- `GoalProgressCard` — milestone celebrations
- `StreakCard` — streak achievements

### Navigation model

Bottom bar becomes agent switcher:
- ParentPAL (parent app)
- KidPAL (kid app)
- Camera / HealthPAL

Each agent has one persistent thread. No separate screens for chores, top-up, goals — they're all cards in the thread.

---

## 16. Known Edge Cases Fixed

### Routing bugs fixed

| Bug | Symptom | Fix |
|---|---|---|
| Kid accepted join request but never finished persona | "No request yet" loop | `index.tsx` now routes `accountType='kid'` + no persona → `kid-persona` |
| OTP routing after returning user | Sent to `role-select` even if `accountType` set | `otp.tsx` now checks `onboardingComplete` + `accountType` separately |
| Join request accept → wrong screen | Routed to `voice-onboard` (parent flow) | Now routes to `kid-persona` with `kidSeed` |
| Voice onboard on web | Always redirected to `parent-onboarding` regardless of role | Now checks `accountType` — kids go to `kid-persona` |
| Mid-onboarding page refresh | `AuthGate` bounced user to app before finishing | `AuthGate` now exempts `kid-persona`, `parent-onboarding`, `parent-persona`, `voice-onboard` |
| Returning user with `accountType` but no persona | Sent to `role-select` → loop | `index.tsx` resumes correct wizard based on `accountType` |

### Button overlap fixes

| Screen | Issue | Fix |
|---|---|---|
| `add-kid.tsx` | "Send Request" hidden behind tab bar | `paddingBottom: insets.bottom + 80` |
| `chores.tsx` bottom sheet | Sheet clipped by tab bar | `paddingBottom: insets.bottom + 80` |

### Onboarding one-time guarantee

`onboardingComplete` is computed as `accountType !== null && persona.name !== null`. Stored in Zustand, persisted in SecureStore. Every onboarding screen has a guard `useEffect` that redirects to the app if `onboardingComplete === true`. The `AuthGate` enforces this globally.

---

## 17. Environment Variables

### API (`apps/api/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | HS256 signing secret for BrainPal JWTs |
| `OPENAI_API_KEY` | GPT-4o-mini, GPT-4o Vision, TTS-1, Realtime API |
| `TWILIO_ACCOUNT_SID` | Twilio Verify for OTP SMS |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_VERIFY_SID` | Twilio Verify service SID |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS for camera PAL reactions |
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `development` \| `production` |

### Mobile (`apps/mobile/.env.local`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | API base URL (e.g. `https://api.zapfan.com`) |
| `EXPO_PUBLIC_WS_URL` | WebSocket URL (e.g. `wss://api.zapfan.com/live`) |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `EXPO_PUBLIC_STRIPE_MERCHANT_ID` | Apple Pay merchant ID |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL (for direct queries if needed) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

---

## Appendix: API Routes Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/otp/start` | None | Send OTP SMS |
| POST | `/auth/otp/check` | None | Verify OTP, get JWT |
| POST | `/auth/logout` | JWT | Client-side logout |
| GET | `/me` | JWT | Current account + family |
| PATCH | `/me` | JWT | Update persona / accountType |
| PATCH | `/me/push-token` | JWT | Store Expo push token |
| GET | `/family` | JWT | Current family + members |
| POST | `/family` | JWT | Create family |
| POST | `/join-requests` | JWT | Parent creates join request |
| GET | `/join-requests/pending` | JWT | Kid checks for pending requests |
| POST | `/join-requests/:id/accept` | JWT | Kid accepts request |
| POST | `/join-requests/:id/decline` | JWT | Kid declines request |
| GET | `/invites/:code` | None | Preview invite (legacy) |
| POST | `/invites/:code/accept` | JWT | Accept invite (legacy) |
| GET | `/chores` | JWT | List chores (role-filtered) |
| POST | `/chores` | JWT | Create chore (parent) |
| PATCH | `/chores/:id` | JWT | Update chore status |
| POST | `/chores/:id/verify` | JWT | Kid submits photo for AI verification |
| GET | `/goals` | JWT | List goals |
| POST | `/goals` | JWT | Create goal |
| GET | `/cart` | JWT | Get cart items |
| POST | `/cart` | JWT | Add item to cart |
| POST | `/cart/checkout` | JWT | Checkout cart |
| POST | `/cart/skip` | JWT | Skip item (+2 Brains) |
| GET | `/wallet` | JWT | Balance + ledger entries |
| POST | `/wallet/topup` | JWT | Demo top-up (no Stripe) |
| POST | `/payments/topup-intent` | JWT | Create Stripe PaymentIntent |
| POST | `/chat` | JWT | Send message to PAL |
| GET | `/chat/history` | JWT | Last 50 messages |
| POST | `/chat/execute` | JWT | Execute confirmed intent |
| GET | `/voice/onboard/speak` | None | TTS audio for onboarding |
| WS | `/live` | JWT (query param) | Camera frame streaming |
| WS | `/voice-rt` | JWT (query param) | Realtime voice onboarding |

---

*Document generated May 2026. Maintained in `docs/brainpal-notion-doc.md`.*
