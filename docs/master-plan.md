# BrainPal — Master Plan (Agent-First Family Payments)

> One document: what we have, what we need, how the pieces fit, and the order we build them.
> Design language: clean light fintech, **Greenlight-style** (teal/green primary, white cards, soft shadows,
> family-member switcher) + multi-Pal companions (BrainPal reference). Refs: Greenlight dashboard, Fineteek kit.

---

## 1. The one-line vision

**An agent-first family money app.** The chat (the Pals) is the center of the product — not a side feature.
You *talk* to BrainPal, and a council of specialist agents (MoneyPal, HealthPal, StudyPal) collaborate to
guide spending, saving, chores, and learning. Everything else (card, history, investing, maps, chores) is a
surface the agents can read from and act on.

---

## 2. What we already have (verified in code)

| Area | Status | Where |
|---|---|---|
| Phone OTP auth (JWT, SecureStore) | ✅ Working | `(auth)/phone`, `otp`, `stores/auth.ts` |
| Voice persona onboarding (OpenAI Realtime/WebRTC) | ✅ Working* | `(auth)/voice-onboard`, `hooks/useRealtimeWebRTC` |
| Parent + Kid dashboards | ✅ Working | `screens/ParentHome`, `KidHome` |
| Chores: create / submit / AI-verify / approve / payout | ✅ Working | `parent-chores`, `chores`, `chore-verify` |
| Wallet (Brain Points ledger, realtime) | ✅ Working | `hooks/useWallet`, `useRealtimeWallet` |
| Scan → traffic-light verdict + reward | ✅ Working | `(app)/camera.tsx` (WebSocket frames) |
| Single PAL chat (intent confirm cards) | ✅ Working | `(tabs)/pal.tsx` + `/chat` API |
| Top-up (Stripe / Apple Pay) + NFC checkout | ✅ Working | `topup`, `checkout-nfc` |
| Goals (savings targets) | ✅ Working | `(app)/goals` |
| Family & Safety (people + SOS) | ⚠️ Partial | `family-safety` — map + SOS are stubs |
| Light fintech theme + Moti animations + Lottie | ✅ Done | `theme/tokens`, `components/ui` |

\*Voice onboarding needs a dev build (WebRTC native module), not Expo Go.

## 3. What's missing (your wishlist → gaps)

| You want | Today | Plan |
|---|---|---|
| Clean UI everywhere | Light reskin done; inconsistent component use | Standardize on a small component kit; rebuild screens against it |
| Land directly on dashboard after onboarding | ✅ Already does | Keep; tighten the persona→dashboard handoff |
| **Visa card on dashboard** (named, premium UI) | ❌ None (only an NFC card visual) | New `<PayCard>` component + card detail screen |
| **Payment history** | ❌ Only "today's activity" | New **Transactions** screen from the ledger |
| **Maps** (family location) | ⚠️ Placeholder box | Real map (`react-native-maps`) + live member pins |
| **Dummy investing** | ❌ None | Educational "Grow" module (fake portfolio + chart) |
| **Multi-Pal collaboration** | ❌ Single PAL | Orchestrator + specialist agents (§5) |
| **Chat as the center** | A tab among others | Promote to primary surface; agents drive actions |

---

## 4. Information architecture (clean rewrite)

**Chat is the center**, wrapped in Greenlight's clean dashboard. Bottom bar centers on the raised Pals button.

**Parent tabs:** `Home` · `Accounts` · **`Pals`(center, raised)** · `Chores` · `Safety`
**Kid tabs:** `Home` · `Grow` · **`Pals`(center, raised)** · `Missions` · `Scan`

- **Home** — family-member switcher + Visa card + quick actions + 2×2 stat grid + "Recommended for your family".
- **Accounts / Grow** — card detail + full history (parent); dummy investing (kid).
- **Pals** — the council chat (center button, biggest target).
- **Chores / Missions** — chores list + create/approve.
- **Safety** — map + members + SOS.

### 4.1 Home layout (from the Greenlight reference)
1. **Family-member switcher** — avatar row (`Family · <Kid1> · <Kid2>`) with a teal underline on the selected.
2. **Quick actions** — 3 big rounded buttons: filled primary (`Send money`) + outlined (`Share to get paid`, `Profile`).
3. **"Manage <kid>'s card"** row — card thumbnail + `*last4 · unlocked` + chevron → **Card detail** (our Visa card entry).
4. **2×2 stat grid** — `Spending` / `Saving` / `Chores` / `Allowance`: green icon + label, big value, muted subtitle.
5. **"Recommended for your family"** — horizontal carousel (Pal suggestions / setup nudges).

Onboarding (unchanged path): `welcome → phone → otp → role-select → voice-onboard (persona) → dashboard`.

---

## 5. The Pal system (the core — most important)

### 5.1 Roster
- **BrainPal** — the orchestrator / face. Talks to the user, routes to specialists, synthesizes one answer.
- **MoneyPal** — balance, affordability, saving, goals, top-ups, spending coaching.
- **HealthPal** — nutrition/health angle of scans, sugar/snack guidance.
- **StudyPal** — homework streaks, study missions, learning rewards.

### 5.2 Collaboration model (how they "work together")
```
user msg ──▶ BrainPal (router)
                │  decides which Pal(s) are relevant (tool/function calling)
                ├─▶ MoneyPal.answer()   (tools: getWallet, getGoals, createChore, topUp…)
                ├─▶ HealthPal.answer()  (tools: getScanVerdict, getHealthLog…)
                └─▶ StudyPal.answer()   (tools: getStreak, createStudyMission…)
                │
                ▼
        BrainPal composes a single reply + optional "council" cards
```
- Each Pal = a system prompt + a **scoped tool set** (server functions). Shared **tool layer** wraps the
  existing endpoints (`/wallet`, `/goals`, `/chores`, scan verdicts).
