# BrainPal — Build Deck

> The execution doc. Sits **downstream** of:
>
> 1. **MVP Build Plan** — the *what* (scope, timeline, locked decisions)
> 2. **Detailed Feature Build Spec** — the *how* (per-feature engineering)
> 3. **This deck** — the *build order, repo layout, and infra setup*, mapped to what's already scaffolded
>
> If this deck disagrees with the MVP plan or the Detailed Spec, **those win**. Flag the drift, fix this doc, move on.

---

## 0. North star (one paragraph)

Ship a TestFlight-able iOS app in 14 days that does three things: phone-OTP auth, a Cash-App-style coin dashboard, and an Amika-style live camera where pointing at a snack triggers a floating coin overlay + a sub-800ms sarcastic PAL voice line. Everything serves that demo. Card issuing, real money, parent app, Android — all v2.

---

## 1. Stack lock (what is, what isn't)

| Layer | Locked choice | Why |
| --- | --- | --- |
| Mono tooling | Turborepo + pnpm 9.15.4, Node 20 LTS | Already in repo, stays |
| Mobile | Expo 52 (RN 0.76.6) + Expo Router 4 | iOS-only, OTA updates |
| Mobile state | Zustand (UI) + TanStack Query (server) | Tiny + cache layer, no Redux |
| Auth (session) | Supabase Auth → Supabase JWT | RLS-friendly, Postgres-native |
| OTP delivery | Twilio Verify | Already provisioned |
| OTP bridge | Supabase Edge Function | Wraps Twilio + issues Supabase JWT |
| DB | Supabase Postgres (`ap-southeast-2`) | Realtime, RLS |
| ORM | Drizzle | End-to-end types |
| Backend | **Hono on AWS Fargate, `ap-southeast-2`** | Sustained WSS, AU-low-latency, on $5k credits |
| Camera | `react-native-vision-camera` v4 | Native frame processors |
| Overlay | `@shopify/react-native-skia` | GPU-accelerated, 60fps |
| Animation | Reanimated v3 | Spring physics |
| Bottom sheet | `@gorhom/bottom-sheet` | Standard pick |
| Audio | `expo-av` | Streaming MP3 chunks |
| Perception | Gemini 2.0 Flash | ~300ms, structured JSON |
| Personality | Grok 4.1 reasoning via xAI (`https://api.x.ai/v1`) | Punchier than 4o-mini, OpenAI-compatible |
| TTS | ElevenLabs Flash v2.5 (voice "Charlie" or "Antoni") | ~150ms first chunk |
| Transport | WebSocket (binary frames + JSON events) | One stream up + down |
| Monitoring | Sentry (free tier) + CloudWatch | Crash + perf |
| CI | GitHub Actions | ECR push + ECS update on `main` |

**Hard region pin:** Supabase prod, Fargate task, ECR repo, ALB, CloudFront — **all** `ap-southeast-2`. One off-region service = ~200ms blown.

---

## 2. Current state of the repo (audit)

What exists today vs what the Detailed Spec § 1.1 demands.

