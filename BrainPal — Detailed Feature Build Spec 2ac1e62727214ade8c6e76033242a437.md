# BrainPal — Detailed Feature Build Spec

<aside>
📐

This is the **how**. The companion doc [BrainPal — MVP Build Plan (Auth + Dashboard + Camera)](https://www.notion.so/BrainPal-MVP-Build-Plan-Auth-Dashboard-Camera-64310798bffb402284f659849dc4e2d8?pvs=21) is the **what** — scope, timeline, decisions. This doc goes feature-by-feature with screens, data, APIs, state, edge cases, and acceptance criteria. Read both before writing the first line of code.

</aside>

## Table of contents

## 0. How to use this doc

- Every feature section follows the same shape: **user stories → screens → data → APIs → state → edge cases → telemetry → acceptance criteria.**
- If a decision isn't in this doc or the MVP plan, it isn't decided yet. Flag in the team channel, decide, write it down here.
- Acceptance criteria are **demo-blockers**. If they don't pass, we don't ship.

## 1. Foundations (cross-cutting)

Things every feature depends on. Build these in the first 2 days, never touch them again.

### 1.1 Repository layout

```
brainpal/
├── apps/
│   ├── mobile/                 # Expo React Native app
│   │   ├── app/                # Expo Router file-based routes
│   │   │   ├── (auth)/         # phone, otp, onboarding
│   │   │   ├── (app)/          # dashboard, camera, profile (auth-gated)
│   │   │   └── _layout.tsx
│   │   ├── components/
│   │   ├── lib/                # api client, ws client, supabase client
│   │   ├── stores/             # zustand stores
│   │   ├── hooks/
│   │   └── theme/              # design tokens
│   └── api/                    # Hono backend on Fargate
│       ├── src/
│       │   ├── routes/         # http routes
│       │   ├── ws/             # websocket handlers
│       │   ├── services/       # gemini, openai, elevenlabs, twilio
│       │   ├── db/             # drizzle schema + queries
│       │   └── index.ts
│       └── Dockerfile
├── packages/
│   ├── shared/                 # types shared client+server
│   │   ├── api-contract.ts     # zod schemas for HTTP + WS messages
│   │   └── domain.ts           # User, Kid, Item, LedgerEntry
│   └── config/                 # eslint, tsconfig, prettier
├── supabase/
│   ├── migrations/
│   └── functions/              # edge functions (otp-start, otp-check)
├── turbo.json
└── package.json
```

**Monorepo tool:** Turborepo. **Package manager:** pnpm. **Node:** 20 LTS.

### 1.2 Environments

| Env | Purpose | Backend | DB | App build |
| --- | --- | --- | --- | --- |
| **local** | Daily dev | `pnpm dev` on laptop | Supabase local (Docker) | Expo Go on physical iPhone |
| **staging** | Internal testing | Fargate `brainpal-stg` | Supabase staging project | EAS internal distribution |
| **prod** | TestFlight demo | Fargate `brainpal-prod` | Supabase prod project (ap-southeast-2) | TestFlight |

**Region pinning:** Supabase prod + Fargate prod + ECR registry **must all be `ap-southeast-2`**. One wrong region = 200ms latency hit, kills the sub-800ms target.

### 1.3 Secrets management

- **Local**: `.env.local` (git-ignored). Template at `.env.example` (committed).
- **Fargate**: AWS Secrets Manager, injected as env vars by the task definition.
- **Supabase Edge Functions**: `supabase secrets set TWILIO_SID=… TWILIO_AUTH_TOKEN=… TWILIO_VERIFY_SID=…`
- **EAS** (build secrets like Sentry DSN): `eas secret:create`

**Required secrets (full list):**

```
# Supabase (server + client)
SUPABASE_URL
SUPABASE_ANON_KEY                  # client-safe
SUPABASE_SERVICE_ROLE_KEY          # server-only, edge function only

# Twilio (edge function only)
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID

# AI providers (Fargate only)
GEMINI_API_KEY                     # perception (Gemini 2.0 Flash)
XAI_API_KEY                        # personality (Grok 4.1 reasoning, OpenAI-compatible at https://api.x.ai/v1)
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID                # "Charlie" voice id

# Observability
SENTRY_DSN_MOBILE
SENTRY_DSN_API
```

### 1.4 Data model (full schema)

Drizzle definitions live in `apps/api/src/db/schema.ts`. Migrations via `drizzle-kit`.

```tsx
// users — one row per authenticated phone number
users {
  id            uuid pk default uuid_generate_v4()
  phone         text unique not null            // E.164, e.g. +61412345678
  display_name  text
  avatar_emoji  text default '🧒'
  created_at    timestamptz default now()
  last_seen_at  timestamptz
}

// kids — for v1, one kid per user (the user IS the kid)
// keeps the model future-proof for v2 parent app
kids {
  id            uuid pk
  user_id       uuid fk users.id
  display_name  text not null
  age           int
  balance_cents int default 10000             // 100 coins = 10000 cents (1 coin = 1 cent internally)
  created_at    timestamptz default now()
}

// items — the product catalog Gemini matches against
items {
  id              uuid pk
  brand           text not null
  product         text not null               // 'Classic 375ml can'
  category        text                        // drink | snack | dairy | produce | other
  coin_delta      int not null                // +15 or -10 (in coins, not cents)
  reason_template text not null               // for PAL prompt context
  emoji           text default '🛒'
  created_at      timestamptz default now()
  unique(brand, product)
}

// ledger_entries — append-only event log of every coin change
ledger_entries {
  id           uuid pk
  kid_id       uuid fk kids.id
  item_id      uuid fk items.id null         // null for non-item entries (add-funds, etc.)
  kind         text not null                 // 'purchase' | 'topup' | 'reward' | 'adjustment'
  coin_delta   int not null                  // signed
  balance_after int not null                 // snapshot for fast read
  note         text
  metadata     jsonb default '{}'
  created_at   timestamptz default now()
  index (kid_id, created_at desc)
}

// sessions — live camera sessions, for analytics + cost tracking
sessions {
  id            uuid pk
  kid_id        uuid fk kids.id
  started_at    timestamptz default now()
  ended_at      timestamptz
  frames_sent   int default 0
  detections    int default 0
  reactions     int default 0
  estimated_cost_usd numeric(10,4) default 0
}
```

**Row-level security (RLS) on Supabase:**

- `kids`, `ledger_entries`, `sessions`: kid can only read/write rows where `kid_id` matches their JWT's `sub`.
- `items`: read-only public, write blocked from client (server-only via service role).

### 1.5 API contract

All HTTP + WebSocket messages are validated with **zod** schemas in `packages/shared/api-contract.ts`. Same schemas on client and server = impossible to drift.

**HTTP base URL:** `https://api.brainpal.tech` (Fargate behind CloudFront).

**WebSocket URL:** `wss://api.brainpal.tech/live?token=<jwt>`

**HTTP endpoints (v1):**

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/auth/otp/start` | Send SMS OTP | none |
| POST | `/auth/otp/check` | Verify code, return JWT | none |
| POST | `/auth/logout` | Invalidate refresh token | JWT |
| GET | `/me` | User + kid profile | JWT |
| PATCH | `/me` | Update display name, avatar | JWT |
| GET | `/wallet` | Balance + last 50 entries | JWT |
| POST | `/wallet/topup` | Fake add-funds (+100 coins) | JWT |
| POST | `/wallet/purchase` | Confirm a buy from camera | JWT |
| GET | `/items/:id` | Item detail for the tap-card | JWT |

### 1.6 Design tokens

One source of truth in `apps/mobile/theme/tokens.ts`. **Nativewind** consumes these.

```tsx
export const tokens = {
  color: {
    bg:        '#0B0B0F',     // near-black
    surface:   '#16161D',
    surface2:  '#1F1F2A',
    text:      '#F5F5F7',
    textMuted: '#8E8E9A',
    accent:    '#3DDC84',     // 'earn green'
    danger:    '#FF5C5C',     // 'spend red'
    coin:      '#FFB627',     // gold coin
  },
  radius:  { sm: 8, md: 14, lg: 20, pill: 999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 8: 48 },
  font:    { display: 'InterDisplay', body: 'Inter' },
  fontSize:{ xs: 12, sm: 14, md: 16, lg: 20, xl: 28, '2xl': 40, hero: 56 },
}
```

### 1.7 Error handling + observability

- **Client errors**: Sentry captures uncaught + manually-reported with `captureException`. PII-scrubbed (no phone numbers).
- **Server errors**: Sentry + structured JSON logs to CloudWatch.
- **User-facing error UI**: every failed action shows a single toast (`react-native-toast-message`), never a blocking modal. Copy is friendly, not technical ("hmm, that didn't work — try again").
- **Network failures**: TanStack Query handles retry (3x exponential backoff) automatically. WebSocket auto-reconnects with 1s/2s/4s/8s backoff.

## 2. Feature 1 — Authentication (phone OTP via Twilio)

### 2.1 User stories

- *As a kid, I want to sign in with just my phone number so I don't have to remember a password.*
- *As a kid, I want the SMS code to autofill so I don't have to type it.*
- *As a returning user, I want to stay logged in across app launches.*

### 2.2 Screens

**Screen A — Phone entry** (`app/(auth)/phone.tsx`)

```
┌─────────────────────────────┐
│        🤖  PAL              │  ← logo + wordmark
│                             │
│   What's your number?       │  ← H1
│   We'll text you a code.    │  ← caption
│                             │
│   [🇦🇺 +61] [4 1234 5678]   │  ← country picker + input
│                             │
│   [    Continue    ]        │  ← primary button (disabled until valid)
│                             │
│   By continuing you agree   │
│   to Terms + Privacy        │
└─────────────────────────────┘
```

- Country picker default: 🇦🇺 +61. Top of list: AU, NZ, US, UK, IN.
- Input formatter: live mask `4 1234 5678` (AU mobile). Validates against `libphonenumber-js`.
- Continue button: disabled while invalid, shows spinner during request.

**Screen B — OTP entry** (`app/(auth)/otp.tsx`)

```
┌─────────────────────────────┐
│   ← back                    │
│                             │
│   Enter the code            │  ← H1
│   Sent to +61 4 1234 5678   │  ← caption with edit link
│                             │
│     [_][_][_] [_][_][_]     │  ← 6 boxed digit inputs
│                             │
│   Didn't get it?            │
│   [Resend in 30s]           │  ← countdown, then tappable
│                             │
└─────────────────────────────┘
```

- 6 separate `TextInput`s with auto-advance on input, auto-back on backspace.
- iOS SMS autofill: set `textContentType="oneTimeCode"` on the first input, iOS auto-fills all 6.
- Resend countdown: 30s lockout. After 30s the link becomes tappable. Max 3 resends per 10 min (enforced server-side by Twilio + our edge function).
- Submit fires automatically when the 6th digit is entered. No "verify" button.

**Screen C — Onboarding 1/3** (`app/(auth)/onboarding/welcome.tsx`)

- Big PAL avatar animation, "hey, I'm PAL" caption, [Continue] button.

**Screen D — Onboarding 2/3** (`app/(auth)/onboarding/name.tsx`)

- "what should I call you?" → text input → [Continue]. Saves `display_name`.

**Screen E — Onboarding 3/3** (`app/(auth)/onboarding/coins.tsx`)

- Coin animation falls from top, "you start with 100 coins. let's go." → [Enter app]. Routes to dashboard.

### 2.3 Data

- `users` row created on first successful OTP verify (keyed by phone).
- `kids` row created in same transaction (one kid per user in v1).
- JWT issued by Supabase, stored client-side in **Expo SecureStore**.
- Refresh token stored alongside; auto-refresh via Supabase client.

### 2.4 API

**POST `/auth/otp/start`**

```tsx
// request
{ phone: string }                    // E.164 format, e.g. "+61412345678"

// response (200)
{ ok: true, expiresInSec: 600 }

// errors
400  invalid phone format
429  rate limited (max 3 sends per 10 min per phone)
503  twilio downstream error
```

Implementation: Supabase Edge Function calls Twilio Verify `POST /Services/{SID}/Verifications` with `{ To: phone, Channel: 'sms' }`.

**POST `/auth/otp/check`**

```tsx
// request
{ phone: string, code: string }      // code is 6 digits

// response (200)
{
  jwt: string,
  refreshToken: string,
  user: { id, phone, displayName, avatarEmoji },
  isNewUser: boolean
}

// errors
400  invalid code format
401  code incorrect or expired
429  too many attempts (Twilio blocks after 5)
```

Implementation: Edge function calls Twilio Verify `POST /Services/{SID}/VerificationCheck`. On `approved`, uses Supabase Admin API to upsert user + kid, then signs a Supabase JWT.

### 2.5 Client state

Zustand store `useAuthStore`:

```tsx
{
  status: 'idle' | 'sendingCode' | 'awaitingCode' | 'verifying' | 'authenticated' | 'error',
  phone: string | null,
  user: User | null,
  jwt: string | null,
  sendCode: (phone) => Promise<void>,
  verifyCode: (code) => Promise<void>,
  resend: () => Promise<void>,
  signOut: () => Promise<void>,
}
```

Root layout checks `useAuthStore.status` and redirects: unauthenticated → `(auth)/phone`, authenticated → `(app)/dashboard`.

### 2.6 Edge cases

| Case | Behavior |
| --- | --- |
| User enters invalid phone | Continue button stays disabled, no API call |
| Network fails on send | Toast: "couldn't send the code. check connection." Button re-enabled. |
| Code wrong | Inputs shake (Reanimated), clear digits, focus first input, toast: "wrong code, try again." |
| Code expired | Toast: "code expired. tap resend." Inputs disabled until resend. |
| Hits resend limit | Resend link disabled with: "too many tries. wait 10 min." |
| App killed mid-flow | On relaunch, if `phone` is in store, returns to OTP screen; else phone screen. |
| JWT expired (returning user) | Supabase client refreshes silently. If refresh fails, route to phone screen. |
| User changes number | v1: not supported. Settings shows phone read-only. |

### 2.7 Telemetry events

- `auth.phone_submitted` `{ countryCode }`
- `auth.otp_sent` `{ phoneHash }`
- `auth.otp_verified` `{ phoneHash, isNewUser, attempts }`
- `auth.otp_failed` `{ phoneHash, reason }`
- `auth.resend_clicked` `{ resendCount }`
- `auth.onboarding_completed` `{ stepsCompleted }`

### 2.8 Acceptance criteria

- [ ]  Brand-new phone → enter number → receive SMS in <10s → enter code → land on dashboard, **end-to-end under 30s.**
- [ ]  iOS SMS auto-fill works on iOS 16+ — fills all 6 digits in one tap.
- [ ]  Wrong code shows shake animation + clear inputs within 200ms.
- [ ]  Resend countdown is accurate (±1s).
- [ ]  Killing the app and reopening keeps the user logged in.
- [ ]  Sign-out clears SecureStore + Zustand and routes to phone screen.

## 3. Feature 2 — Dashboard (the payment-style screen)

### 3.1 User stories

- *As a kid, I want to see my current coin balance the moment I open the app.*
- *As a kid, I want to see what I just earned or spent.*
- *As a kid, I want a big obvious button to start scanning.*
- *As a kid, I want a way to top up my coins (even if it's fake for now).*

### 3.2 Screens

**Screen A — Dashboard home** (`app/(app)/index.tsx`)

```
┌─────────────────────────────────┐
│  Hey Sara 👋          ⚙️        │  ← greeting + settings icon
│                                 │
│  ╭───────────────────────────╮  │
│  │  💰   245 coins           │  │  ← balance card
│  │  ↑ +25 this week          │  │
│  ╰───────────────────────────╯  │
│                                 │
│  ┌─────────────────────────┐    │
│  │  📷  Scan & earn        │    │  ← primary CTA
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  💵  Add funds          │    │  ← secondary CTA
│  └─────────────────────────┘    │
│                                 │
│  This week                      │
│  ─────────────                  │
│  🥜  Mixed Nuts      +15  →    │  ← tap → detail
│  🥤  Coca-Cola       −10  →    │
│  💵  Top up         +100  →    │
│                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━        │
│  [🏠 Home]  [🤖 Pal]  [👤 You]  │  ← bottom tabs
└─────────────────────────────────┘
```

**Components:**

- `<GreetingHeader />` — "Hey {name}" + settings gear (top-right) → routes to `/profile`.
- `<BalanceCard />` — hero number with `react-native-reanimated` count-up animation when balance changes. "this week" delta computed client-side from last 7 days of entries.
- `<PrimaryCTA icon="camera" />` — full-width, accent-green, navigates to `/camera`.
- `<SecondaryCTA icon="dollar" />` — full-width, surface color, opens add-funds modal.
- `<ActivityFeed entries={last10} />` — list of `<ActivityRow />` items. Tap → `/activity/[id]`.
- `<TabBar />` — Expo Router tabs.

**Screen B — Add funds modal** (`app/(app)/topup.tsx`, presented modally)

```
┌─────────────────────────────┐
│         Add coins           │
│                             │
│  How much?                  │
│                             │
│   [+50]  [+100]  [+500]     │  ← preset chips, default 100
│                             │
│   [    Add 100 coins    ]   │  ← primary button
│                             │
│   (fake for v1)             │  ← tiny caption, only on dev builds
└─────────────────────────────┘
```

- Three preset chips, no free input in v1.
- On confirm: POST `/wallet/topup`, dismiss modal, balance count-up animates from old → new.

**Screen C — Activity detail** (`app/(app)/activity/[id].tsx`)

```
┌─────────────────────────────┐
│  ← back                     │
│                             │
│  🥤  Coca-Cola              │
│  Classic 375ml can          │
│                             │
│         −10 coins            │
│                             │
│  21 May 2026 · 2:14 PM      │
│                             │
│  "Ugh. Your dentist just    │  ← PAL's roast, archived
│   felt a disturbance."      │
│                             │
│  Balance after: 235 coins   │
└─────────────────────────────┘
```

**Screen D — Profile** (`app/(app)/profile.tsx`)

- Avatar (emoji picker), display name (editable), phone (read-only), sign out button. v1 only.

### 3.3 Data

Read from Postgres via Supabase JS client. **TanStack Query** for caching + revalidation.

```tsx
// queries
useQuery(['wallet'], () => api.getWallet())          // balance + last 50 entries, 30s stale
useQuery(['me'], () => api.getMe())                  // user + kid, infinite stale

// mutations
useMutation((amount) => api.topup(amount), {
  onSuccess: (data) => qc.setQueryData(['wallet'], data)   // optimistic
})
```

**Realtime balance updates:** Supabase Realtime subscription on `ledger_entries` filtered by `kid_id`. New row → refetch wallet → balance count-up animates.

### 3.4 API

**GET `/wallet`**

```tsx
// response
{
  balanceCoins: 245,
  weekDeltaCoins: 25,
  entries: [
    {
      id, kind, coinDelta, balanceAfter, createdAt,
      item: { id, brand, product, emoji } | null,
      note: string | null
    },
    // ... up to 50
  ]
}
```

**POST `/wallet/topup`**

```tsx
// request
{ amount: 50 | 100 | 500 }
// response: same shape as GET /wallet, with new entry at top
```

**POST `/wallet/purchase`** (called from camera buy-button)

```tsx
// request
{ itemId: string, sessionId?: string }
// response: same shape as GET /wallet
// 409 if balance would go negative (allowed in v1 but logged)
```

### 3.5 Client state

- TanStack Query is the source of truth for server data.
- Zustand only for ephemeral UI state (modal open/closed, active tab).
- Balance animation: `useAnimatedReaction` on the query data → `withTiming` from old to new over 800ms with `Easing.out(Easing.cubic)`.

### 3.6 Empty / loading / error states

| State | UI |
| --- | --- |
| First load | Skeleton: shimmer balance card + 3 shimmer rows |
| Empty activity (new user) | "No activity yet. Tap **Scan & earn** to start." |
| Wallet fetch fails | Toast + retry button on card. Cached balance still shown if available. |
| Offline | Cached data shown, small "offline" pill in header. |

### 3.7 Telemetry events

- `dashboard.viewed`
- `dashboard.scan_cta_tapped`
- `dashboard.topup_cta_tapped`
- `dashboard.topup_confirmed` `{ amount }`
- `dashboard.activity_tapped` `{ entryId, kind }`

### 3.8 Acceptance criteria

- [ ]  First paint of dashboard <500ms after auth.
- [ ]  Balance count-up animation runs on every balance change.
- [ ]  "Scan & earn" navigates to camera <100ms (no spinner).
- [ ]  Add funds adds the exact amount, new activity row appears at the top within 200ms.
- [ ]  Activity rows are tappable, detail screen shows correct PAL line + balance-after.
- [ ]  App backgrounded for 5 min and reopened → balance is fresh within 1s.

## 4. Feature 3 — Camera (the hero)

### 4.1 User stories

- *As a kid, I want to point my camera at a snack and instantly see if it's good or bad.*
- *As a kid, I want PAL to react out loud so it feels like having a friend with me.*
- *As a kid, I want to tap a coin to see why I got that score.*
- *As a kid, I want to buy it and have my balance update without leaving the camera.*

### 4.2 Screens

**Screen A — Camera (fullscreen)** (`app/(app)/camera.tsx`)

```
┌─────────────────────────────────┐
│ [💰 245]                  [×]   │  ← balance chip (top-left), close (top-right)
│                                 │
│                                 │
│      [📷 live camera feed]      │
│                                 │
│           ╭─────╮               │
│           │ −10 │               │  ← floating coin (Skia)
│           ╰─────╯               │     anchored over detection
│                                 │
│                                 │
│                          [🎤]   │  ← PAL mic indicator (animates when speaking)
└─────────────────────────────────┘
```

**Screen B — Detail card (overlay, presented on coin tap)**

```
┌─────────────────────────────────┐
│           [drag handle]         │
│                                 │
│   🥤  Coca-Cola                 │
│   Classic 375ml can             │
│                                 │
│         −10 coins                │
│                                 │
│  "39g of sugar, that's 10       │
│   teaspoons. minus 10."         │
│                                 │
│  [   Buy for 10 coins   ]       │  ← primary, red
│  [        Skip          ]       │  ← secondary
└─────────────────────────────────┘
```

- Bottom sheet (`@gorhom/bottom-sheet`), 60% screen height, swipe-down to dismiss.
- Buy → POST `/wallet/purchase` → bottom sheet shows checkmark animation → dismiss after 600ms → balance chip updates.

### 4.3 Vision pipeline (the full data flow)

Full narrative is in the chat history; this is the **engineering spec.**

**Client-side frame loop:**

```tsx
// apps/mobile/screens/camera.tsx
const frameProcessor = useFrameProcessor((frame) => {
  'worklet'
  const lastSent = sharedLastSent.value
  if (Date.now() - lastSent < 400) return        // throttle
  if (sharedInFlight.value) return                // backpressure

  const jpeg = encodeJPEG(frame, { maxSize: 384, quality: 70 })
  sharedInFlight.value = true
  sharedLastSent.value = Date.now()
  runOnJS(ws.sendBinary)(MSG_FRAME, jpeg)
}, [])
```

**Server-side perception loop:**

```tsx
// apps/api/src/ws/handler.ts
async function onFrame(ws, sessionState, bytes) {
  const result = await gemini.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { inlineData: { mimeType: 'image/jpeg', data: bytes } },
      { text: PERCEPTION_PROMPT }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: PERCEPTION_SCHEMA,
      temperature: 0,
      maxOutputTokens: 200,
    }
  })
  const parsed = PerceptionResult.parse(JSON.parse(result.text))
  await handleDetection(ws, sessionState, parsed)
}
```

**Hysteresis state machine** (server, per session):

```tsx
type DetectionState = {
  current: { itemId, hits: number, misses: number } | null,
  active:  { detectionId, itemId } | null,
  lastSpokeAt: Record<string /* itemId */, number /* ts */>
}

