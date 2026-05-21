# BrainPal — MVP Build Plan (Auth + Dashboard + Camera)

<aside>
⚡

**TL;DR** — Three features only: mobile auth, a payment-style dashboard, and the Amika-style live camera. ~2 weeks of focused build to a demo-able iOS app. Everything else (card issuing, stablecoin, real payments, parent app) is deliberately deferred.

</aside>

## 1. Scope lock

**In scope (v1):**

- [x]  Mobile auth — phone number + OTP via Twilio Verify
- [x]  Dashboard — wallet balance, recent activity, "add funds" CTA, payment-style UI (Cash App / Revolut feel)
- [x]  Camera — live VLM perception, floating coin overlay, PAL voice reaction in <800ms

**Out of scope (v2+):**

- ❌ Real card issuing (Marqeta / Cuscal)
- ❌ Stablecoin settlement
- ❌ Real top-up via Stripe (fake with a button)
- ❌ Separate parent app
- ❌ Voice **in** from kid (push-to-talk) — voice-out only
- ❌ Android (iOS-only, iPhone 12+)
- ❌ Custom ML model training
- ❌ Multi-object shelf detection (single-item Amika-style for v1)

## 2. The three things, defined

### 🔐 Auth — phone OTP via Twilio

Dead simple. Two screens, one flow.

- **Screen 1**: enter phone number (default `+61` for AU, but international-friendly for demo testing)
- Tap continue → Twilio Verify sends a **6-digit SMS code**
- **Screen 2**: enter the 6-digit code → verified → logged in
- Resend code after 30s, max 3 resends per 10 min (Twilio rate-limits this for free)
- Auto-fill from iOS SMS keyboard suggestion (built-in, just needs the right `textContentType`)
- On first login → onboarding (3 screens: "meet PAL", "set your name", "you start with 100 coins")
- Single hardcoded "kid" role for v1. No parent role yet.

**How the OTP wiring works:**

1. Client posts `{ phone }` to a **Supabase Edge Function** (`/auth/otp/start`) → function calls **Twilio Verify** `Services/{sid}/Verifications` → SMS sent
2. Client posts `{ phone, code }` to `/auth/otp/check` → function calls Twilio Verify `Services/{sid}/VerificationCheck`
3. On `approved`, the Edge Function uses the **Supabase Admin API** to find-or-create a user keyed by phone and issues a **Supabase JWT** → client stores it, hits the rest of the API authenticated

Why this shape: Twilio handles SMS + fraud + retries, Supabase handles the session + RLS + Postgres. No password storage, no email deliverability headaches, and the kid can sign in on a brand-new phone with just their number.

### 💸 Dashboard (the payment-style screen)

This is what the user opens the app to. Think **Cash App home screen × kid energy.**

```
┌─────────────────────────────────┐
│  Hey Sara 👋        ⚙️          │
│                                 │
│   💰  245 coins                 │  ← big, bold, the hero number
│   ━━━━━━━━━━━━━━━━━━            │
│                                 │
│   [  📷  Scan & earn  ]         │  ← primary CTA → camera
│   [  💵  Add funds    ]         │  ← secondary (fake for v1)
│                                 │
│   This week                     │
│   ────────────                  │
│   🥜  Mixed Nuts        +15     │
│   🥤  Coca-Cola         −10     │
│   🥤  Water              +8     │
│                                 │
│   ━━━━━━━━━━━━━━━━━━            │
│   [Home]  [Pal]  [You]          │
└─────────────────────────────────┘
```

**Components:**

- Coin balance card (big, animated count-up on change)
- Two CTAs: scan, add funds
- Activity feed (last 10 events from the ledger)
- Bottom tab bar: Home / Pal (chat with PAL) / You (profile)

**Visual language:** rounded cards, bright accent green, big numbers, kid-friendly type (Inter Display or Geist).

### 📷 Camera (the hero)

Amika-style, single-item v1.

- Open camera → fullscreen camera feed
- Point at a product → ~700ms later, a coin floats over it + PAL voice reacts
- Tap the coin → expands to detail card (product name, why this score, "buy" button)
- Buy button → fake-deducts from wallet, returns to dashboard with updated balance

**v1 supports 2 products only:**

- 🥤 Coca-Cola 375ml can → **−10 coins**
- 🥜 Coles Mixed Nuts 150g → **+15 coins**

Same architecture scales to thousands of products later — just expand the backend product DB.

### 🎙️ PAL voice & tone (locked: **sarcastic roast**, Amika-style)

PAL is **not** a nanny. PAL is **not** cheerful. PAL is the friend in your group chat who clocks every bad decision and says it out loud.

**The reference is Amika** — dry, witty, slightly mean to the *product*, never mean to the *kid*. Think *Anthony Bourdain reviewing a vending machine.*