| Area | Today | Spec target | Status |
| --- | --- | --- | --- |
| Root: `pnpm-workspace.yaml`, `turbo.json`, `package.json` | ✅ | ✅ | done |
| `apps/api/src/index.ts` (Hono + `/health`) | ✅ minimal | full HTTP + WS | 🔧 expand |
| `apps/api/Dockerfile` (multi-stage, pnpm, Fargate-ready) | ✅ | ✅ | done |
| `apps/api/src/{routes,ws,services,db}` | ❌ | ✅ | 🔧 scaffold |
| Drizzle config + schema + migrations | ❌ | ✅ | 🔧 scaffold |
| `apps/mobile/app/_layout.tsx` + `index.tsx` (placeholder) | ✅ | ✅ | done |
| `apps/mobile/app/(auth)/`, `(app)/` route groups | ❌ | ✅ | 🔧 scaffold |
| `apps/mobile/{components,lib,stores,hooks,theme}` | ❌ | ✅ | 🔧 scaffold |
| Vision-camera, Skia, Reanimated, NativeWind, expo-av, supabase-js | ❌ | ✅ | 🔧 install per day |
| `packages/shared/src/{domain,api-contract}.ts` | ✅ partial | full WS + perception | 🔧 expand |
| `packages/config/{tsconfig,prettier}` | ✅ | ✅ | done |
| `supabase/functions/{otp-start,otp-check}` | ❌ | ✅ | 🔧 scaffold |
| `supabase/migrations/0001_init.sql` | ❌ | ✅ | 🔧 scaffold |
| `supabase/config.toml` | ❌ | ✅ | 🔧 scaffold |
| `infra/` (ECS task def, README) | ❌ | ✅ | 🔧 scaffold |
| `.github/workflows/{ci,deploy-api}.yml` | ❌ | ✅ | 🔧 scaffold |
| `.env` keys present | Supabase URL, Twilio (3), Gemini, xAI | + Supabase ANON/SERVICE_ROLE, ElevenLabs (2), Sentry (2) | 🔧 fill |
| `.env.example` | ❌ | ✅ committed | 🔧 add |

This deck creates everything in the 🔧 rows in one pass. Real implementations land per the day-by-day plan in section 7.

---

## 3. Repo layout (canonical, post-scaffold)