function handleDetection(ws, state, parsed) {
  const top = parsed.items[0]
  if (!top || top.confidence < 0.7) {
    bumpMiss(state); return
  }
  const itemId = resolveItem(top.brand, top.product)
  if (state.current?.itemId === itemId) {
    state.current.hits++; state.current.misses = 0
  } else {
    state.current = { itemId, hits: 1, misses: 0 }
  }

  if (state.current.hits >= 3 && state.active?.itemId !== itemId) {
    const detectionId = nanoid()
    state.active = { detectionId, itemId }
    ws.sendJson({ type: 'detection.appeared', detectionId, itemId, ... })
    maybeSpeak(ws, state, itemId)
  }
}

function bumpMiss(state) {
  if (!state.current) return
  state.current.misses++
  if (state.current.misses >= 5) {
    if (state.active) ws.sendJson({ type: 'detection.cleared', detectionId: state.active.detectionId })
    state.active = null; state.current = null
  }
}
```

**Voice pipeline** (when `maybeSpeak` decides yes):

```tsx
async function speak(ws, state, item) {
  // xAI is OpenAI-API-compatible — we just point the OpenAI SDK at api.x.ai
  // const xai = new OpenAI({ apiKey: env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
  const llm = xai.chat.completions.create({
    model: 'grok-4.1-reasoning',
    messages: [{ role: 'system', content: PAL_SYSTEM_PROMPT }, { role: 'user', content: buildContext(item) }],
    stream: true,
    max_tokens: 60,
    reasoning_effort: 'low',          // cut thinking tokens for sub-800ms target
  })
  const tts = elevenlabs.streamWS({ voiceId: ELEVENLABS_VOICE_ID, model: 'eleven_flash_v2_5' })

  let line = ''
  for await (const chunk of llm) {
    const token = chunk.choices[0]?.delta?.content ?? ''
    if (!token) continue
    line += token
    // guardrail: abort if banned phrase appears
    if (containsBannedPhrase(line)) { llm.controller.abort(); tts.close(); fallbackTemplated(ws, item); return }
    tts.send({ text: token, try_trigger_generation: true })
  }
  tts.send({ text: '', flush: true })

  for await (const audioChunk of tts.audioStream()) {
    ws.sendBinary(MSG_AUDIO, audioChunk)
  }
  state.lastSpokeAt[item.id] = Date.now()
}
```

### 4.4 WebSocket protocol

**Connection:** `wss://api.brainpal.tech/live?token=<jwt>`. Server validates JWT; on success sends `session.started`.