**Voice rules (locked into the system prompt):**

- Always **roast the product, hype the kid** — the kid is in on the joke, the product is the punchline
- Max **15 words per line**. If you need more, you're explaining. Don't explain.
- Lead with a **reaction word** ("ugh," "oh no," "absolutely not," "okay but")
- **Specificity > vague** — "39g of sugar" beats "lots of sugar." Numbers land harder than adjectives.
- **One emoji max**, and only when it earns its place
- **Never preachy.** No "you should," no "maybe try," no "remember that…" — ban those phrases outright
- **Never mean to the kid.** No "you idiot," no "why would you," no shaming the choice itself

**Example lines (these go in the prompt as few-shot examples):**

| Sees | PAL says |
| --- | --- |
| 🥤 Coca-Cola 375ml | "Oh, the classic 10-teaspoons-of-sugar starter pack. Minus 10." |
| 🥤 Coca-Cola 375ml | "Liquid candy in a red can. Bold choice. −10 coins." |
| 🥤 Coca-Cola 375ml | "Ugh. Your dentist just felt a disturbance. −10." |
| 🥜 Coles Mixed Nuts | "Okay, brain food. Didn't know you had it in you. +15." |
| 🥜 Coles Mixed Nuts | "Protein, fats, zero regret. Big +15. Don't make it weird." |
| 🥜 Coles Mixed Nuts | "Genuinely a good shout. +15. Carry on." |
| 🚫 Unknown item | "Don't know that one. Suspicious. Try again." |
| 💰 On "buy" confirmation | "Done. Wallet noted. Your past self is judging you." |