```
brainpal/
├── apps/
│   ├── api/                          # Hono on Fargate (ap-southeast-2)
│   │   ├── src/
│   │   │   ├── index.ts              # bootstrap (Hono + WS upgrade)
│   │   │   ├── env.ts                # zod-validated process.env
│   │   │   ├── logger.ts             # pino
│   │   │   ├── routes/
│   │   │   │   ├── index.ts          # mounts all HTTP routes
│   │   │   │   ├── health.ts         # /health, /ready
│   │   │   │   ├── me.ts             # GET /me, PATCH /me
│   │   │   │   ├── wallet.ts         # GET /wallet, POST /wallet/topup, /purchase
│   │   │   │   ├── items.ts          # GET /items/:id
│   │   │   │   └── auth.ts           # POST /auth/logout (OTP lives in Supabase Edge Fns)
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts        # WS upgrade + per-connection state
│   │   │   │   ├── perception.ts     # frame → Gemini → detection state machine
│   │   │   │   ├── voice.ts          # Grok stream → ElevenLabs stream → audio chunks
│   │   │   │   └── framing.ts        # binary tag/seq framing helpers
│   │   │   ├── services/
│   │   │   │   ├── gemini.ts
│   │   │   │   ├── xai.ts            # OpenAI SDK pointed at api.x.ai/v1
│   │   │   │   ├── elevenlabs.ts
│   │   │   │   ├── twilio.ts         # only used if we move OTP off Edge Fns
│   │   │   │   └── supabase.ts       # service-role client
│   │   │   ├── db/
│   │   │   │   ├── index.ts          # drizzle client
│   │   │   │   ├── schema.ts         # users, kids, items, ledger_entries, sessions
│   │   │   │   └── queries.ts
│   │   │   └── middleware/
│   │   │       ├── auth.ts           # validates Supabase JWT
│   │   │       └── error.ts
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── Dockerfile                # already Fargate-ready
│   │
│   └── mobile/                       # Expo iOS app
│       ├── app/                      # Expo Router file-based
│       │   ├── _layout.tsx           # root: providers + auth gate
│       │   ├── (auth)/
│       │   │   ├── _layout.tsx
│       │   │   ├── phone.tsx
│       │   │   ├── otp.tsx
│       │   │   └── onboarding/
│       │   │       ├── welcome.tsx
│       │   │       ├── name.tsx
│       │   │       └── coins.tsx
│       │   └── (app)/
│       │       ├── _layout.tsx       # bottom tabs
│       │       ├── index.tsx         # dashboard
│       │       ├── camera.tsx        # fullscreen modal route
│       │       ├── topup.tsx         # modal
│       │       ├── profile.tsx
│       │       └── activity/[id].tsx
│       ├── components/
│       │   ├── BalanceCard.tsx
│       │   ├── ActivityFeed.tsx
│       │   ├── PrimaryCTA.tsx
│       │   ├── Coin.tsx              # Skia coin
│       │   └── ...
│       ├── lib/
│       │   ├── supabase.ts           # supabase-js client
│       │   ├── api.ts                # HTTP client (typed via shared)
│       │   ├── ws.ts                 # WS client (typed via shared)
│       │   └── env.ts
│       ├── stores/
│       │   ├── auth.ts               # zustand
│       │   └── camera.ts             # ephemeral UI state
│       ├── hooks/
│       │   ├── useWallet.ts          # tanstack-query
│       │   └── useDetection.ts
│       ├── theme/
│       │   └── tokens.ts             # design tokens (Spec § 1.6)
│       ├── app.json
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── shared/                       # zod schemas + types, client+server
│   │   └── src/
│   │       ├── index.ts
│   │       ├── domain.ts             # User, Kid, Item, LedgerEntry, Session
│   │       ├── api-contract.ts       # HTTP request/response zod
│   │       └── ws-contract.ts        # WS messages + binary framing tags
│   └── config/                       # tsconfig + prettier (eslint TBD)
│
├── supabase/
│   ├── config.toml                   # local dev, ap-southeast-2 alignment
│   ├── migrations/
│   │   └── 0001_init.sql             # tables + RLS (Spec § 1.4)
│   └── functions/
│       ├── otp-start/index.ts
│       └── otp-check/index.ts
│
├── infra/                            # Fargate / ECR / ALB
│   ├── README.md                     # how to provision (commands or Terraform later)
│   └── ecs-task-definition.json      # template, secrets via Secrets Manager
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # typecheck + lint on PR
│       └── deploy-api.yml            # build → ECR push → ecs update on main
│
├── docs/
│   └── build-deck.md                 # this file
│
├── .env                              # gitignored, real values
├── .env.example                      # committed template
├── .gitignore
├── .npmrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Environment matrix

Source of truth for every secret. Keys map 1:1 to `.env.example`.

| Key | Where it's read | Local | Staging | Prod | Notes |
| --- | --- | --- | --- | --- | --- |
| `SUPABASE_URL` | mobile, api, edge fns | `.env.local` | env vars | env vars | Same for everyone |
| `SUPABASE_ANON_KEY` | mobile only | `.env.local` | EAS secret | EAS secret | Client-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | api + edge fns only | `.env.local` | Secrets Manager / Supabase secrets | Secrets Manager / Supabase secrets | **Never** in mobile bundle |
| `TWILIO_ACCOUNT_SID` | edge fns | `.env.local` | Supabase secrets | Supabase secrets | |
| `TWILIO_AUTH_TOKEN` | edge fns | `.env.local` | Supabase secrets | Supabase secrets | |
| `TWILIO_VERIFY_SERVICE_SID` | edge fns | `.env.local` | Supabase secrets | Supabase secrets | |
| `GEMINI_API_KEY` | api only | `.env.local` | Secrets Manager | Secrets Manager | Fargate-only |
| `XAI_API_KEY` | api only | `.env.local` | Secrets Manager | Secrets Manager | OpenAI-compat at `https://api.x.ai/v1` |
| `ELEVENLABS_API_KEY` | api only | `.env.local` | Secrets Manager | Secrets Manager | |
| `ELEVENLABS_VOICE_ID` | api only | `.env.local` | Secrets Manager | Secrets Manager | "Charlie" or "Antoni" — **lock day 1** |
| `SENTRY_DSN_API` | api | `.env.local` | Secrets Manager | Secrets Manager | |
| `SENTRY_DSN_MOBILE` | mobile | `.env.local` | EAS secret | EAS secret | |
| `API_BASE_URL` | mobile | `http://localhost:3000` | `https://api-stg.brainpal.tech` | `https://api.brainpal.tech` | |
| `WS_URL` | mobile | `ws://localhost:3000/live` | `wss://api-stg.brainpal.tech/live` | `wss://api.brainpal.tech/live` | |

**Storage rules**