**Message types** (all JSON unless noted):

| Direction | Type | Payload |
| --- | --- | --- |
| S→C | `session.started` | `{ sessionId }` |
| C→S | `frame` (binary) | JPEG bytes, prefixed with 1-byte type tag |
| S→C | `detection.appeared` | `{ detectionId, itemId, brand, product, coinDelta, bbox, anchor }` |
| S→C | `detection.updated` | `{ detectionId, anchor }` (every 400ms while active) |
| S→C | `detection.cleared` | `{ detectionId }` |
| S→C | `speech.started` | `{ detectionId }` |
| S→C | `audio` (binary) | MP3 chunk, prefixed with 1-byte type tag + 4-byte seq number |
| S→C | `speech.ended` | `{ detectionId }` |
| C→S | `interrupt` | `{ reason: 'tap' | 'item_changed' }` |
| C→S | `session.end` | `{}` |
| S→C | `error` | `{ code, message }` |

**Binary message framing:**

```
[1 byte: type tag][payload...]
  0x01 = JPEG frame (C→S)
  0x02 = audio chunk (S→C), next 4 bytes = uint32 seq
```

### 4.5 Coin overlay rendering

**Library:** react-native-skia.

**Anchor strategy:** for v1 (single-item), render the coin at the **center of the bounding box**, not at bbox edges. Gemini's bboxes are accurate to ~10% — fine for center-anchored, not fine enough for tight edge overlays.