- **Council UI:** in chat, replies can show multiple Pal chips (e.g., scan a Coke →
  *HealthPal: 35g sugar today* + *MoneyPal: affordable, but +1 day to your bike goal*). Matches the
  scan-result card in the reference.
- **Action confirmation:** any write action (create chore, top up, set goal, "invest") returns an intent
  card the user confirms — extend the existing `/chat/execute` pattern.

### 5.3 API shape (extends current `/chat`)
- `POST /chat` → `{ reply, pals: [{ id, line }], intent?, requiresConfirmation }`
- `POST /chat/execute` → runs a confirmed intent via the tool layer.
- Orchestration lives server-side (`apps/api`) so prompts/tools stay off-device.

---

## 6. Feature specs (build targets)

### 6.1 Visa card (`<PayCard>`)
- Premium gradient card: cardholder name, brand mark (Visa), `•••• last4` (dummy), balance, chip.
- Parent = family card; Kid = their BrainPal card (persona color accent).
- Tap → **Card detail**: freeze toggle (dummy), limits, and that card's history.

### 6.2 Transaction history (**the missing piece**)
- New `Transactions` screen: filter tabs (All / Sent / Received / Chores / Scan / Top-up), grouped by day,
  merchant/category icon, +green / −orange amounts. Backed by the **existing wallet ledger** (no new data
  needed to start). Search + month picker later.

### 6.3 Maps
- `react-native-maps` (requires dev build). Family members as pins from member persona/location; tap a pin →
  member sheet. Kid `family-safety` reuses it. (Live location needs a location-reporting endpoint — phase 3.)

### 6.4 Dummy investing ("Grow")
- Educational, **no real brokerage**. A few fake instruments (e.g., "Tech Fund", "Green Fund"), kid allocates
  Brain Points, value drifts with a seeded random walk, simple growth chart. Teaches concept; clearly labeled
  "practice money".

### 6.5 Chores creation
- Already works; in the rewrite, surface "Create chore" both in the parent UI **and** via MoneyPal/StudyPal in
  chat ("StudyPal, add a 20-min reading mission for Aarav, ₹10").

---

## 7. Data model additions
- **cards**: `id, ownerAccountId, brand, last4, name, color, frozen` (dummy issuer to start).
- **transactions/history**: reuse `ledger` entries; add `category` + `merchant` metadata for nicer history.
- **investments**: `accountId, instrument, units, costBasis` + a price series (seeded).
- **pals / chat_sessions**: `messages` already exist; add `palId` per assistant message for council UI.
- **locations** (phase 3): `accountId, lat, lng, updatedAt` for live map.

---

## 8. UI system (clean rewrite foundation)
- **Palette (Greenlight-style, update `theme/tokens.ts`):** primary dark-teal `#0E7C66`, bright green `#2FBF8F`
  (icons/success), bg mint-white `#F2F6F4`, surface `#FFFFFF`, text `#16201D`, muted `#7C8B86`, negative `#FF7A3D`.
- Keep the primitives (`components/ui.tsx`: Screen/Card/FadeIn/Stagger/AppLottie).
- Add to the kit: **`PayCard`, `FamilySwitcher`, `QuickActionButton`, `ManageCardRow`, `StatTile`, `TxnRow`,
  `PalChip`, `CouncilCard`, `SegmentedTabs`, `Carousel`, `Sheet`, `Chart`**.
- Rule: every screen built only from kit components → guaranteed consistency = "clean".
- Icons: lucide (UI) + Simple Icons (merchants). Animations: Moti (transitions) + a Lottie success asset.

---

## 9. Build phases (order of work)

**Phase 0 — Foundation (1)**
- Finalize component kit (§8). Lock nav/IA (§4). Add a real Lottie success asset.

**Phase 1 — Dashboard + money surfaces**
- `PayCard` on Home. **Transactions history** screen wired to ledger. Card detail.

**Phase 2 — Chat as center (the differentiator)**
- Promote Pals to the center tab. Build the orchestrator + MoneyPal/HealthPal/StudyPal with the shared tool
  layer. Council reply UI + intent confirmation.

**Phase 3 — Family + maps**
- Real map, member pins, location reporting, finish Safe/SOS with a backend.

**Phase 4 — Grow (dummy investing)**
- Instruments, allocation, seeded chart, kid-friendly framing.

**Phase 5 — Polish**
- Empty/loading/error states, haptics, sounds, accessibility, perf pass.

---

## 10. Decisions I need from you
1. **Investing**: pure simulation (recommended for now) vs. round-ups from real spend?
2. **Visa card**: purely visual/dummy issuer for v1, or wire a real card program later?
3. **Maps**: ship a dev build now (needed for `react-native-maps` + WebRTC), or keep Expo Go + static map for v1?
4. **Pals scope for v1**: ship BrainPal + MoneyPal first, add HealthPal/StudyPal in phase 2.2?
5. The missing **design image** — paste it so the card/history visuals match exactly.

---

## 11. Definition of "done / everything working"
- Onboard with phone OTP → voice persona → land on dashboard.
- Dashboard shows a great Visa card + balance; tapping it shows full history.
- Chat is the center; asking a question pulls in the right Pal(s) and can take real actions (chore, top-up, goal)
  behind a confirm.
- Chores, scan, maps, and dummy investing all reachable and functional.
- One consistent light UI built entirely from the component kit.
