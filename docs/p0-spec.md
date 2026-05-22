# BrainPay — P0 Product Specification

The complete specification for the MVP. Covers user stories, every feature in detail, the screen flows, the tech stack, and the design language we're building on.

This document is the source of truth for what we're building in the first 3 weeks. Anything here that conflicts with `build-deck.md` or `feature-catalogue.md`, this wins.

---

## Table of contents

1. [North star](#1-north-star)
2. [Decisions locked from review](#2-decisions-locked-from-review)
3. [User stories](#3-user-stories)
4. [Onboarding flow](#4-onboarding-flow)
5. [Parent feature spec](#5-parent-feature-spec)
6. [Kid feature spec](#6-kid-feature-spec)
7. [Shared / family feature spec](#7-shared-family-feature-spec)
8. [The invite system in detail](#8-the-invite-system-in-detail)
9. [The cart and checkout](#9-the-cart-and-checkout)
10. [The camera for both audiences](#10-the-camera-for-both-audiences)
11. [Foundations](#11-foundations)
12. [UI / motion language](#12-ui-motion-language)
13. [Tech stack](#13-tech-stack)
14. [Out of scope for P0](#14-out-of-scope-for-p0)

---

## 1. North star

A TestFlight-able iOS app where:

- A parent installs, signs up with their phone, sets up their persona, then optionally creates their family.
- A kid receives an invite from their parent, signs up with their phone, sets up their persona.
- The kid scans real items with the camera, gets a sarcastic AI-voiced verdict, adds to cart, and checks out (demo payment).
- The parent watches PAL's roasts in real time, tops up Brains with a hold-to-send gesture, and uses the same camera scan when shopping for the family.
- Everything feels like Rainbow Wallet — premium dark UI, vibrant accent per family member, cinematic transitions between every step.

---

## 2. Decisions locked from review

These are the choices that shape every feature below. Locked, no re-litigation:

| Decision | Choice |
|---|---|
| Onboarding entry points | **Two only**: "I'm a parent" or "I have an invite". No third "invite link" option — invite links bypass this screen entirely via deep links. |
| Family creation timing | **Optional during onboarding.** Parent can finish onboarding (phone, OTP, persona) without creating a family. Family creation is prompted on first home-screen visit if not done. |
| Step-by-step UX | **Sliding wizard.** Each onboarding step is a horizontal slide. Smooth left-right page transitions, single back button, progress dots at top. Feels like flipping cards, not navigating screens. |
| Cart + checkout | **Real flow.** Scan → add to cart → cart screen → enter amount → tap-and-pay (demo payment). Brains deducted on successful checkout, not on add-to-cart. |
| Parent camera | **Yes.** Parent can use the same camera scan, with the same PAL voice + verdict. For now identical to kid experience. (Parent-specific tone lands in P1.) |
| Push notifications | **Not in P0.** All in-app cues only. Defer to P1. |
| Currency name | **Brains** (🧠) |
| Visual reference | **Rainbow Wallet.** Dark, premium, vibrant per-account colors, big rounded avatars, generous spacing, hold-to-send gesture, slide-up modals. |

---

## 3. User stories

The same job-to-be-done, told from each angle.

### 3.1 The parent's story

> **Sarah is a 38-year-old mum of two — Jamie (12) and Riley (9). She's tired of grocery-store fights over snacks, and worried her kids don't understand money. She heard about BrainPay from a friend.**
>
> **Day 1.** Sarah installs BrainPay. She enters her phone number, gets a code, types it in. The app asks if she's a parent or has an invite. She picks parent. It asks for her name (she types "Sarah"), an avatar (picks 👩‍🦰), and her parenting style — she picks "Balanced." That's it. She's at the home screen, but it's mostly empty: "Looks like you haven't set up your family yet. Let's do it."
>
> She names her family "Smith Family", picks a 🏡 emoji. Now the home screen says "Add your first kid." She taps it.
>
> **Adding Jamie.** She enters Jamie's name, picks his age (12), picks a purple color for him, picks a 🧒 emoji. PAL asks her to pick a voice for Jamie — six options, she taps "Sarcastic robot" and PAL says "Hey, I'm PAL." She laughs. Sets Jamie's first goal — AirPods, 500 Brains. Tops him up with 100 Brains to start.
>
> Now she invites Jamie. Two options: SMS or QR. She picks SMS, types Jamie's number, sends. Done.
>
> **Day 2.** Sarah opens the app. Jamie's accepted the invite — his card is glowing on her dashboard. She sees "Jamie just scanned a Coca-Cola — skipped it. +2 🧠." She laughs out loud. She opens the PAL feed and reads ten more roasts from the day. She tops Jamie up another 50 Brains with the note "for skipping the Coke."
>
> **Day 4.** Sarah is at Coles. She points the BrainPay camera at a packet of Tim Tams. PAL says "31g sugar a serve. Not for Riley, definitely not before bed." She puts them back. She picks up oranges instead. PAL says "Real food. +12 family score."

### 3.2 The kid's story

> **Jamie is 12. His mum just told him she's installing some money app.**
>
> **The invite.** Jamie gets a text from his mum's number: "I've added you to BrainPay. Open this link." He taps it. The app installs, opens, asks his phone number, sends a code, he types it. The app says "Sarah is inviting you to Smith Family with 100 Brains. Accept?" He taps yes.
>
> **The setup.** App asks him to confirm his name, age, color, avatar, PAL voice. He tries each voice — "Cool friend" sounds like a YouTuber, "Wise wizard" sounds dumb, "Sarcastic robot" makes him laugh. He picks that one. He sets a goal: AirPods. PAL says "Sick. 500 Brains away. Let's go."
>
> **The first scan.** He goes to the kitchen, opens the camera tab. Points at a Coke. A green fog dissolves. A red ring with -10 appears around the can. PAL says: "Liquid candy in a red can. Bold. -10." Jamie taps the coin. A sheet slides up showing 39g sugar, why it's bad, what it would do to his goal. He taps "Skip it +2 🧠." A toast says "Nice. +2." He laughs.
>
> **The cart.** Later he's at school. He scans his lunch — a banana from the canteen. PAL says "Real food. +5." He taps "Add to cart." He scans a chocolate milk. PAL: "Sugar in a brown package. -8." He taps "Add to cart" anyway. Goes to the cart tab. It shows banana (+5) and milk (-8). He taps "Pay with Brains." Enters 8 (the cost). Holds the button to pay. Confetti. Brains deducted. Items in his ledger.
>
> **The streak.** Day 4. Jamie sees "🔥 4 days clean" on his home. PAL says: "Don't blow it on a Mars." Jamie scans a Mars bar. PAL: "Saw this coming. -10." Jamie skips it. Streak preserved. He's grinning.

### 3.3 The new user (no role yet)

> **Mike is Sarah's dad — Jamie's grandfather. Sarah has added him as a co-parent so he can send Brains for birthdays.**
>
> Mike installs BrainPay. Phone, OTP. The app asks "Parent or invite?" He has the invite SMS open in another window. He taps "I have an invite." Pastes the code (or scans QR if Sarah showed him in person). The app says "Sarah is inviting you to Smith Family as a co-parent." He accepts. Sets up his persona — "Grandpa", 👴 avatar, "Chill" parenting style.
>
> He's now a co-parent. Sees Jamie and Riley on his dashboard. Sends Jamie 50 Brains with note "for getting an A in maths." Done.

---

## 4. Onboarding flow

### 4.1 Master flow chart

```
Launch
  │
  ▼
Welcome → Phone → OTP
                    │
                    ▼
                Existing account? ──Yes──→ go to home (skip everything)
                    │
                    No
                    │
                    ▼
              Has pending invite? ──Yes──→ Accept invite → Persona setup → Home
                    │
                    No
                    │
                    ▼
            "Parent or have invite?"
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
    [Parent]                  [Have invite]
        │                        │
        ▼                        ▼
  Parent persona           Enter invite code OR
  (3 slides)               scan QR
        │                        │
        ▼                        ▼
  Parent home              Accept invite → Persona setup → Home
  ("set up family?")
        │
        ▼ (later, when ready)
  Family creation
        │
        ▼
  Add a kid → Invite kid
```

### 4.2 Each step in detail

#### Step 0 — Welcome
- Black background, BrainPay wordmark with subtle rainbow gradient stroke
- Single line: *"Money buddy for your family."*
- Two buttons: **Get started** (primary) and **I have an account** (text link)
- Tapping either → Phone screen

#### Step 1 — Phone
- Country picker (defaults to AU based on IP/locale)
- Phone field with auto-format
- *"We'll text you a code"* below
- Continue button is disabled until phone is valid E.164
- Slides left → next screen comes from right

#### Step 2 — OTP
- Six-digit boxed input
- Auto-submits on 6th digit
- Resend countdown (30s)
- Wrong code: shake animation, clear, allow retry (max 5)
- Slides left on success

#### Step 3 — Role selection (only if new user, no pending invite)
- Two big full-width cards stacked vertically:
  - 👨‍👩‍👧 **I'm a parent** — set up money for my kid
  - ✉️ **I have an invite** — joining my family
- No "I'm a kid" option visible. Kids always come in via invite, never via raw signup.
- Tap → that branch

#### Step 4a — Parent persona setup (sliding wizard, 3 slides)
- **Slide 1: Name.** Single field, *"What should we call you?"* Note: "Your kid will see this."
- **Slide 2: Avatar.** 6-emoji grid + upload-photo option. Picked one animates with a soft ring.
- **Slide 3: Parenting style.** Three big stacked cards (chill / balanced / strict) with a sample PAL line under each.
- Each slide has: progress dots (○ ● ○), back arrow, continue button
- Smooth horizontal slide between them with cross-fade on the back
- After slide 3 → goes to parent home (no family yet)

#### Step 4b — Invite acceptance (alternative to 4a)
- Shows the invite preview: *"Sarah is inviting you to Smith Family. They've added 100 Brains for you. Accept?"*
- Avatar + family name visible
- Single big "Accept" button + small "Decline" link
- Accepting → kid persona setup wizard (or co-parent persona for parent invitee)

#### Step 5 — Kid persona setup (only if accepting kid invite)
Sliding wizard, 6 slides:
- **Slide 1: Confirm name** (pre-filled from invite seed if parent set one)
- **Slide 2: Age** (8–17 picker)
- **Slide 3: Color** (8 vibrant hues, 4×2 grid; preview animates surrounding UI)
- **Slide 4: Avatar** (emoji grid or photo upload)
- **Slide 5: PAL voice** (6 character cards, tap to preview voice clip via ElevenLabs)
- **Slide 6: First goal** (carousel of templates + custom; skippable with "Set later")
- After slide 6 → PAL says hello in chosen voice → kid home

### 4.3 Family creation (deferred until ready)

After parent finishes persona, they land on parent home which shows:

```
[👩‍🦰 Sarah]

Welcome to BrainPay.

You haven't set up your family yet.

[ Set up family ]
```

Tapping "Set up family":
- **Slide 1: Family name** (defaults to "Sarah's Family")
- **Slide 2: Family avatar** (👪 🏡 🌳 ⭐ ✨ 🎨)
- **Slide 3: Add your first kid** (CTA, opens kid creation flow — see § 5.2)

Family creation can be deferred indefinitely. Parent can use the camera scan and chat with PAL even before adding a kid (PAL chats about generic spending).

---

## 5. Parent feature spec

### 5.1 Family dashboard (home)

```
┌────────────────────────────────┐
│ ⌃ scan          [👩‍🦰] ⋯       │
│                                │
│      [🏡 Smith Family]          │
│         topped up                │
│         $42.50                   │
│         this month               │
│                                │
│  [💸]   [🎯]   [📊]   [✉️]     │
│  Topup  Goals  Insights  Send   │
│                                │
│  YOUR KIDS                     │
│  ┌──────────────────────────┐ │
│  │ [🟣🧒] Jamie     340 🧠   │ │
│  │ 12yo · 4 events today      │ │
│  └──────────────────────────┘ │
│  ┌──────────────────────────┐ │
│  │ [🟢🧒] Riley     180 🧠   │ │
│  │ 9yo · 1 event today        │ │
│  └──────────────────────────┘ │
│  + Add another kid              │
│                                │
│  PAL'S DAILY                    │
│  "You've got 2 kids saving     │
│   well. Don't ruin it."        │
└────────────────────────────────┘
   [home] [feed] [scan] [me]
```

Every card tappable. Each kid card has the kid's color as a subtle accent.

### 5.2 Add a kid (in-family flow)

Reached from "+ Add another kid" or first-family-setup.

Same sliding wizard as kid persona setup but **filled out by the parent on behalf of the kid**:
- Name
- Age
- Color (parent picks; kid can change later)
- Avatar
- PAL voice
- Initial top-up amount

Then → invite step (SMS or QR) → kid card appears on dashboard with "pending" badge until accepted.

### 5.3 Per-kid detail screen

Tap a kid card on dashboard:

```
        [🟣🧒]
        Jamie · 12yo
        340 🧠 Brains

   [💸 Topup]  [🎯 Goal]  [⛔ Rules*]
                          *P1

   PAL'S FEED · TODAY
   🥤 Coca-Cola — skipped     +2 🧠
   "Liquid candy. Bold. −10."

   🍎 Apple — bought          +15 🧠
   "Genuinely a good shout."

   🥜 Mixed nuts — bought     +12 🧠
   "Brain food. Don't make it weird."

   GOALS
   🎧 AirPods Pro
   ████████░░ 340/500 (68%)

   THIS WEEK
   ↑ +47 🧠 earned
   ↓ −22 🧠 spent
   📊 4 categories scanned
```

Tappable rows: any PAL feed entry → expanded full quote + verdict; any goal → goal detail.

### 5.4 PAL feed (full screen)

Tab on bottom nav. Reverse-chronological stream of every PAL roast across all kids. Filterable by kid. This is the parent's "social feed" — they'll open it daily for the comedy.

```
PAL FEED                  [filter ▾]

NOW
🟣 Jamie scanned Coca-Cola
   "Liquid candy. Bold. −10."
   ↩ Skipped. +2 🧠

5 MIN AGO
🟢 Riley scanned a chocolate bar
   "Mars bars are 33g sugar. -10."
   ↻ Bought it anyway. -10 🧠

THIS MORNING
🟣 Jamie scanned mixed nuts
   "Brain food. +15."
   ✓ Bought. +15 🧠
```

### 5.5 Manual top-up

The Rainbow-style hold-to-send flow, sliding wizard:

- **Slide 1: Pick recipient** — list of kids with avatars. (Skipped if only one kid.)
- **Slide 2: Amount** — big number input, defaults to 0. Quick chips: 25, 50, 100, 500.
- **Slide 3: Note (optional)** — text field with chip suggestions: 🧹 Chores, 📚 Homework, 🌟 Just because, 🎂 Birthday.
- **Slide 4: Hold to send** — single button "Hold to send 100 🧠". Long-press 800ms fills a ring. Haptic at 0/50/100%. Releases at 100% with confetti + sound.

### 5.6 Hold-to-send gesture (component)

Reusable across the app:
- Used for: top-up, deletes, irreversible setting changes
- 800ms long-press, ring fill, escalating haptic
- Released early = abort
- Falls back to tap-and-confirm dialog if iOS reduce-motion is on

### 5.7 Add another kid

Same flow as § 5.2.

### 5.8 Parent camera (NEW for P0)

Parent has the same camera tab as kids. Identical UX:
- Fog wake animation
- Scan → traffic light coin + ring
- PAL voice (in parent's persona-style)
- Detail sheet with verdict
- Skip / Add to cart buttons

For P0 the verdict is the same logic as the kid's. Brains awarded/deducted go into a **Parent Brains pot** — a separate ledger for the parent themselves. The parent pot doesn't matter for any feature in P0 except as a ledger. (P3: round-ups, family score, etc.)

This gives the parent a feel for what their kid will experience, AND lets them scan items in shops to make decisions for the family.

### 5.9 PAL chat tab (parent)

Same as kid PAL chat but with parent context:
- Knows which kids are in the family
- Knows their balances and goals
- Can answer "is Riley saving enough?" "what's the biggest junk Jamie bought this week?"
- Tone matches parent's chosen style (chill / balanced / strict)

---

## 6. Kid feature spec

### 6.1 Home (balance dashboard)

```
┌────────────────────────────────┐
│ ⚡             [persona] ⋯     │
│                                │
│        [🟣🧒 Jamie]             │
│         340 🧠                  │ ← big, kid's color
│         Brains                  │
│                                │
│  [📷]  [🎯]  [✨]  [🛒]        │
│  Scan  Goal  PAL  Cart          │
│                                │
│  YOUR GOAL                     │
│  ┌────────────────────────┐   │
│  │ 🎧 AirPods Pro          │   │
│  │ ████████░░ 340/500      │   │
│  │ 160 Brains to go         │   │
│  └────────────────────────┘   │
│                                │
│  STREAK                         │
│  🔥 4 days clean                │
│  "Don't blow it on a Mars"     │
│                                │
│  TODAY                          │
│  🥤 skipped Coke    +2 🧠      │
│  🍎 bought apple    +15 🧠     │
│  🥜 bought nuts     +12 🧠     │
└────────────────────────────────┘
   [home] [scan] [feed] [me]
```

Bottom tabs: Home, Scan (camera), Feed (activity), Me (profile + settings).

### 6.2 Live camera scan

Already built. See `docs/camera-feature.md`.

### 6.3 PAL voice reactions

Already built.

### 6.4 Detail sheet

Already built.

### 6.5 Buy / Skip → now feeds the cart

**Skip behavior:**
- Tap "Skip it +2 🧠"
- Sheet dismisses
- +2 Brains awarded immediately (skip is real-time)
- Toast: "Nice. +2 for skipping."
- Logged in ledger as `kind = 'scan_skip_reward'`

**Add to cart behavior:**
- Tap "Add to cart [delta] 🧠"
- Sheet dismisses
- Item added to active cart (server-side, persists across sessions)
- Toast: "Added to cart"
- Cart icon in bottom tab gets a badge with item count
- **Brains NOT deducted yet** — only on checkout

### 6.6 PAL chat tab

Same shape as parent PAL chat but with kid context:
- Knows balance, goals, recent purchases, streak
- PAL voice in the kid's chosen character
- Suggestion chips on first open: "Should I buy [thing]?", "What's my goal?", "Roast my last buy", "Why am I down today?"
- History persists per kid (last 50 messages)

### 6.7 Activity feed

Tab on bottom nav. Reverse-chronological list of every event:
- Scans + decisions
- Top-ups (with parent note)
- Goal milestones
- Streak achievements
- Cart checkouts

Grouped by day. Tap row to expand for full PAL quote and item detail.

### 6.8 First goal

Set during onboarding (skippable), or from goals tab. See § 5.3 for visual.

Goal templates:
- 🎧 AirPods (500)
- 🎮 Game (1000)
- 👟 Sneakers (800)
- 📱 Phone case (200)
- 🎨 Art supplies (300)
- ✏️ Custom

Allocate Brains to goal manually or auto (P1). Goal completion → confetti + parent notified via realtime sync.

### 6.9 Streaks

Counter on home. Days of "clean choices" — defined as scanning items + not buying junk (healthScore ≤ −10).

Rewards:
- Day 3: +5 Brains
- Day 7: +20 Brains + new PAL voice unlock
- Day 14: +50 Brains
- Day 30: +200 Brains + badge

Grace day: missing 1 day per week doesn't break streak.

---

## 7. Shared / family feature spec

### 7.1 Multi-account / multi-parent

A family can have:
- 1 primary parent
- N co-parents (other parent, grandparent)
- N guardians (read-only + send Brains; full power in P1)
- N kids

All flows above work for any number of family members. Co-parents share the parent dashboard. Co-parents invite each other via the same invite system.

### 7.2 Family-first data model

(See § 11.1 for full schema.)

The single most important architectural choice: **family is the top-level entity**, not user. Every account is a member of one or more families. Every ledger row belongs to a family.

This unlocks every P3+ feature (round-ups, joint goals, family budgets) without schema rewrites.

### 7.3 Real-time sync

Supabase realtime subscriptions on:
- `ledger` filtered by `family_id` → live activity feed updates
- `goals` filtered by `family_id` → live progress
- `accounts` for the kid's persona → live profile updates
- `cart_items` → live cart sync if multi-device

When a kid skips a Coke, the parent's PAL feed updates within ~200ms.

### 7.4 In-app notification center (replaces push for P0)

A dedicated "inbox" inside the app. New events surface as a red dot on the bell icon in the top bar.

Events:
- Top-up received (kid view)
- Goal milestone hit
- Streak day achieved
- Parent: kid skipped junk, kid bought something, goal % milestones
- Cart checkout completed

No OS-level push notifications in P0. All cues are in-app.

---

## 8. The invite system in detail

This is critical to the family setup story. Worth its own section.

### 8.1 Two delivery channels

**SMS deep link:**
- Parent enters kid's (or co-parent's) phone number
- Server generates a short alphanumeric code (8 chars) + a longer signed token
- SMS sent: *"Sarah invited you to BrainPay's Smith Family. Open: brainpay.app/inv/ABC12345"*
- Recipient taps link
- App store install if not installed
- App opens with token deep-linked → invite auto-loaded

**QR code:**
- Parent shows a QR on their screen
- Recipient opens BrainPay on their device, picks "I have an invite", scans QR
- Token decoded → invite loaded

### 8.2 Token contents

Signed JWT, contents:
```
{
  invite_id: uuid,
  family_id: uuid,
  family_name: string,
  inviter_name: string,
  expected_role: 'co_parent' | 'guardian' | 'kid',
  kid_seed: { name?, age?, color?, avatar?, voice_id?, initial_topup? },  // only for kid invites, parent's preset
  expires_at: timestamp
}
```

### 8.3 Acceptance flow

1. Recipient sees invite preview screen — can decline cleanly
2. On accept: phone + OTP if not already auth'd
3. Persona wizard, pre-filled from `kid_seed` if applicable
4. Account + membership rows created server-side
5. Initial top-up applied to ledger
6. Land on home

### 8.4 Lifecycle & states

| State | Meaning |
|---|---|
| `pending` | Sent, not yet opened |
| `viewed` | Recipient opened the link/QR but didn't accept |
| `accepted` | Account created, membership active |
| `expired` | Past expires_at (default 7 days) |
| `revoked` | Parent cancelled the invite |

Parent can see all pending invites in settings → revoke any. Revoked invites become permanently unusable even if recipient still has the link.

### 8.5 Edge cases handled

- Recipient already has BrainPay account from another family → ask if they want to leave the old or join both (multiple families allowed)
- Token expired → polite error, prompt to ask for new invite
- Invite reused after acceptance → "already used" error
- Wrong number → parent revokes from settings, sends new
- QR scanned by wrong person → token still valid; but rate-limited (max 3 acceptance attempts per hour per token)
- Two parents try to add same kid → first wins, second gets "already in family"

### 8.6 Kid seed pre-fill

When the parent fills out the kid persona during "Add a kid" before sending invite, those fields are stored as `kid_seed` on the invite. When kid accepts, their persona wizard is **pre-filled** with parent's choices but **fully editable**. Kid can change name, color, avatar, voice — parent is just suggesting.

Initial top-up amount is **not editable** — parent gets to decide that.

---

## 9. The cart and checkout

### 9.1 Why a cart

Kids change their mind. Scanning one-off, then committing immediately, doesn't match how shopping works. The cart lets the kid:
- Scan many items in a session
- Compare them mentally
- Commit to all at once at "checkout"

This also gives PAL a moment to comment on the whole basket: *"Three sodas and one apple. Predictable."*

### 9.2 Cart screen

Bottom tab "🛒 Cart" with badge count.

```
┌────────────────────────────────┐
│ ← Your cart                     │
│                                 │
│  3 items · subtotal: -8 🧠      │
│                                 │
│  ┌─────────────────────────┐  │
│  │ 🍎 Apple        +5 🧠    │  │
│  │ "Real food."            X │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │ 🥛 Choc milk    -8 🧠    │  │
│  │ "Sugar in brown."       X │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │ 🧃 Juice box    -5 🧠    │  │
│  │ "Sugar with vitamins." X │  │
│  └─────────────────────────┘  │
│                                 │
│  PAL'S TAKE                    │
│  "Two drinks. One of them is   │
│   pretending to be healthy."   │
│                                 │
│  [   Pay with Brains  →   ]    │
└────────────────────────────────┘
```

Each row: emoji, name, Brains delta, PAL one-liner, swipe-to-remove.

### 9.3 Checkout flow

Tap "Pay with Brains" → sliding wizard:

#### Slide 1 — Confirm amount
Big number input. Defaults to the **price you actually paid in real life** (e.g., $8.50 for the items at the shop). Below: *"Net Brains effect: -8 🧠"*. Quick chips: $5, $10, $20, custom.

This is the demo payment moment. The kid types in what they actually spent, BrainPay computes the Brains effect from the cart's deltas (independent of the dollar amount they paid).

#### Slide 2 — Tap to pay
A single big card animation that says "Tap and Hold to Pay." Same hold-to-send gesture as parent top-up. Long-press 800ms.

```
       💳
   [Tap to pay]
   $8.50
```

#### Slide 3 — Success
Confetti, checkmark, "Paid $8.50 · -8 🧠." Brains deducted from balance. Cart cleared. Each item logged as a ledger entry with `kind = 'purchase'`.

If any item had +Brains delta (positive item), those rows are also added to the ledger.

### 9.4 Skip-from-cart

Each cart row has a "Skip instead" option (tap and hold the row). If kid changes their mind:
- Item removed from cart
- +2 Brains for skipping (only if it was a junk item)
- PAL toast: "Saved by the bell."

### 9.5 Cart persistence

- Stored server-side in `cart_items` table
- Synced via realtime to all kid devices
- Auto-expires after 24h of inactivity
- Cleared on checkout

### 9.6 No real money in P0

The "demo payment" doesn't move real money. The amount the kid types is just for their own record. All Brains math is internal. This becomes real Stripe payments in P1.

---

## 10. The camera for both audiences

The same tech, slightly different framing.

### 10.1 Kid camera

- Already documented in `docs/camera-feature.md`
- Verdicts framed as "is this a good thing for *you* to buy"
- PAL voice in kid's chosen character
- Brains delta = the kid's healthScore

### 10.2 Parent camera (NEW)

- Same camera tab in parent app
- Same UI, same fog wake, same overlay
- Verdicts framed as "is this a good thing for *the family*"
- PAL voice in parent's tone (chill / balanced / strict adapted prompt)
- Brains delta affects parent's pot, not the kids
- Detail sheet shows nutrition + family-relevant context

In P3 the parent camera evolves: round-up triggers, "Should I buy this for Riley?" mode, family score, fridge scanning. In P0 it's just the same tool with parent context.

### 10.3 Implementation

Single `CameraScreen` component, prop-driven by `accountType`:
- Different prompt to gpt-4o-mini (kid vs family framing)
- Different ledger row (`account_id` is kid or parent, `kind = 'scan_skip_reward' | 'purchase'`)
- Same WebSocket protocol, same Bedrock call

---

## 11. Foundations

### 11.1 Data model

Single source of truth. Every feature in P0–P4 fits this without schema breaks.

```sql
-- Account = one phone number = one human
accounts
  id              uuid pk
  phone           text unique not null   -- E.164
  account_type    enum('parent','kid','extended')  -- the human type, not the role
  persona         jsonb                  -- { name, avatar, color?, age?, voice_id?, style?, learned_traits[] }
  cached_balance  int default 0          -- denormalized from ledger, updated by trigger
  created_at      timestamptz
  last_seen_at    timestamptz

-- Family = the household
families
  id          uuid pk
  name        text
  avatar      text                       -- emoji
  created_at  timestamptz

-- Membership = account belongs to family with a role
memberships
  id           uuid pk
  family_id    uuid fk → families
  account_id   uuid fk → accounts
  role         enum('primary_parent','co_parent','guardian','kid')
  joined_at    timestamptz
  unique(family_id, account_id)

-- Ledger = single source of truth for every Brains movement
ledger
  id              uuid pk
  family_id       uuid fk → families
  account_id      uuid fk → accounts     -- whose balance this affects
  actor_id        uuid fk → accounts     -- who triggered it (parent for top-up, kid for scan, etc.)
  kind            enum('topup','scan_skip_reward','purchase','goal_lock','goal_unlock','streak_bonus','adjustment','cart_checkout')
  brains_delta    int                    -- can be positive or negative
  balance_after   int                    -- snapshot of balance at this moment
  metadata        jsonb                  -- { item_name, item_emoji, pal_quote, traffic_light, healthScore, dollar_amount? }
  created_at      timestamptz
  index(family_id, created_at desc)
  index(account_id, created_at desc)

-- Goals = savings targets, can be account-owned (kid) or family-owned (P3)
goals
  id              uuid pk
  family_id       uuid fk → families
  account_id      uuid fk → accounts     -- nullable for family goals (P3)
  name            text
  target_brains   int
  current_brains  int                    -- denorm; sum of ledger 'goal_lock' for this goal
  emoji           text
  status          enum('active','completed','abandoned')
  created_at      timestamptz
  completed_at    timestamptz

-- Cart items (ephemeral, expires)
cart_items
  id              uuid pk
  account_id      uuid fk → accounts     -- the kid's cart
  detection_id    text                   -- ref to the original scan
  item_name       text
  item_emoji      text
  brains_delta    int
  pal_quote       text
  metadata        jsonb
  created_at      timestamptz
  expires_at      timestamptz default now() + interval '24h'

-- Invites
invites
  id                uuid pk
  family_id         uuid fk → families
  invited_by        uuid fk → accounts
  code              text unique          -- short for SMS deep link
  token             text unique          -- signed JWT for QR
  expected_role     enum('co_parent','guardian','kid')
  kid_seed          jsonb                -- pre-filled persona for kid invites
  initial_topup     int default 0
  expires_at        timestamptz
  accepted_at       timestamptz
  revoked_at        timestamptz
  status            enum('pending','viewed','accepted','expired','revoked')

-- PAL chat history
chat_messages
  id              uuid pk
  account_id      uuid fk → accounts
  role            enum('user','assistant','system')
  content         text
  created_at      timestamptz
  index(account_id, created_at desc)
```

### 11.2 Brains balance derivation

- Authoritative: `SELECT SUM(brains_delta) FROM ledger WHERE account_id = ?`
- Cached: `accounts.cached_balance`, updated via DB trigger on ledger insert
- Reconciliation: nightly job compares cache to sum, alerts on drift

### 11.3 Real-time sync

Supabase realtime channels per family:
- Subscribe to `ledger` rows where `family_id = X`
- Subscribe to `goals` where `family_id = X`
- Subscribe to `cart_items` where `account_id = me`

Client-side: `useFamilyRealtimeSync()` hook drives all live updates.

---

## 12. UI / motion language

### 12.1 Overall feel

Rainbow Wallet's polish, BrainPay's character. Specifically:

- **Pure black or near-black backgrounds** (`#000` or `#0B0B0F`)
- **Big rounded avatars** as personality anchors at top of screens
- **One signature color per account** — kid's purple, sister's green, parent's red, follows them through every screen
- **Hero numbers** — balances are huge, single-line, no decoration
- **4-button colored action row** — each button a different vibrant hue, circular, sits below hero number
- **Generous spacing** — kids' apps fail when they feel cramped
- **Subtle bottom tab bar** — no labels by default, icons only with color when active
- **Slide-up modals** with rounded top corners (28px) and a handle at the top

### 12.2 Onboarding sliding wizard

Every multi-step flow uses the same pattern:
- Horizontal slide between steps (ease-out-cubic, 350ms)
- Progress dots at top (○ ● ○ ○)
- Single back arrow top-left
- Continue button bottom (color = active step's accent)
- Cross-fade on the back during slide
- Disabled state for continue if step is incomplete (visible but greyed)

### 12.3 Specific motion moments

| Moment | Animation |
|---|---|
| Camera open | Green fog wake fades + scales out (900ms) |
| Detection appears | Ripple ring expands + coin springs in (~500ms) |
| Detail sheet | Slide up from bottom with spring (translateY 400→0) |
| Top-up confetti | Particle burst + sound (1.2s) |
| Hold-to-send | Ring fills around button + escalating haptic |
| Goal milestone | Confetti + balance number count-up |
| Streak day +1 | 🔥 emoji bounces, ring pulses |
| Item added to cart | Item flies into bottom-right cart icon (300ms parabolic path) |
| Persona color picked | Surrounding UI elements re-tint with spring transitions |

### 12.4 Color tokens

```ts
{
  bg:        '#0B0B0F',
  surface:   '#16161D',
  surface2:  '#1F1F2A',
  text:      '#F5F5F7',
  textMuted: '#8E8E9A',

  // Traffic lights
  green:  '#3DDC84',
  amber:  '#FFB627',
  red:    '#FF5C5C',

  // Account accent palette (8 vibrant hues)
  accents: [
    '#A855F7', // purple
    '#3DDC84', // green
    '#3B82F6', // blue
    '#FB923C', // orange
    '#EC4899', // pink
    '#FACC15', // yellow
    '#EF4444', // red
    '#14B8A6', // teal
  ]
}
```

### 12.5 Typography

- Display: Inter Display (or SF Pro Display fallback)
- Body: Inter
- Sizes: hero 56, 2xl 40, xl 28, lg 20, md 16, sm 14, xs 12

---

## 13. Tech stack

### 13.1 Mobile

| Layer | Choice | Why |
|---|---|---|
| Framework | Expo SDK 54 / React Native 0.81 | Native build, OTA updates, fast iteration |
| Navigation | Expo Router 6 | File-based routing, Rainbow uses similar |
| State (UI) | Zustand 5 | Tiny, no boilerplate |
| State (server) | TanStack Query 5 | Cache + refetch out of box |
| Realtime | Supabase Realtime | Free, ap-southeast-2, scales |
| Auth | Supabase Auth + custom Twilio bridge | Phone OTP, JWT |
| Camera | expo-camera 17 | Already wired, works |
| Image processing | expo-image-manipulator 14 | JPEG resize for upload |
| Audio | expo-audio 1.1 | MP3 playback, silent-mode override |
| Animations | React Native `Animated` API | Already in use, no native build needed |
| Gestures | react-native-gesture-handler | For hold-to-send + cart swipe |
| Haptics | expo-haptics | For hold-to-send escalation |
| Secure storage | expo-secure-store | Keychain for tokens |
| Polyfills | buffer, react-native-url-polyfill | For binary frames |
| Sentry | sentry-expo | Crash reporting |

### 13.2 API server

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20 + Hono 4 | Fast, lightweight, websocket-friendly |
| Hosting | AWS Fargate, ap-southeast-2 | Already provisioned, sticky sessions |
| ORM | Drizzle 0.36 | Type-safe, lightweight |
| DB | Supabase Postgres | RLS, realtime, AU region |
| AI perception | Bedrock Nova Lite (apac) | Already wired, co-located |
| AI personality | OpenAI gpt-4o-mini | Fastest TTFT, structured JSON for verdicts |
| TTS | ElevenLabs Flash v2.5 | ~150ms first chunk |
| Logger | Pino | Fast structured logging |
| Validation | Zod 3 | Shared with mobile via packages/shared |
| Container | Docker / pnpm 9 | Already in CI |

### 13.3 Infrastructure

| Layer | Choice |
|---|---|
| Region | ap-southeast-2 (Sydney) |
| Compute | ECS Fargate, 0.5 vCPU / 1 GB |
| Load balancing | ALB, sticky sessions, HTTPS only |
| TLS | ACM cert, validated via Route 53 |
| Domain | api.zapfan.com (temp) → api.brainpay.app (later) |
| Container registry | ECR |
| Secrets | AWS Secrets Manager |
| Logs | CloudWatch |
| Errors | Sentry |
| CI/CD | GitHub Actions OIDC → ECR push → ECS update |

### 13.4 What's NEW for P0 vs current state

Already wired:
- Camera scan pipeline ✅
- Bedrock Nova Lite perception ✅
- gpt-4o-mini PAL voice + verdict ✅
- ElevenLabs streaming TTS ✅
- ECS Fargate + ALB + DNS ✅
- GitHub Actions deploy ✅

To build for P0:
- Supabase Auth + Twilio Edge Function bridge (auth)
- Sliding wizard component library (onboarding UX)
- Family-first schema migrations
- Ledger model + balance triggers
- Realtime subscriptions wiring
- Invite system (codes, tokens, deep links, QR)
- Dashboard screens (parent + kid)
- Detail sheet → cart integration
- Cart screen + checkout flow
- PAL chat tab (server endpoint + UI)
- Goal management screens
- Streak counter
- In-app inbox

### 13.5 Shared package

`packages/shared` for everything that crosses the wire:
- Zod schemas for API contract
- WS protocol types
- Domain types (Account, Family, Ledger, Goal)
- Constants (cooldowns, thresholds, traffic light bands)

---

## 14. Out of scope for P0

Explicitly punted to later phases:

| Feature | Phase |
|---|---|
| Real money via Stripe | P1 |
| Chores system | P1 |
| Multiple goals per kid | P1 |
| Spending rules & limits | P1 |
| Weekly insights & reports | P1 |
| Persona evolution / learned traits | P1 |
| Tone tuning slider | P1 |
| Push notifications | P1 |
| Card integration (kid card) | P2 |
| Card integration (parent card) | P3 |
| Round-ups | P3 |
| Joint family goals | P3 |
| Receipt scanning | P2 |
| Parent grocery scan family-aware | P3 |
| P2P friend transfers | P4 |
| Marketplace / merchant deals | P4 |

---

## 15. Build order

A practical sequence so we never block ourselves:

### Week 1 — foundations + auth
1. Migrate DB to family-first schema (drop old `users`/`kids` tables, replace with `accounts` + `memberships` + `families`)
2. Wire Supabase Auth + Twilio OTP via Edge Function
3. Build sliding wizard component
4. Onboarding flow: phone → OTP → role select → parent persona (3 slides) OR invite acceptance
5. Land on parent home (empty state) or kid home (post-invite)

### Week 2 — kids & parents in the family
1. Family creation flow (name + avatar)
2. Add-a-kid flow (kid persona setup as parent)
3. Invite system: generate codes/tokens, send SMS, generate QR, deep link handling, accept flow
4. Parent dashboard (with kid cards)
5. Kid dashboard (with balance, goal placeholder, streak placeholder)
6. Manual top-up with hold-to-send gesture
7. Realtime sync hook

### Week 3 — polish + cart + camera integration
1. Wire existing camera scan to kid account / family ledger
2. Cart screen + add-to-cart from detail sheet
3. Checkout flow with demo payment
4. Goal management (set, view, allocate)
5. Streak counter
6. Activity feed (kid + parent)
7. PAL chat tab
8. Parent camera (re-use kid camera with `accountType` prop)
9. PAL feed for parent
10. Polish, motion tuning, on-device latency sweep
11. TestFlight build

---

## Appendix A — Screen inventory

Every distinct screen in P0:

**Auth & onboarding (shared)**
- Welcome
- Phone entry
- OTP entry
- Role select ("Parent" / "Have invite")

**Parent onboarding wizard (3 slides)**
- Persona name
- Persona avatar
- Parenting style

**Family creation wizard (3 slides)**
- Family name
- Family avatar
- Add first kid CTA

**Kid persona wizard (6 slides)**
- Confirm name
- Age
- Color
- Avatar
- PAL voice picker
- First goal

**Invite acceptance**
- Invite preview
- Decline confirmation modal

**Parent app**
- Family dashboard (home)
- Per-kid detail
- PAL feed (full screen)
- Top-up wizard (4 slides)
- Add-a-kid wizard (reuses kid persona wizard)
- Invite send (SMS or QR picker)
- Camera (same as kid)
- PAL chat
- Profile / settings

**Kid app**
- Home (balance dashboard)
- Camera (scan)
- Detail sheet (modal)
- Cart screen
- Checkout wizard (3 slides)
- Activity feed
- Goal detail
- PAL chat
- Profile / settings

**Shared**
- In-app inbox
- Family settings
- Account settings

---

## Appendix B — Glossary

- **Brains (🧠)** — BrainPay's currency. 1 Brain ≈ 1 cent (P1+).
- **Family** — top-level entity, one household.
- **Account** — one phone number, one human.
- **Membership** — links an account to a family with a role.
- **Persona** — the evolving JSON describing how an account presents and behaves.
- **PAL** — the AI character, voice + personality. Configurable per account.
- **Traffic light** — green / amber / red signal on scan results.
- **Hold-to-send** — signature gesture for irreversible actions.
- **Streak** — consecutive days of "clean" choices.
- **Cart** — temporary list of items added from scan, committed on checkout.
- **Ledger** — every Brains movement, immutable, source of truth for balance.