**Animation:**

- **Enter:** scale 0 → 1 with spring (`{ damping: 12, stiffness: 180 }`), opacity 0 → 1 over 200ms.
- **Position updates** (`detection.updated`): spring to new position with `{ damping: 18, stiffness: 120 }` — feels like physical inertia, not teleporting.
- **Exit** (`detection.cleared`): scale 1 → 0.8, opacity 1 → 0 over 250ms.
- **Idle pulse** (no detection for 3s): mic icon does a soft 1.0 → 1.05 → 1.0 pulse every 2s.

**Coin visual:**

- 80px circle, drop shadow (`shadowOpacity: 0.4, shadowRadius: 12`).
- Background: **accent-green** if positive, **danger-red** if negative, **gray** if zero.
- Text: bold `±N` in white, font-size 24.
- Tap target: 100px hit box (bigger than visual for fat-finger).

### 4.6 Detail card + buy flow

- Tap on coin → `interrupt` to server (stops voice immediately) → open bottom sheet.
- Bottom sheet fetches `/items/:id` via TanStack Query (already cached from session start preload).
- Buy button → POST `/wallet/purchase` → optimistic update on `useQuery(['wallet'])` → balance chip top-left animates → success checkmark → close sheet after 600ms.
- Skip → close sheet, return to camera. Detection cleared.