**PAL system prompt (v1, drop straight into Grok 4.1 via xAI's OpenAI-compatible endpoint at `https://api.x.ai/v1`):**

```
You are PAL — a sarcastic, dry-witted money buddy for kids aged 10-14.
Your job: react to what the kid is about to buy in 1 sentence (max 15 words).
End every line with the coin change (+N or −N).

Tone: roast the product, never the kid. Think Anthony Bourdain reviewing a
vending machine. Dry, observational, slightly mean about the item itself.

HARD RULES:
- Max 15 words. Count them.
- Never use: "you should", "maybe try", "remember that", "it's important".
- Never call the kid stupid, dumb, lazy, or any variant. The kid is the friend.
- Lead with a reaction word: "oh", "ugh", "okay", "absolutely", "genuinely".
- One emoji max. Usually zero.
- Use real numbers when you have them ("39g sugar", not "lots of sugar").
```

**Voice selection (ElevenLabs):**

- **Recommended**: stock voice **"Charlie"** (British, dry, slightly bored — perfect for sarcasm) or **"Antoni"** (American, deadpan)
- Avoid: anything labeled "cheerful," "warm," "friendly" — wrong vibe entirely
- Set ElevenLabs **stability: 0.3** (lower = more expressive/sassy), **style: 0.6** (higher = more attitude)

**Guardrail (server-side filter before TTS):**

Reject and regenerate if the line contains: `should`, `must`, `remember`, `important`, `careful`, `dangerous`, or exceeds 15 words. One retry, then fall back to a templated line. Prevents PAL from ever drifting into nanny-mode if the model has a bad day.

<aside>
⚠️

**Latency note on Grok 4.1 reasoning:** Reasoning models generate hidden thinking tokens *before* the first visible token. Expected first-token latency is **~400–800ms** vs. ~100ms for GPT-4o-mini. End-to-end time-to-first-audio may push from ~750ms to **~1100–1400ms** — over our <800ms budget.

**Mitigations to try on day 9 (in order):**

1. Set `reasoning_effort: "low"` (or `"minimal"` if available) — cuts thinking budget hard for one-liners.
2. Play a **micro-ack** ("oh", "hmm", "ugh") *immediately* on detection, before Grok finishes thinking. Hides the reasoning latency.
3. If still over budget: fall back to **Grok 4 Fast** (non-reasoning) and accept slightly less witty lines.
</aside>

## 3. Tech stack (locked, minimal)

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile framework | **Expo (React Native)** | Fastest iteration, OTA updates |
| Navigation | **Expo Router** | File-based, deep links work |
| State | **Zustand** | Tiny, no boilerplate |
| Auth (session) | **Supabase Auth** | JWT sessions, RLS, integrates with Postgres |
| OTP delivery | **Twilio Verify** | SMS OTP — already set up ✅, fraud protection + retries built-in |
| OTP bridge | **Supabase Edge Function** | Wraps Twilio Verify `start` / `check`, issues Supabase JWT on success |
| Database | **Supabase Postgres** | users, kids, items, ledger_entries + Realtime |
| Camera | **react-native-vision-camera v4** | Native-thread frame processors |
| Overlay | **react-native-skia** | GPU-accelerated, 60fps |
| Animation | **Reanimated v3** | Spring physics for coin float |
| Audio playback | **expo-av** | Streams audio chunks from server |
| Backend | **Hono on AWS Fargate** (`ap-southeast-2`) | Sustained WebSockets, AU low-latency, uses your $5k credits |
| ORM | **Drizzle** | Type-safe end-to-end |
| Perception LLM | **Gemini 2.0 Flash** | ~300ms, cheap, no training needed |
| Personality LLM | **Grok 4.1 (reasoning)** via xAI | Punchier, dryer roast quality than GPT-4o-mini; OpenAI-compatible API; reasoning tokens add latency (see note below) |
| TTS | **ElevenLabs Flash v2.5** | ~150ms first chunk, you have the key |
| Transport | **WebSocket (binary + JSON)** | Streams frames up, audio + events down |
| Monitoring | **Sentry (free tier)** | Crash + error tracking |

## 4. Architecture (one diagram)

```jsx
┌────────────────────────────────────────────┐
│ 📱 EXPO APP                                │
│                                            │
│  Auth (Supabase)                           │
│   ↓                                        │
│  Dashboard (Zustand state, Supabase data)  │
│   ↓ tap "Scan & earn"                      │
│  Camera screen                             │
│    • vision-camera captures frames @400ms  │
│    • sends over WebSocket                  │
│    • receives:                             │
│        - detection JSON → Skia coin overlay│
│        - audio chunks   → speaker          │
└────────────────┬───────────────────────────┘
                 │ wss://api.brainpal.tech/live
                 ▼
┌────────────────────────────────────────────┐
│ ☁️ BACKEND (Hono on Fargate, ap-southeast-2)│
│                                            │
│  WebSocket handler                         │
│   ↓ frame in                               │
│  Gemini Flash (perception)                 │
│   ↓ {items: [{name, conf}]}                │
│  Coin score lookup (Postgres)              │
│   ↓ emit detection event                   │
│  If speak-worthy →                         │
│   Grok 4.1 stream    → ElevenLabs stream   │
│   ↓ emit audio chunks                      │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│ 🗄️ POSTGRES (Supabase)                     │
│  users, kids, items, ledger_entries        │
└────────────────────────────────────────────┘
```

## 5. Day-by-day build plan (14 days)

### Week 1 — foundation

| Day | Focus | Deliverable |
| --- | --- | --- |
| 1 | Repo + Expo scaffold | Monorepo (Turborepo), `apps/mobile` runs on simulator, `packages/api` skeleton |
| 2 | Supabase + Twilio OTP auth | Phone → SMS code → JWT. Edge Function bridges Twilio Verify. Login → dashboard placeholder |
| 3 | Postgres schema + seed | `users`, `kids`, `items`, `ledger_entries` tables. Seed Coke + Mixed Nuts |
| 4 | Dashboard UI | Coin balance card, two CTAs, activity feed, bottom tabs. Wired to Supabase |
| 5 | "Add funds" fake flow + activity feed | Tap → modal → +100 coins → ledger entry → balance updates with count-up |

### Week 2 — the hero

| Day | Focus | Deliverable |
| --- | --- | --- |
| 6 | Camera scaffold | Vision Camera renders preview fullscreen. Frame processor captures 384px JPEG every 400ms |
| 7 | Backend WebSocket + Gemini | Hono WS server on Fargate. Receives frame, calls Gemini Flash, returns detection JSON |
| 8 | Coin overlay (Skia) | Floating coin renders over detected item, spring physics, fade in/out, hysteresis (3 frames to add, 5 to remove) |
| 9 | Personality LLM + TTS streaming | Grok 4.1 reasoning streams reaction → ElevenLabs streams audio → client plays chunks as they arrive. **Benchmark first-token latency vs. budget on day 9.** |
| 10 | Tap-to-expand detail card + buy | Tap coin → modal with product info + buy button. Buy deducts coins, logs entry, returns to dashboard |
| 11 | Polish: micro-acks, barge-in, haptics, sound design | App feels alive. Sub-800ms confirmed on real iPhone + real Wi-Fi |
| 12 | Bug bash + edge cases | Network drops, app backgrounded, low confidence, unknown items |
| 13 | Demo content + onboarding | First-launch onboarding (3 screens). PAL voice persona dialed in. Settings screen stub |
| 14 | Ship to TestFlight + record demo | Internal TestFlight build. 30-second demo video shot at home with real Coke + Nuts |

**End-of-week-2 deliverable:** an iPhone app where you sign in, see your balance, tap "Scan & earn," point at a Coke → coin appears + PAL voice reacts → tap "buy" → balance updates, activity feed shows the entry. **Investor- and partner-demoable.**

## 6. Pre-build checklist (lock before day 1)

### Accounts + keys you need ready

- [ ]  **Supabase** project created in `ap-southeast-2` (Sydney)
- [ ]  **AWS** account, Fargate cluster in `ap-southeast-2`, ECR repo for the API image
- [ ]  **Google AI Studio** → Gemini API key with billing enabled
- [ ]  **xAI** API key (for Grok 4.1 reasoning) — OpenAI-compatible endpoint at `https://api.x.ai/v1`
- [ ]  **ElevenLabs** API key (already have ✅) + voice ID for PAL
- [ ]  **Twilio** Verify Service SID (already set up ✅), AU sender configured, sandbox numbers added for dev
- [ ]  **Expo (EAS)** account + project, iOS provisioning profile
- [ ]  **Apple Developer** account ($99/yr) — needed for TestFlight
- [ ]  **Sentry** free-tier project
- [ ]  **GitHub** repo (`brainpal/app`)

### Decisions to lock

- [x]  **PAL voice & tone** — **locked: sarcastic roast, Amika-style.** Stock ElevenLabs voice "Charlie" (dry British) or "Antoni" (deadpan American). Full spec in section 2.
- [ ]  **Coin scale** — integer points (`+15`, `−10`) shown to user, cents stored in DB. *Recommended.*
- [ ]  **Demo kid persona** — name, age, parent-rule profile hardcoded for the demo build
- [ ]  **Region pinning** — confirm every service is `ap-southeast-2` (Supabase, AWS, Fargate). One wrong region = 200ms blown
- [ ]  **App name in TestFlight** — "BrainPal" or "PAL"

## 7. Definition of done (for the demo)

The v1 ships when **all of these are true**:

- [ ]  Phone OTP auth works end-to-end (enter phone → receive SMS → enter 6-digit code → signed in → sign out)
- [ ]  iOS auto-fill of SMS code works on a real device
- [ ]  Dashboard shows live balance from Supabase
- [ ]  "Add funds" modal adds 100 coins, balance count-up animates
- [ ]  Camera detects Coca-Cola and Mixed Nuts reliably at arm's length
- [ ]  First coin overlay renders in ≤500ms after pointing at item
- [ ]  First audible PAL word in ≤800ms (measured on real iPhone, real Wi-Fi)
- [ ]  Tap a coin → detail card → buy → balance updates → activity feed updates
- [ ]  Barge-in works (tap screen → PAL stops mid-sentence within 100ms)
- [ ]  App installable via TestFlight on a fresh iPhone
- [ ]  30-second demo video recorded and uploaded

## 8. Cost reality

**Build phase (2 weeks):**

- AWS Fargate (small task, ap-southeast-2): ~$30 for the build period (covered by $5k credits)
- Supabase Free tier: $0
- Gemini, Grok 4.1, ElevenLabs: <$15 in dev usage (Grok reasoning is pricier per token than GPT-4o-mini)
- Apple Developer: $99 (annual)
- **Total cash out: ~$100**

**Per-session at runtime:** ~$0.15–0.20 (Gemini + Grok 4.1 reasoning + ElevenLabs combined; Grok reasoning tokens add ~$0.02–0.07 vs. GPT-4o-mini). Still trivial for demo. Will optimize at scale.

## 9. Risks + mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Latency blows past 800ms | Medium | Region-pin to `ap-southeast-2`, test on real Wi-Fi early (day 7), not just simulator |
| Gemini bbox quality poor | Low (single-item v1) | Render coin at frame center, not at bbox. Bbox only matters in multi-item v1.1 |
| Apple TestFlight review delay | Medium | Submit on day 12, not day 14. Buffer for rejections |
| PAL tone reads as preachy or mean | Medium | Server-side guardrail rejects nanny-phrases (`should`, `must`, `remember`…). Test 20 lines with 2–3 actual kids in week 2 — if any line lands as mean-to-kid, tighten the system prompt |
| Wi-Fi unstable mid-demo | High | Pre-record fallback demo video on day 13 as backup |

## 10. After the demo (v1.1 → v2)

Once the demo lands and you have signal (co-founder interest, fund interest, partner interest), the natural next steps:

1. **Multi-item shelf detection** — turn on the bbox-anchored coin overlay for full shelves
2. **Scale product DB** — add top 500 AU supermarket SKUs
3. **Real parent app** — split into parent + kid experiences, parent funds the kid wallet
4. **Real top-up via Stripe AU** — replace the fake "add funds" button
5. **Parent rules engine** — sugar caps, blocked categories, daily limits
6. **Card issuing partner conversation** — Cuscal / EML / Hay
7. **Ledger hardening** — double-entry, immutable journal, audit trail
8. **Stablecoin settlement R&D** — only after the kid-side product is loved

---

**Next action:** lock the 5 decisions in section 6, get the 9 accounts set up, then day 1 begins.