- Mobile reads `EXPO_PUBLIC_*`-prefixed vars at build time via EAS.
- API reads `process.env` validated through `src/env.ts` (zod). Boot fails loud on missing keys.
- Edge functions read via `Deno.env.get(...)` (Supabase Functions runtime).

---

## 5. Fargate plan (concrete)

Spec § 6.1 expanded into commands and resources.

### 5.1 AWS resources to provision

| Resource | Name | Region | Notes |
| --- | --- | --- | --- |
| ECR repo | `brainpal-api` | ap-southeast-2 | image tag = git SHA |
| ECS cluster | `brainpal-prod` | ap-southeast-2 | Fargate launch type |
| ECS service | `brainpal-api` | ap-southeast-2 | desired-count = 1 (v1) |
| ECS task def | `brainpal-api:N` | ap-southeast-2 | 0.5 vCPU / 1024 MB |
| ALB | `brainpal-prod-alb` | ap-southeast-2 | HTTPS-only, **stickiness ON** (cookie, 1h) |
| Target group | `brainpal-api-tg` | ap-southeast-2 | health: `/health`, 200 |
| ACM cert | `*.brainpal.tech` | ap-southeast-2 | for ALB |
| ACM cert | `api.brainpal.tech` | us-east-1 | for CloudFront (mandatory there) |
| CloudFront dist | `brainpal-api-cf` | global | origin = ALB, WS pass-through |
| Route 53 record | `api.brainpal.tech` | global | A-alias → CloudFront |
| Secrets Manager | `brainpal/prod/api` | ap-southeast-2 | JSON blob with all API secrets |

### 5.2 Sticky sessions: why + when to drop them

Spec § 6.1 calls for **ALB stickiness ON** in v1 because per-connection WS state lives in-process (`sessionState` map keyed by connection ID). Move to Redis (ElastiCache) the moment we scale to ≥2 tasks. Mark this with a **TODO comment** in `apps/api/src/ws/handler.ts` so it doesn't get forgotten.

### 5.3 Task definition (template, fill ARNs at provisioning time)

`infra/ecs-task-definition.json` ships as a template. `:NUMBER` placeholders get filled by GH Actions or manual `aws ecs register-task-definition` on first run.

### 5.4 Deployment pipeline (`.github/workflows/deploy-api.yml`)

```
git push main
  ↓
GH Actions:
  1. pnpm install --frozen-lockfile
  2. pnpm --filter @brainpal/shared build
  3. pnpm --filter @brainpal/api typecheck
  4. docker build -t $ECR_REGISTRY/brainpal-api:$SHA -f apps/api/Dockerfile .
  5. aws ecr get-login-password | docker login
  6. docker push $ECR_REGISTRY/brainpal-api:$SHA
  7. aws ecs update-service --cluster brainpal-prod \
       --service brainpal-api \
       --force-new-deployment
  ↓
ALB drains old task, shifts traffic on /health = 200
```

GH OIDC role to AWS (no static keys): set `AWS_ROLE_TO_ASSUME` repo secret; the role has narrow `ecr:*` + `ecs:UpdateService` perms only.

---

## 6. Camera connection stream (one-page reference)

Read both source docs for full detail. This is the single picture engineers should have in their head every day.