### 4.7 Edge cases

| Case | Behavior |
| --- | --- |
| Camera permission denied | Full-screen explainer + "Open Settings" deep link to iOS Settings |
| No detection for 10s | Subtle bottom toast: "point at a snack to start" |
| Low confidence (<0.7) | No coin shown, no voice. Silent. |
| Item not in catalog | Gray coin with "?", PAL: "don't know that one yet. suspicious." |
| Network drops mid-session | Coin fades out, banner: "reconnecting…" Auto-reconnect 1s/2s/4s. Resume seamlessly. |
| WebSocket disconnects after 60s idle | Server closes, client lazy-reconnects on next frame |
| App backgrounded mid-session | Close WS, stop frame loop. Resume on foreground (new session). |
| Buy when balance < cost | v1: allowed, balance goes negative. Log it. v2: confirm dialog. |
| User points at multiple items at once | Server picks highest confidence single item. Multi-item is v1.1. |
| Same item still in frame after buy | Hysteresis resets; new detection only after `lastSpokeAt` cooldown (30s). |

### 4.8 Performance budgets

| Metric | Budget | Hard fail at |
| --- | --- | --- |
| Frame encode (client) | ≤50ms | 100ms |
| Frame upload (network) | ≤80ms | 200ms |
| Gemini Flash response | ≤350ms p50, ≤600ms p95 | 1000ms |
| Coin render after detection event | ≤30ms | 100ms |
| Grok 4.1 reasoning first token (incl. thinking) | ≤500ms p50 with `reasoning_effort: low` | 1200ms |
| First audible PAL word (end-to-end) | ≤800ms p50 (≤1100ms acceptable if micro-ack hides Grok thinking) | 1500ms |
| Barge-in (tap → silence) | ≤100ms | 250ms |
| FPS of camera preview | 30 fps | 20 fps |

Measure with custom Sentry transactions per session, log p50/p95 to CloudWatch metrics.

### 4.9 Telemetry events

- `camera.opened`
- `camera.session_started` `{ sessionId }`
- `camera.frame_sent` (sampled 1/20)
- `camera.detection_shown` `{ itemId, latencyMs }`
- `camera.speech_started` `{ detectionId, ttFirstAudioMs }`
- `camera.coin_tapped` `{ itemId }`
- `camera.purchase_confirmed` `{ itemId, coinDelta }`
- `camera.purchase_skipped` `{ itemId }`
- `camera.session_ended` `{ sessionId, durationSec, frames, detections, costUsd }`
- `camera.error` `{ code, where }`

### 4.10 Acceptance criteria

- [ ]  Pointing at a real Coke can at arm's length → coin appears in **<500ms** (with hysteresis: <1.5s on first detection).
- [ ]  PAL's first audible word in **<800ms** measured on real iPhone 13 on home Wi-Fi.
- [ ]  Tap-to-interrupt cuts voice in **<100ms**.
- [ ]  Tap coin → detail card slides up in **<200ms**.
- [ ]  Buy → balance chip updates with count-up, sheet auto-dismisses, back on camera ready for next scan.
- [ ]  Network drop → reconnects within 4s and resumes detection without manual action.
- [ ]  No flicker: coin doesn't pop in and out when the same item is in frame.
- [ ]  Backgrounding the app stops the frame loop (verify in Activity Monitor).