```
┌────────────────────────────── iOS (Expo) ──────────────────────────────┐
│ vision-camera frame processor (worklet)                                │
│   throttle 400ms · skip if in-flight · 384px JPEG q70                  │
│   send: [0x01][JPEG bytes]                                             │
└────────┬───────────────────────────────────────────────────────────────┘
         │  wss://api.brainpal.tech/live?token=<jwt>
         ▼
┌────────────────────── Hono on Fargate (ap-southeast-2) ────────────────┐
│ WS handler                                                             │
│   ├─ Gemini 2.0 Flash (JSON schema, temp 0)                            │
│   ├─ Hysteresis: 3 hits → appear · 5 misses → clear                    │
│   ├─ Catalog lookup (Drizzle on Postgres)                              │
│   ├─ emit JSON: detection.appeared / .updated / .cleared               │
│   └─ if speak-worthy & not on cooldown:                                │
│        ├─ play micro-ack ("oh"/"hmm") IMMEDIATELY (latency hider)      │
│        ├─ Grok 4.1 reasoning stream (reasoning_effort: low, max 60)    │
│        ├─ banned-phrase guardrail (regex)                              │
│        ├─ ElevenLabs Flash v2.5 streaming WS (Charlie/Antoni)          │
│        └─ forward audio: [0x02][uint32 seq][MP3 chunk]                 │
└────────┬───────────────────────────────────────────────────────────────┘
         │  back over the same WS
         ▼
┌────────────────────────────── iOS (Expo) ──────────────────────────────┐
│ Skia coin overlay (anchored at bbox center, spring physics)            │
│ expo-av streaming MP3 playback                                         │
│ tap coin → send `interrupt` → bottom sheet + buy → /wallet/purchase    │
└────────────────────────────────────────────────────────────────────────┘
```

**Hard latency budget recap**

- frame encode ≤50ms · upload ≤80ms · Gemini ≤350ms p50
- Coin render ≤30ms after event
- Grok TTFT (with `reasoning_effort: low`) ≤500ms p50
- **First audible PAL word ≤800ms p50**, ≤1100ms acceptable if micro-ack covers Grok thinking
- Barge-in (tap → silence) ≤100ms

**Day-9 decision gate:** if end-to-end TTFA > 1200ms with mitigations, fall back to **Grok 4 Fast (non-reasoning)** and accept slightly less witty lines.

---

## 7. 14-day execution (mapped to repo)

Same shape as MVP plan §5, but every day points at concrete files. Do **not** skip the latency-test cells (day 7, 9, 11).

### Week 1 — foundation

| Day | Goal | Files touched / created |
| --- | --- | --- |
| **1** | Repo + scaffold + this deck (✅ done by this doc) | `docs/build-deck.md`, `.env.example`, scaffolds across all packages, GH Actions skeletons |
| **2** | Twilio OTP auth end-to-end | `supabase/functions/otp-start`, `otp-check`, `apps/mobile/app/(auth)/{phone,otp}.tsx`, `lib/supabase.ts`, `stores/auth.ts` |
| **3** | DB schema + seed | `apps/api/src/db/schema.ts`, `supabase/migrations/0001_init.sql`, seed script for `items` (Coke, Mixed Nuts), API `/me` |
| **4** | Dashboard UI | `apps/mobile/components/{BalanceCard,ActivityFeed,PrimaryCTA}.tsx`, `app/(app)/index.tsx`, `theme/tokens.ts`, `hooks/useWallet.ts`, API `GET /wallet` |
| **5** | Top-up + activity detail | `app/(app)/topup.tsx`, `activity/[id].tsx`, API `POST /wallet/topup`, balance count-up via Reanimated |

### Week 2 — the hero

| Day | Goal | Files touched / created |
| --- | --- | --- |
| **6** | Camera scaffold | `app/(app)/camera.tsx`, vision-camera frame processor, JPEG encoder, permission flow |
| **7** | WS server + Gemini + hysteresis | `apps/api/src/ws/{handler,perception,framing}.ts`, `services/gemini.ts`, **real-device latency p50 logged** |
| **8** | Coin overlay (Skia) | `components/Coin.tsx`, subscribe to `detection.*`, balance chip, mic indicator, idle pulse |
| **9** | Voice pipeline (Grok + ElevenLabs) | `apps/api/src/ws/voice.ts`, `services/{xai,elevenlabs}.ts`, micro-ack assets, banned-phrase regex, **TTFA decision gate** |
| **10** | Detail card + buy | `@gorhom/bottom-sheet` integration, API `POST /wallet/purchase`, `GET /items/:id`, 30s same-item cooldown |
| **11** | Polish (haptics, barge-in, sound) | `interrupt` flow, expo-haptics, sound design pass, real-device latency sweep |
| **12** | Bug bash + first TestFlight | edge cases (offline, unknown item, perms denied), submit IPA |
| **13** | Onboarding + settings | `(auth)/onboarding/*.tsx`, `profile.tsx`, copy pass on PAL lines |
| **14** | Ship + demo video | EAS Submit final, 30s demo recorded |