## 5. Cross-cutting features

### 5.1 Onboarding (3 screens, already specced in section 2.2)

- Trigger: `isNewUser: true` on OTP verify response.
- After completion: `PATCH /me { onboardingCompleted: true }`, route to dashboard.
- Skip allowed ("skip" link bottom-right) but discouraged.

### 5.2 Navigation

- **Expo Router** file-based. Two stacks: `(auth)` and `(app)`.
- **Bottom tabs** inside `(app)`: Home, Pal (placeholder in v1 — full chat screen is v2), You.
- **Modals**: top-up (`presentation: 'modal'`), camera (`presentation: 'fullScreenModal'` so it covers tabs).
- **Deep links**: `brainpal://` scheme registered. v1 supports `brainpal://camera` for testing.

### 5.3 Settings (`profile.tsx`)

- Avatar emoji picker (12 preset kid-friendly emojis: 🧒 👦 👧 🧑 👽 🤖 🦄 🐱 🐶 🐼 🦊 🐸).
- Display name (editable, max 20 chars).
- Phone (read-only in v1).
- "About PAL" link → static info page.
- Sign out button (red, bottom).

### 5.4 Offline + connectivity

- **TanStack Query** persists to AsyncStorage; on cold start with no network, shows last-cached data.
- WebSocket attempts reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s capped).
- Header shows small "offline" pill when `NetInfo.isConnected === false`.
- Camera screen blocks open with "need internet for PAL" if offline at launch.

## 6. Infrastructure plan

### 6.1 Backend deployment (Fargate)

```
GitHub push to main
   ↓
GitHub Actions workflow
   ↓
   1. pnpm install + test
   2. docker build apps/api → tag with git sha
   3. docker push to ECR (ap-southeast-2)
   4. aws ecs update-service --force-new-deployment
   ↓
Fargate rolls out new task (1 task in v1, scale later)
   ↓
ALB health check on /health → 200 → traffic shifted
```

- **Task size:** 0.5 vCPU, 1 GB RAM. Single task in v1, plenty for demo load.
- **ALB sticky sessions enabled** — same client always hits the same task (keeps WebSocket state in-process for v1; move to Redis in v1.1 if we need to scale beyond 1 task).
- **Custom domain:** `api.brainpal.tech` via Route 53 → CloudFront → ALB. TLS cert via ACM.

### 6.2 Mobile build + distribution

- **EAS Build** profile `production` builds signed `.ipa` for App Store / TestFlight.
- **EAS Submit** uploads to App Store Connect → TestFlight internal testers.
- **OTA updates** via EAS Update for JS-only changes (no native module changes) — fix copy/UI in minutes without app review.

### 6.3 Monitoring + alerting

- **Sentry**: errors + performance (mobile + API).
- **CloudWatch dashboards**: WS connections, Gemini latency p50/p95, ElevenLabs latency, cost-per-session running total.
- **Alerts**:
    - Gemini p95 > 800ms for 5 min → PagerDuty
    - ECS task crash → PagerDuty
    - Cost-per-session > $0.30 → Slack warning

## 7. Build sequencing (expanded from MVP plan)

The 14-day plan from the MVP doc, with sub-tasks per day.

### Week 1

**Day 1 — Repo + scaffold**

- [ ]  Init Turborepo with pnpm workspaces
- [ ]  Create `apps/mobile` via `pnpm create expo`, install Expo Router
- [ ]  Create `apps/api` with Hono, basic `/health` endpoint
- [ ]  Set up `packages/shared` with first zod schema (`HealthResponse`)
- [ ]  Set up ESLint + Prettier + tsconfig in `packages/config`
- [ ]  Verify mobile runs on Expo Go on physical iPhone, hits local API
- [ ]  Push to GitHub, set up basic CI (lint + typecheck)

**Day 2 — Auth (Twilio OTP)**

- [ ]  Provision Supabase prod project in `ap-southeast-2`
- [ ]  Write Supabase Edge Functions: `otp-start`, `otp-check`
- [ ]  Wire Twilio Verify SID + auth token as Supabase secrets
- [ ]  Build phone entry + OTP entry screens
- [ ]  Wire SecureStore JWT storage + Supabase client init
- [ ]  Test full flow on real iPhone with real SMS

**Day 3 — Schema + seed**

- [ ]  Write Drizzle schema (users, kids, items, ledger_entries, sessions)
- [ ]  Set up RLS policies in Supabase migrations
- [ ]  Seed `items` with Coke + Mixed Nuts rows (with coin_delta + reason_template)
- [ ]  Build `/me` endpoint, wire to mobile

**Day 4 — Dashboard UI**

- [ ]  Design tokens + Nativewind setup
- [ ]  BalanceCard, PrimaryCTA, SecondaryCTA, ActivityFeed components
- [ ]  Wire `/wallet` GET, render real data
- [ ]  Bottom tab bar with placeholder Pal + You tabs
- [ ]  Activity detail screen

**Day 5 — Top-up + count-up animation**

- [ ]  Top-up modal with preset chips
- [ ]  `/wallet/topup` POST
- [ ]  Reanimated balance count-up
- [ ]  Empty/loading/error states for dashboard
- [ ]  Sign-out flow

### Week 2

**Day 6 — Camera scaffold**

- [ ]  Install vision-camera + Skia + reanimated
- [ ]  Camera screen renders preview fullscreen
- [ ]  Frame processor encodes JPEG at 384px, q70, every 400ms
- [ ]  Permission flow + denied state

**Day 7 — Backend WS + Gemini**

- [ ]  WS endpoint with JWT auth
- [ ]  Session state machine in-process
- [ ]  Gemini Flash integration with strict JSON schema
- [ ]  Hysteresis state machine (3 hits / 5 misses)
- [ ]  Emit `detection.appeared` / `cleared` events
- [ ]  **Latency test**: real iPhone, real Wi-Fi, log Gemini p50

**Day 8 — Coin overlay**

- [ ]  Skia coin component with spring animation
- [ ]  Subscribe to `detection.*` events, render coin at anchor
- [ ]  Position smoothing on `detection.updated`
- [ ]  Balance chip top-left, mic indicator bottom-right
- [ ]  Idle pulse

**Day 9 — Voice pipeline**

- [ ]  PAL system prompt (from MVP plan section 2)
- [ ]  Grok 4.1 reasoning streaming via xAI (OpenAI SDK pointed at `https://api.x.ai/v1`)
- [ ]  Set `reasoning_effort: 'low'` and benchmark first-token latency on real device
- [ ]  Implement micro-ack ("oh"/"hmm") played on detection — hides Grok thinking time
- [ ]  **Decision gate**: if end-to-end TTFA > 1200ms with mitigations, fall back to Grok 4 Fast (non-reasoning)
- [ ]  ElevenLabs Flash v2.5 streaming WS
- [ ]  Server-side guardrail (banned phrases regex)
- [ ]  Audio chunk forwarding C→S framing
- [ ]  expo-av streaming playback
- [ ]  **Latency test**: end-to-end time-to-first-audio on real device

**Day 10 — Detail card + buy**

- [ ]  Bottom sheet detail card
- [ ]  `/items/:id` endpoint
- [ ]  `/wallet/purchase` endpoint with optimistic update
- [ ]  Success animation, dismiss flow
- [ ]  Detection cooldown after buy (30s same-item lock)

**Day 11 — Polish**

- [ ]  Micro-acks ("mm", "oh") played before LLM response
- [ ]  Barge-in (tap → interrupt → flush audio queue)
- [ ]  Haptic feedback on coin appearance + buy
- [ ]  Sound design: subtle coin chime, buy success chime
- [ ]  Real-device latency sweep, optimize anything >budget

**Day 12 — Bug bash**

- [ ]  Network drop mid-session
- [ ]  App backgrounded mid-session
- [ ]  Low confidence handling
- [ ]  Unknown item handling
- [ ]  Permission denied flow
- [ ]  Submit first TestFlight build (buffer for Apple review)

**Day 13 — Demo content + onboarding**

- [ ]  3-screen onboarding flow
- [ ]  Settings screen (avatar, name, sign-out)
- [ ]  Final pass on copy + PAL lines
- [ ]  Record fallback demo video at home

**Day 14 — Ship + demo**

- [ ]  Final TestFlight build, distribute to internal testers
- [ ]  30-second demo video (real Coke + Mixed Nuts on a real counter)
- [ ]  Post-demo retro: what to fix in v1.1

## 8. Testing plan

- **Unit tests**: zod schemas, hysteresis state machine, balance math, banned-phrase filter. Vitest.
- **Component tests**: BalanceCard count-up, OTP input auto-advance. React Native Testing Library.
- **Integration test**: full auth flow with mocked Twilio (Supabase local + Edge Function test runner).
- **Manual device test matrix** (run before TestFlight build):
    - iPhone 13, iOS 17 (target baseline)
    - iPhone 15 Pro, iOS 18 (newest)
    - iPhone 12, iOS 16 (oldest supported)
- **Latency soak test**: 10-minute camera session, log p50/p95 for every metric in section 4.8.

## 9. Launch checklist (TestFlight)

- [ ]  All MVP-plan acceptance criteria pass
- [ ]  All detailed acceptance criteria (sections 2.8, 3.8, 4.10) pass
- [ ]  Sentry receiving events from prod build
- [ ]  CloudWatch dashboards green for 24h
- [ ]  Privacy policy + terms hosted at `brainpal.tech/privacy` and `/terms`
- [ ]  App Store Connect: app icon, screenshots (5), description, keywords, age rating
- [ ]  TestFlight internal testers added
- [ ]  Demo video recorded + uploaded to a private Notion page
- [ ]  On-call rotation defined for the demo week (just you for v1, but written down)

## 10. After v1 (what's next, not in scope now)

Deferred features, in rough priority order. Already noted in the MVP plan, repeated here so it's all in one place:

1. **Multi-item shelf detection** — bbox-anchored coins for full shelves
2. **Push-to-talk** — kid asks PAL questions out loud
3. **Real parent app** — split parent + kid experiences, parent funds wallet
4. **Real top-up via Stripe AU** — replace fake button
5. **Catalog scale** — top 500 AU supermarket SKUs
6. **Parent rules engine** — sugar caps, blocked categories, daily limits
7. **Card issuing** — Cuscal / EML / Hay conversations
8. **Ledger hardening** — double-entry, immutable journal
9. **Stablecoin settlement R&D** — only after kid product is loved
10. **Android** — once iOS is proven

---

**Read order for new engineers joining:**

1. [BrainPal — MVP Build Plan (Auth + Dashboard + Camera)](https://www.notion.so/BrainPal-MVP-Build-Plan-Auth-Dashboard-Camera-64310798bffb402284f659849dc4e2d8?pvs=21) (the what)
2. This doc (the how)
3. Section 1 (foundations) — actually run through the local setup
4. Pick a feature, read its full section, start implementing