---

## 8. Pre-build checklist (lock today)

Same five locks as MVP plan §6, restated so it lives in the repo.

### Decisions

- [ ] **PAL voice** — Charlie (dry British) **or** Antoni (deadpan American). Pick today; it determines `ELEVENLABS_VOICE_ID`.
- [x] **PAL tone** — sarcastic roast, Amika-style. *Already locked in MVP plan §2.*
- [ ] **Coin scale** — integer points UI, cents in DB (recommended). Confirm.
- [ ] **Demo persona** — name, age, parent-rule profile hardcoded for the demo build.
- [ ] **TestFlight app name** — "BrainPal" or "PAL".

### Accounts (need keys before day 2)

- [x] Supabase project (`ap-southeast-2`) — URL present in `.env`
- [ ] Supabase **anon** + **service-role** keys — fill `.env`
- [ ] AWS account access + Fargate cluster + ECR repo created
- [x] Twilio Verify Service SID + auth — present in `.env`
- [x] Gemini API key — present in `.env`
- [x] xAI API key — present in `.env`
- [ ] ElevenLabs API key + voice ID — fill `.env`
- [ ] Apple Developer ($99/yr) + Expo EAS project
- [ ] Sentry projects (mobile + api) + DSNs
- [ ] GitHub repo created (if not already) and AWS OIDC role wired

### Region pins (verify now, not later)

- [ ] Supabase project region = `ap-southeast-2`
- [ ] ECS cluster + service + task = `ap-southeast-2`
- [ ] ECR repo = `ap-southeast-2`
- [ ] ALB + target group = `ap-southeast-2`

---

## 9. Drift / open questions (from the spec read-through)

Issues found while reconciling MVP plan and Detailed Spec. Fix as we go.

1. **Detail-card preload is referenced but not specced.** Detailed Spec § 4.6 says `/items/:id` is "already cached from session start preload" — no preload mechanism is defined. Decision: add `GET /items` on session bootstrap and prime TanStack Query, or drop the claim and accept ~50ms fetch on tap. **Default for v1: drop the claim, accept the fetch.**
2. **WS reconnect backoff disagrees across sections.** § 1.7 says `1/2/4/8`; § 4.7 says `1/2/4`; § 5.4 says `1/2/4/8/16` capped. **Lock: `1/2/4/8/16` capped.**
3. **Latency target stated two ways.** MVP DoD = `<800ms` (hard). Detailed Spec § 4.8 = `≤800ms p50, ≤1100ms acceptable if micro-ack hides`. **Lock: ≤800ms p50 with the micro-ack tolerance up to 1100ms; anything beyond fails QA.**
4. **Audio format not pinned in code.** Set ElevenLabs `output_format: "mp3_44100_128"` and document it in `services/elevenlabs.ts`.
5. **Micro-ack assets need to exist.** Pre-render 3–5 variants of "oh"/"hmm"/"ugh" with the **same ElevenLabs voice** as PAL so the handoff sounds like one speaker. Ship as bundled audio assets in `apps/api/assets/microack/`.
6. **Multi-task scaling caveat.** In-process `sessionState` works for one Fargate task. Add a `// TODO(scale): move to Redis` comment in the WS handler so this isn't forgotten when desired-count goes >1.

---

## 10. How to use this doc

- **Every PR description** cites the section of the spec it's implementing (e.g., "Implements Detailed Spec § 4.3 perception loop").
- **Every day** starts by re-reading the relevant cell in section 7.
- **Every blocker** that reveals a spec ambiguity gets logged in section 9, decided same-day, and the spec is updated to match.
- **No code is written that contradicts this deck without updating it first.**

---

**Next concrete action:** fill the 4 missing `.env` secrets (Supabase ANON + service-role, ElevenLabs key + voice id), then start Day 2 (auth) tomorrow morning.
