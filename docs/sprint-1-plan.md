# MoneyPal — Sprint 1 Complete Plan
> Phase 1 · VC Demo Build · Target: 3 weeks to TestFlight

---

## Table of Contents

1. [Vision & North Star](#1-vision--north-star)
2. [The 5-Minute VC Demo](#2-the-5-minute-vc-demo)
3. [Currency Model](#3-currency-model)
4. [Design System & UI Language](#4-design-system--ui-language)
5. [Icon System](#5-icon-system)
6. [Auth Features](#6-auth-features)
7. [Onboarding — PAL Avatar](#7-onboarding--pal-avatar)
8. [Parent Features](#8-parent-features)
9. [Kid Features](#9-kid-features)
10. [PAL AI System](#10-pal-ai-system)
11. [Infrastructure & API](#11-infrastructure--api)
12. [Database Schema Changes](#12-database-schema-changes)
13. [Push Notifications](#13-push-notifications)
14. [NFC Card Payment](#14-nfc-card-payment)
15. [Family Location (Find My)](#15-family-location-find-my)
16. [Task Breakdown & Build Order](#16-task-breakdown--build-order)
17. [Out of Scope for Sprint 1](#17-out-of-scope-for-sprint-1)

---

## 1. Vision & North Star

MoneyPal is BrainPal's first major wedge: a PAL-led youth and family money system.
Sprint 1 delivers a **fully working, demo-ready app** that shows the complete governed loop:

> Parent loads money → Kid earns Brains → Kid scans products → AI verifies chores →
> Kid pays with NFC card → Parent sees everything → PAL narrates it all with voice.

**What makes this different from every other kids money app:**
- AI avatar onboarding (PAL talks to you)
- Camera-verified chores (AI approves or rejects)
- Voice-first interface (speak to do anything)
- NFC card checkout (tap a physical card to pay)
- Real-time parent oversight with PAL commentary

---

## 2. The 5-Minute VC Demo

This is the exact sequence shown to investors. Every step is real — no mocks.

| # | Scene | Duration | Wow factor |
|---|---|---|---|
| 1 | PAL avatar talks during onboarding | 30s | AI face speaks to the kid |
| 2 | Parent tops up via Apple Pay | 45s | Real Stripe sandbox, Face ID |
| 3 | Parent voice-creates a chore | 30s | Speak → preview → confirm |
| 4 | Kid verifies chore with camera | 45s | AI approves the photo |
| 5 | Kid scans products at canteen | 45s | PAL roasts the Coke |
| 6 | Kid taps NFC card to checkout | 30s | Physical card, confetti |
| 7 | Parent asks PAL "how's Jamie?" | 30s | Voice response with stats |

**Total: ~5 minutes. Zero mocks. Everything real.**

---

## 3. Currency Model

Two completely separate things on screen:

### Real Money (AUD)
- Parents load via **Stripe Apple Pay** (sandbox in Sprint 1)
- Shown to parents only: *"$10.00 loaded"*
- Kids **never** see dollar amounts
- Conversion: **$1 AUD = 100 🧠** (1 cent = 1 Brain)

### Brains (🧠)
- The gamification points layer
- Kids earn by: healthy scans, skipping junk, completing chores, streaks
- Kids spend by: cart checkout (NFC tap)
- Shown everywhere in the kid's UI
- Chore rewards are 🧠 only — no real money moves for chores

### Separation Rules
| Action | AUD moves | 🧠 moves |
|---|---|---|
| Parent top-up via Stripe | ✅ Yes | ✅ Yes (converted) |
| Kid cart checkout (NFC) | ❌ No | ✅ Yes (deducted) |
| Chore payout | ❌ No | ✅ Yes |
| Scan skip reward | ❌ No | ✅ Yes |
| Streak bonus | ❌ No | ✅ Yes |


---

## 4. Design System & UI Language

### Core Principles
- **Dark mode first** — deep blue-black base, not pure black
- **Glassmorphism cards** — frosted glass with subtle border glow
- **Per-kid accent colors** — every kid has their own color that tints their entire UI
- **Heavy numbers** — balances are statements, not labels
- **Everything animates** — no instant cuts, everything springs or slides

### Color Tokens
```
Background:     #0A0A0F   deep blue-black
Surface:        #141420   card backgrounds
Surface 2:      #1E1E2E   elevated surfaces
Border:         #2A2A3E   subtle dividers
Text:           #FFFFFF
Text Muted:     #6B7280
Accent:         #A855F7   default purple

Kid accent palette:
  Purple:   #A855F7
  Green:    #3DDC84
  Blue:     #3B82F6
  Orange:   #FB923C
  Pink:     #EC4899
  Yellow:   #FACC15

Traffic lights:
  Green:    #3DDC84
  Amber:    #F59E0B
  Red:      #EF4444
```

### Typography
- Balance numbers: 56–72px, weight 900, letter-spacing -2
- Section headers: 12px, weight 700, uppercase, letter-spacing 1.2
- Body: 16px, weight 500
- Muted: 14px, weight 400, color Text Muted

### Bottom Tab Bar
Five tabs. Center tab is a raised floating circle (scan button).
```
[🏠 Home]  [📋 History]  [📷 SCAN]  [💬 Chat]  [👤 Me]
                              ↑
                    56×56 purple circle, elevated
```
- Active: accent color icon + label
- Inactive: #6B7280
- Center scan: purple gradient circle, white icon, drop shadow

### Motion Language
| Interaction | Animation |
|---|---|
| Screen transition | Horizontal slide, 300ms, ease-out-back |
| Modal slide up | Spring, tension 80, friction 9 |
| Balance update | Animated number counter |
| Chore approved | Confetti burst + scale-up checkmark |
| NFC tap detected | Card flash white → ripple → confetti |
| PAL typing | Three pulsing dots (TypingBubble component) |
| Streak milestone | Full-screen celebration overlay, 2s |
| Mic recording | Real-time waveform bars |

### Card Style (Glassmorphism)
```
background: linear-gradient(135deg, accent + '33', accent + '11')
border: 1px solid accent + '44'
border-radius: 20px
backdrop-filter: blur(20px)
```

---

## 5. Icon System

Random emojis look like a prototype. Every UI control, navigation element, and status indicator uses **Lucide icons** — the same icon set used by Linear, Vercel, and Raycast.

### Library

```bash
pnpm add lucide-react-native --filter @brainpal/mobile
```

Clean stroke-based icons. Consistent weight. Fully customizable size, stroke width, and color. Tree-shakeable.

### Standard Usage

```tsx
import { Home, Wallet, Sparkles, Flame } from 'lucide-react-native'
import { tokens } from '@/theme/tokens'

// Default
<Home size={24} color={tokens.color.text} strokeWidth={1.5} />

// Active / selected
<Home size={24} color={tokens.color.accent} strokeWidth={2} />

// Muted / inactive
<Home size={24} color={tokens.color.textMuted} strokeWidth={1.5} />

// Hero / decorative
<Wallet size={48} color={tokens.color.accent} strokeWidth={1.0} />
```

### Stroke Width Convention

| Context | strokeWidth |
|---|---|
| Default UI elements | `1.5` |
| Active / selected states | `2.0` |
| Large decorative / hero icons | `1.0` |

### Icon Size Tokens

Add to `apps/mobile/theme/tokens.ts`:

```typescript
iconSize: {
  xs:   16,   // badge / status indicators
  sm:   18,   // input field icons
  md:   20,   // list row icons
  lg:   22,   // action row buttons
  xl:   24,   // tab bar
  hero: 48,   // empty states / hero sections
}
```

### Complete Icon Map

**Bottom Tab Bar**

| Tab | Lucide Icon |
|---|---|
| Home | `Home` |
| History | `History` |
| Scan (center, raised) | `ScanLine` |
| Chat | `MessageCircle` |
| Me / Profile | `CircleUser` |

**Parent Action Row**

| Action | Lucide Icon |
|---|---|
| Top Up | `CircleArrowUp` |
| Chores | `ClipboardList` |
| PAL Chat | `Sparkles` |
| Invite | `UserPlus` |

**Kid Action Row**

| Action | Lucide Icon |
|---|---|
| Scan | `Camera` |
| Goals | `Target` |
| PAL | `Sparkles` |
| Cart | `ShoppingBag` |

**Navigation & Controls**

| Element | Lucide Icon |
|---|---|
| Back | `ArrowLeft` |
| Close / dismiss | `X` |
| More options | `Ellipsis` |
| Settings | `SlidersHorizontal` |
| Notifications | `Bell` |
| Search | `Search` |
| Filter | `Filter` |
| Add / create | `Plus` |

**Wallet & Money**

| Element | Lucide Icon |
|---|---|
| Wallet / balance | `Wallet` |
| Add money | `CirclePlus` |
| Send | `Send` |
| Transaction | `ArrowLeftRight` |
| Card / Stripe | `CreditCard` |
| NFC tap | `Wifi` |
| Cash / AUD | `Banknote` |
| Coins / Brains | `Coins` |

**Chores**

| Element | Lucide Icon |
|---|---|
| Chore list | `ListChecks` |
| Add chore | `Plus` |
| Pending | `Clock` |
| Submitted | `Upload` |
| AI approved | `ShieldCheck` |
| AI rejected | `ShieldX` |
| Parent approved | `CircleCheck` |
| Parent rejected | `CircleX` |
| Paid out | `Coins` |
| Camera verify | `Camera` |
| Retry | `RotateCcw` |
| Escalate to parent | `UserCheck` |

**PAL / AI**

| Element | Lucide Icon |
|---|---|
| PAL avatar | `Bot` |
| Thinking / loading | `LoaderCircle` |
| Voice / mic | `Mic` |
| Mic off | `MicOff` |
| Sound on | `Volume2` |
| Sound off | `VolumeX` |
| AI / sparkle | `Sparkles` |

**Goals & Progress**

| Element | Lucide Icon |
|---|---|
| Savings goal | `Target` |
| Goal complete | `Trophy` |
| Progress trend | `TrendingUp` |
| Allocate Brains | `CircleArrowDown` |

**Streaks & Rewards**

| Element | Lucide Icon |
|---|---|
| Active streak | `Flame` |
| Streak at risk | `FlameKindling` |
| Bonus / zap | `Zap` |
| Badge | `Award` |
| Milestone | `Star` |

**Status & Feedback**

| Element | Lucide Icon |
|---|---|
| Success | `CircleCheck` |
| Error | `CircleX` |
| Warning | `TriangleAlert` |
| Info | `Info` |
| Loading spinner | `Loader` |

**Traffic Lights (camera scan)**

Replace colored emoji circles with `Circle` icon + `fill` prop:

```tsx
// Green — good product
<Circle size={16} color="#3DDC84" fill="#3DDC84" />

// Amber — caution
<Circle size={16} color="#F59E0B" fill="#F59E0B" />

// Red — bad product
<Circle size={16} color="#EF4444" fill="#EF4444" />
```

### Where Emojis Still Belong

Not everything gets replaced. Keep emojis for content, not controls:

| Use case | Why keep |
|---|---|
| Food items in cart (apple, drink) | No icon equivalent for specific foods |
| Kid / parent avatars | Personal identity, expressive |
| Family avatar | Decorative, one-off |
| Savings goal items (headphones, game) | Product representation |
| PAL's spoken reactions in text | Part of PAL's personality |

**Rule of thumb:** If it's a UI control, action, or status → Lucide icon. If it's content or identity → emoji is fine.

---

## 6. Auth Features

### Already Built (reuse as-is)
- Phone number entry with country picker (AU/NZ/US/UK/IN)
- OTP via Twilio Verify — 6-digit, auto-submit on 6th digit
- BrainPal JWT minted on success, stored in SecureStore
- Route gating: authed → (app), unauthed → (auth)
- Deep link invite handling: `brainpay://inv/CODE`
- Wrong code: shake animation, 5 retry max

### New in Sprint 1
- `PATCH /me/push-token` — store Expo push token on first login
- Push permission request on first app open

### Auth Screen Layouts

**Welcome Screen**
```
Full black screen
◈ MoneyPal wordmark — rainbow gradient stroke, centered
Slow aurora animation behind wordmark
"Money buddy for your family." — 32px, 800 weight
[Get started] — full-width pill, purple
[I have an account] — text link, muted
```

**Phone Screen**
```
← back
"What's your number?" — 32px, 800 weight
"We'll text you a code." — muted
[🇦🇺 +61] [412 345 678 input] — side by side
[Continue →] — disabled until valid E.164
```

**OTP Screen**
```
← back
"Enter the code we sent to +61 412..."
[_][_][_][_][_][_] — 6 boxes, accent border on active
Auto-submits on 6th digit
"Resend in 28s" — countdown timer
Wrong code: boxes shake left-right, clear
```


---

## 7. Onboarding — PAL Avatar

The single biggest VC wow moment. Runs once per new user.

### Technology
- **Tavus** AI video avatar — PAL's face talks to the user in real time
- Fallback: ElevenLabs audio + Lottie animated character (if Tavus setup takes too long)
- PAL reacts to each onboarding choice with a spoken line

### Parent Onboarding Flow

**Avatar Screen (Tavus)**
```
[PAL's face — Tavus video, rounded corners, 16:9]
● ● ●  animated speaking indicator
"Hey! I'm PAL — your family's money buddy."
Live transcript shown below video
[Let's go →] — appears after PAL finishes speaking
```

**Slide 1 — Name**
```
○ ● ○  progress dots
"What should your kids call you?"
[Sarah                    ] — large text input
"Your kids will see this" — muted hint
[Continue →]
```

**Slide 2 — Avatar**
```
"Pick your avatar"
3×2 emoji grid: 👩‍🦰 👨 👴 👩 🧑 👵
Selected: accent ring + scale-up animation
Large preview of selected emoji
[Continue →]
```

**Slide 3 — Parenting Style**
```
"How do you roll?"
Three full-width cards:
  [😎 Chill    | "Eh, it's just Coke"]
  [⚖️ Balanced | "39g sugar. Think."]   ← selected: accent border
  [🎯 Strict   | "Absolutely not."]
PAL speaks the sample line when each card is tapped
[Continue →]
```

### Kid Onboarding Flow (via invite only)

**Avatar Screen**
```
[PAL's face]
"Hey! Your mum added you. I'm PAL — your money buddy."
[Let's go →]
```

**Slide 1 — Name** (pre-filled from invite seed)
**Slide 2 — Age** (8–17 wheel picker)
**Slide 3 — Color** (8 vibrant hues, 4×2 grid — UI tints to match selection live)
**Slide 4 — Avatar** (emoji grid)
**Slide 5 — PAL Voice**
```
6 character cards in a horizontal scroll:
  [🤖 Sarcastic Robot]  [😎 Cool Friend]
  [🧙 Wise Wizard]      [🔥 Hyped Coach]
  [🏄 Chill Surfer]     [💅 Sassy Auntie]
Tap to preview — PAL speaks a sample line in that voice
Selected: accent border + checkmark
```

**Slide 6 — First Goal**
```
"What are you saving for?"
Goal template carousel:
  🎧 AirPods Pro — 5,000 🧠
  🎮 New Game — 10,000 🧠
  👟 Sneakers — 8,000 🧠
  📱 Phone Case — 2,000 🧠
  ✏️ Custom — enter your own
[Set later] — skip link
```

After slide 6: PAL says hello in chosen voice → kid home with confetti

---

## 8. Parent Features

### 7.1 Parent Home Dashboard

```
┌─────────────────────────────────┐
│  ⌃ scan              [👩‍🦰]      │  top bar: scan shortcut + avatar
│                                 │
│  ┌───────────────────────────┐  │
│  │  🏡 Smith Family          │  │  glassmorphism hero card
│  │                           │  │  purple gradient
│  │       2,340 🧠            │  │  56px, weight 900
│  │       across 2 kids       │  │  muted subtitle
│  └───────────────────────────┘  │
│                                 │
│  [💸 Top Up] [📋 Chores] [💬 Chat] [✉️ Invite]
│                                 │
│  YOUR KIDS                      │  uppercase, muted, 12px
│                                 │
│  ┌───────────────────────────┐  │
│  │▌ [🟣🧒] Jamie  12yo       │  │  left accent bar = kid's color
│  │  1,340 🧠 · 3 events today│  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │▌ [🟢🧒] Riley  9yo        │  │
│  │  1,000 🧠 · 1 event today │  │
│  └───────────────────────────┘  │
│  ＋ Add another kid              │
│                                 │
│  PAL'S DAILY                    │
│  ┌───────────────────────────┐  │
│  │ 🤖 "Two kids saving well. │  │  italic, PAL quote
│  │    Don't ruin it."        │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 7.2 Top-Up Wizard (Stripe Apple Pay)

4-slide bottom sheet. Drag handle at top.

**Slide 1 — Pick Kid** (skipped if one kid)
```
"Who are you topping up?"
[🟣🧒 Jamie] [🟢🧒 Riley]  — large cards, tap to select
```

**Slide 2 — Amount**
```
"Top up Jamie"
         $10              — huge editable number, center
      → 1,000 🧠          — conversion shown below, muted
[$5] [$10] [$20] [$50]    — quick chips, pill shape
[Continue →]
```

**Slide 3 — Note (optional)**
```
"Add a note?"
[🧹 Chores] [📚 Homework] [🌟 Just because] [🎂 Birthday]
[Type your own...]
[Continue →]
```

**Slide 4 — Apple Pay**
```
"Sending $10 to Jamie"
"Just because 🌟"
[◼ Pay $10.00]            — native Apple Pay button (black)
"Double-click to confirm" — muted hint
```

On success: confetti + push to Jamie + balance updates live.


### 7.3 Chores (Parent View)

**Chore List Screen**
```
← Chores                    [+ Add]

AWAITING APPROVAL
┌─────────────────────────────┐
│ [📸 photo] Take out bins    │  thumbnail on left
│            Jamie · 50 🧠   │
│            AI: ✅ Approved  │  AI verdict badge (green/red)
│  [Approve ✓]  [Reject ✗]   │  action buttons
└─────────────────────────────┘

PENDING (kid hasn't done yet)
┌─────────────────────────────┐
│ 🧹 Clean room               │
│    Jamie · 30 🧠            │
│    Waiting for kid          │
└─────────────────────────────┘

COMPLETED TODAY
┌─────────────────────────────┐
│ ✅ Homework done            │
│    Riley · 20 🧠 · Paid     │
└─────────────────────────────┘
```

**Voice Chore Creation**
- Parent holds mic button in chat or chores screen
- Says: *"Add a chore for Jamie — clean his room — 30 Brains"*
- PAL transcribes + parses intent via GPT-4o-mini
- Preview card appears:
```
┌─────────────────────────────┐
│ 📋 New Chore                │
│                             │
│ Clean his room              │  — title
│ Jamie · 30 🧠               │  — assignee + reward
│                             │
│ [✓ Confirm]  [✏️ Edit]      │
└─────────────────────────────┘
```
- Confirm → chore appears on Jamie's app instantly via Supabase Realtime

**Manual Chore Creation (text fallback)**
```
← Add Chore

[Clean your room          ]  — title input
[Jamie ▾]                    — kid picker
[30 🧠 ▾]                    — reward picker (10/20/30/50/100/custom)
[Save Chore]
```

### 7.4 PAL Chat (Parent)

Full-screen chat with voice capability.

```
PAL Chat                    [🔊 voice on]

┌─────────────────────────────┐
│ 🤖 Hey Sarah. Jamie earned  │  PAL bubble — left, surface bg
│    52 Brains this week and  │
│    skipped 3 junk items.    │
└─────────────────────────────┘

                ┌─────────────┐
                │ How's Riley?│  user bubble — right, accent bg
                └─────────────┘

┌─────────────────────────────┐
│ 🤖 Riley bought a banana    │
│    (+5🧠) and skipped a     │
│    Coke. Good day overall.  │
└─────────────────────────────┘

[🎤 Hold to speak...  |  Type here...]
```

**Voice mode:** Hold mic → waveform animation → release → PAL responds in voice + text.

**Confirmable actions** (PAL shows preview card for):
- Add chore → `[Confirm] [Edit]`
- Top up a kid → `[Confirm] [Edit]`
- Set savings goal → `[Confirm] [Edit]`

**PAL knows:**
- All kids' balances and goals
- Recent scans and purchases
- Chore status
- Streak lengths
- Weekly summaries

### 7.5 Kid Detail Screen (Parent)

Tap any kid card on dashboard.

```
← Back

[🟣🧒]  Jamie · 12yo
1,340 🧠  ·  $13.40 loaded this month

[💸 Top Up]  [📋 Add Chore]

PAL'S FEED · TODAY
🥤 Coca-Cola — skipped     +2 🧠
   "Liquid candy. Bold."
🍎 Apple — bought          +5 🧠
   "Real food. Carry on."
🧹 Bins — AI verified ✅   +50 🧠

SAVINGS GOAL
🎧 AirPods Pro
████████░░  1,340 / 5,000  (27%)
3,660 🧠 to go

CHORES
✅ Take out bins  +50 🧠  Paid
⏳ Clean room     30 🧠   Pending

THIS WEEK
↑ +102 🧠 earned
↓ −13 🧠 spent
🔥 1 day streak
```

### 7.6 PAL Feed (Parent)

Reverse-chronological stream of every kid event.

```
PAL FEED                    [filter ▾]

NOW
🟣 Jamie scanned Coca-Cola
   "Liquid candy. Bold. −10."
   ↩ Skipped. +2 🧠

5 MIN AGO
🟢 Riley scanned chocolate bar
   "33g sugar. −10."
   ↻ Bought it anyway. −10 🧠

THIS MORNING
🟣 Jamie — bins verified ✅
   AI approved. +50 🧠 pending
```

### 7.7 Camera (Parent)

Same camera as kid. PAL reacts in parent's chosen tone.
Brains go to parent's own pot (separate from kids).


---

## 9. Kid Features

### 8.1 Kid Home Dashboard

```
┌─────────────────────────────────┐
│  ⚡                  [🧒] ···   │  streak lightning + avatar
│                                 │
│  Hey Jamie 👋                   │
│                                 │
│  ┌───────────────────────────┐  │
│  │                           │  │  glassmorphism card
│  │        1,340 🧠           │  │  kid's accent color, 56px, 900w
│  │        Brains             │  │
│  │                           │  │
│  │  ████████░░  27%          │  │  goal progress bar inside card
│  │  🎧 AirPods · 3,660 to go │  │
│  └───────────────────────────┘  │
│                                 │
│  🔥 1 day clean                 │  streak row
│  "Don't blow it on a Mars"      │  PAL line, italic, muted
│                                 │
│  TODAY                          │
│  ┌───────────────────────────┐  │
│  │ 🥤 Skipped Coke   +2 🧠  │  │
│  │ 🍎 Bought apple   +5 🧠  │  │
│  │ 🧹 Bins done      +50 🧠 │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
   [🏠]  [📋]  [📷]  [💬]  [👤]
```

### 8.2 Camera & Scanning

**Live camera screen:**
```
[Live camera preview — full screen]

[Fog wake animation on open]

Product detected:
  ● Traffic light coin overlay (🟢🟡🔴)
  ● Ring around product
  ● PAL voice reaction streams in

Detail sheet slides up on tap:
  Product name + emoji
  Nutrition summary: "39g sugar, 0 protein, 330ml"
  Why bad/good: "That's 2x your daily sugar limit"
  Estimated price: "$3.50"
  Traffic light: 🔴 Red
  [Skip it +2 🧠]  [Add to cart]
```

**Skip:** +2 🧠 instant, toast "Nice. +2 for skipping.", ledger row written.
**Add to cart:** item queued, Brains NOT deducted yet, cart badge increments.

### 8.3 Cart Screen

```
← Your cart              3 items

┌─────────────────────────────┐
│ 🍎 Apple        +5 🧠    × │  swipe left to remove
│ "Real food."               │
└─────────────────────────────┘
┌─────────────────────────────┐
│ 🥛 Choc milk    −8 🧠    × │
│ "Sugar in brown."          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ 🤖 PAL's take:              │  PAL basket comment
│ "One good, one bad.         │
│  Predictable."              │
└─────────────────────────────┘

Net: −3 🧠

[💳 Pay with card →]          primary CTA, full-width pill
```

### 8.4 NFC Checkout Flow

**Step 1 — Enter amount**
```
← Checkout

How much did you spend?

         $3.50             — large editable number
[$2] [$3.50] [$5]          — quick chips

[Continue →]
```

**Step 2 — NFC tap screen**
```
← Checkout

┌─────────────────────────────┐
│                             │
│   ◈ MoneyPal                │  BrainPal card graphic
│                             │  purple glassmorphism
│   ░░░░░░░░░░░░░░░░░░░░░░   │  chip graphic
│                             │
│                      ·))   │  NFC symbol — pulsing glow
│                             │
│   JAMIE                     │
│   •••• •••• •••• 4242       │
│                             │
└─────────────────────────────┘

Tap your card to pay         — pulsing text
● ● ●  Waiting for tap...    — animated dots
```

**On NFC detected:**
- Card flashes white
- Haptic vibration (heavy)
- Confetti burst
- Transition to success screen

**Step 3 — Success**
```
✅

Paid $3.50

Net −3 🧠
Balance: 1,337 🧠

[confetti animation]

[Done]
```

Brains deducted, ledger written, cart cleared, parent notified.

### 8.5 Chores (Kid View)

```
← Chores

MY CHORES

⏳ Take out bins          50 🧠
   Tap to verify →

⏳ Clean room             30 🧠
   Tap to verify →

✅ Homework done          20 🧠
   Paid · Yesterday
```

### 8.6 Camera Chore Verification

Tap any pending chore → camera opens.

**Verification screen:**
```
← Take out bins
50 🧠 reward

[Live camera — full width]

Point at your completed chore

[📸 Verify chore →]
```

**After capture — AI thinking:**
```
[Static photo shown]

🤖 PAL is checking...      — TypingBubble animation
```

**Approved:**
```
✅ Bins are outside!       — green, large, spring animation

+50 🧠 incoming            — animated counter
Waiting for mum to confirm

[confetti]
```

**Rejected:**
```
❌ Hmm, not quite          — red

"The bins are still        — AI reason, italic
 inside the garage."

[Try again]  [Ask parent]  — two equal buttons
```

**Ask parent flow:**
- Photo sent to parent with push notification
- Parent sees photo + AI reason + [Approve] [Reject]
- Kid sees "Sent to mum for review ⏳"

### 8.7 PAL Chat (Kid)

Same layout as parent chat. Kid-toned responses.

**Suggestion chips on first open:**
```
[What's my balance?]
[How far to AirPods?]
[Roast my last buy]
[Should I buy this Coke?]
```

**Voice mode:** Hold mic → speak → PAL responds in kid's chosen voice persona.

**PAL knows:**
- Balance and goal progress
- Recent scans and purchases
- Streak status
- Chore status

### 8.8 Savings Goals

```
← My Goals

🎧 AirPods Pro
████████░░  1,340 / 5,000
3,660 🧠 to go · ~73 days at current pace

[+ Allocate Brains]        — manual allocation

[+ Add new goal]
```

Goal completion: confetti + PAL speaks congratulations + parent notified.

### 8.9 Streaks

Counter on home. Days of clean choices (scanning + not buying junk).

| Milestone | Reward |
|---|---|
| Day 3 | +5 🧠 |
| Day 7 | +20 🧠 + new PAL voice unlock |
| Day 14 | +50 🧠 |
| Day 30 | +200 🧠 + badge |

Grace day: 1 miss per week doesn't break streak.


---

## 10. PAL AI System

### 9.1 Voice Pipeline

```
User holds mic
    ↓
OpenAI Whisper (speech-to-text, ~300ms)
    ↓
GPT-4o-mini intent parser
    → { intent: 'add_chore', params: { title, assignee, reward } }
    → { intent: 'query_balance', params: { kid } }
    → { intent: 'topup', params: { kid, amount } }
    → { intent: 'chat', params: { message } }
    ↓
GPT-4o-mini response generator (persona-aware)
    ↓
ElevenLabs Flash v2.5 (text-to-speech, <400ms first chunk)
    ↓
Audio plays + text shown simultaneously
```

### 9.2 Confirmable Intents

When PAL detects an action intent, it shows a preview card before executing:

```
┌─────────────────────────────┐
│ 📋 Add Chore                │
│                             │
│ Clean his room              │
│ Jamie · 30 🧠               │
│                             │
│ [✓ Confirm]  [✏️ Edit]      │
└─────────────────────────────┘
```

Intents that require confirmation:
- Add chore
- Top up a kid
- Set savings goal
- Approve/reject chore

Intents that execute immediately (no confirmation):
- Query balance
- Query recent activity
- Roast a product
- Streak status

### 9.3 Camera Vision

**Product scanning (existing):**
- Amazon Bedrock Nova Lite
- Returns: name, category, nutrition, traffic light, PAL quote

**Chore verification (new):**
- GPT-4o Vision
- Prompt: *"A kid says they completed this chore: [chore title]. Look at this photo and decide if it's done. Return JSON: { verdict: 'approved' | 'rejected' | 'uncertain', reason: string (max 15 words) }"*
- `approved` → Brains credited (pending parent confirmation)
- `rejected` → reason shown, retry or escalate
- `uncertain` → escalated to parent automatically

### 9.4 PAL Voice Personas

| Persona | ElevenLabs Voice | Tone |
|---|---|---|
| 🤖 Sarcastic Robot | ELEVENLABS_VOICE_ID_SARCASTIC | Dry, observational, slightly mean about products |
| 😎 Cool Friend | ELEVENLABS_VOICE_ID_COOL | Casual, big-brother energy, hypes good picks |
| 🧙 Wise Wizard | ELEVENLABS_VOICE_ID_WISE | Calm, patient, explains like a teacher |
| 🔥 Hyped Coach | ELEVENLABS_VOICE_ID_HYPED | High-energy, celebrates every correct pick |
| 🏄 Chill Surfer | ELEVENLABS_VOICE_ID_CHILL | Laid-back, low-stakes vibe |
| 💅 Sassy Auntie | ELEVENLABS_VOICE_ID_AUNTIE | Gossipy, warm, sassy |

Default fallback: Sarcastic Robot (existing `ELEVENLABS_VOICE_ID`).

### 9.5 PAL Context (per role)

**Parent PAL knows:**
- All kids in family (names, ages, balances, goals)
- Recent scan activity across all kids
- Chore status for all kids
- Weekly summaries
- Tone: matches parent's chosen style (chill/balanced/strict)

**Kid PAL knows:**
- Own balance and goal progress
- Own recent scans and purchases
- Own streak status
- Own chore status
- Tone: matches kid's chosen voice persona

---

## 11. Infrastructure & API

### New API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/wallet` | kid/parent | Balance + last 50 ledger entries |
| `POST` | `/wallet/topup` | parent | Credit Brains to kid (internal, no Stripe) |
| `POST` | `/payments/topup-intent` | parent | Create Stripe PaymentIntent for AUD top-up |
| `POST` | `/payments/webhook` | Stripe | Confirm payment → credit Brains |
| `POST` | `/chores` | parent | Create a chore |
| `GET` | `/chores` | parent/kid | List chores for family |
| `PATCH` | `/chores/:id` | parent/kid | Update status (done/approved/rejected) |
| `POST` | `/chores/:id/verify` | kid | Submit photo → GPT-4o Vision → verdict |
| `POST` | `/chat` | any | PAL chat (text + voice intent parsing) |
| `PATCH` | `/me/push-token` | any | Store Expo push token |

### Already Built (keep as-is)
- `POST /auth/otp/start` — send OTP
- `POST /auth/otp/check` — verify OTP, mint JWT
- `GET /me` — current account
- `GET /family` — family + members
- `POST /family` — create family
- `POST /invites` — create invite
- `POST /invites/accept` — accept invite
- `POST /payments/topup-intent` ✅
- `POST /payments/webhook` ✅

### Real-time Subscriptions (Supabase)

| Table | Filter | Who subscribes | Purpose |
|---|---|---|---|
| `ledger` | `family_id` | parent + kid | Live balance updates |
| `chores` | `family_id` | parent + kid | Live chore status |
| `inbox` | `account_id` | parent + kid | Live notifications |
| `goals` | `family_id` | parent + kid | Live goal progress |


---

## 12. Database Schema Changes

### New Table: `chores`

```sql
create table public.chores (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  assigned_to         uuid not null references public.accounts(id) on delete cascade,
  created_by          uuid not null references public.accounts(id) on delete restrict,
  title               text not null,
  reward_brains       int not null check (reward_brains > 0),
  status              text not null default 'pending'
                      check (status in ('pending','submitted','ai_approved','ai_rejected',
                                        'ai_uncertain','parent_approved','parent_rejected','paid')),
  verification_photo  text,          -- storage URL of submitted photo
  ai_verdict          text,          -- 'approved' | 'rejected' | 'uncertain'
  ai_reason           text,          -- PAL's reason string (max 15 words)
  parent_note         text,          -- optional note when parent rejects
  created_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  completed_at        timestamptz
);

create index chores_family_idx    on public.chores (family_id, created_at desc);
create index chores_assigned_idx  on public.chores (assigned_to, status);

alter table public.chores enable row level security;

create policy chores_family_scope on public.chores
  for all
  using (family_id in (
    select family_id from public.memberships where account_id = auth.uid()
  ))
  with check (family_id in (
    select family_id from public.memberships where account_id = auth.uid()
  ));
```

### New Column: `accounts.push_token`

```sql
alter table public.accounts add column if not exists push_token text;
```

### New `ledger.kind` values

Add to existing kind comments (no constraint change needed):
- `'chore_payout'` — when parent approves a chore
- `'topup_stripe'` — when Stripe webhook confirms AUD top-up

### Migration file

`supabase/migrations/0005_sprint1_chores_push.sql`

---

## 13. Push Notifications

### Technology
- **Expo Push Notifications** (free, works with TestFlight)
- Token stored on `accounts.push_token` via `PATCH /me/push-token`
- Sent via Expo Push API from the API server
- Fallback: Twilio SMS for critical events if no push token

### Notification Events

| Event | Recipient | Title | Body |
|---|---|---|---|
| Top-up received | Kid | "💸 Money arrived!" | "Mum sent you 1,000 🧠 — Just because 🌟" |
| Chore submitted | Parent | "📋 Chore submitted" | "Jamie submitted 'Take out bins' for review" |
| Chore AI approved | Parent | "✅ AI approved" | "Jamie's bins chore was verified. Approve to pay?" |
| Chore AI rejected | Parent | "📸 Needs review" | "Jamie's chore photo needs your review" |
| Chore parent approved | Kid | "🎉 Chore paid!" | "+50 🧠 for Take out bins" |
| Chore parent rejected | Kid | "❌ Chore rejected" | "Mum rejected 'Clean room' — try again" |
| Purchase completed | Parent | "🛒 Jamie bought" | "Banana +5 🧠 · Net −3 🧠 · Balance: 1,337 🧠" |
| Streak milestone | Kid | "🔥 Streak!" | "3 days clean! +5 🧠 bonus" |
| Goal completed | Parent | "🎯 Goal reached!" | "Jamie reached his AirPods goal!" |

### Push Service (API)

```typescript
// apps/api/src/services/push.ts
import { Expo } from 'expo-server-sdk'

const expo = new Expo()

export async function sendPush(token: string, title: string, body: string, data?: object) {
  if (!Expo.isExpoPushToken(token)) return
  await expo.sendPushNotificationsAsync([{
    to: token,
    title,
    body,
    data,
    sound: 'default',
  }])
}
```

---

## 14. NFC Card Payment

### How It Works

1. Kid adds items to cart
2. Taps "Pay with card"
3. Enters real dollar amount spent
4. Screen shows BrainPal card graphic with pulsing NFC symbol
5. Kid taps physical BrainPal card to iPhone
6. iPhone reads NFC tag ID
7. App matches known tag ID → triggers checkout
8. Brains deducted, confetti, success screen

### Physical Card

A standard CR80 card (credit card size) with:
- Purple-to-indigo gradient print
- MoneyPal wordmark + chip graphic
- Kid's name
- NFC sticker embedded inside
- Cost: ~$5 per card from any NFC card printer

The NFC tag ID is hardcoded in the app for the demo. One card per kid.

### Mobile Implementation

```typescript
// expo-nfc reads the tag
import NfcManager, { NfcTech } from 'react-native-nfc-manager'

const KNOWN_TAG_IDS = {
  'jamie': '04:AB:CD:EF:12:34',  // Jamie's card tag ID
  'riley': '04:AB:CD:EF:56:78',  // Riley's card tag ID
}

async function waitForNfcTap(): Promise<boolean> {
  await NfcManager.requestTechnology(NfcTech.Ndef)
  const tag = await NfcManager.getTag()
  const tagId = tag?.id
  return Object.values(KNOWN_TAG_IDS).includes(tagId ?? '')
}
```

### Package needed
```
react-native-nfc-manager
```

Add to `app.json`:
```json
"ios": {
  "infoPlist": {
    "NFCReaderUsageDescription": "MoneyPal uses NFC to process payments."
  }
}
```

---

## 15. Family Location (Find My)

Real-time family location sharing — parents see kids, kids see parents. Works seamlessly on iOS and Android. Check-in on demand (not always-on background tracking).

### Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Map rendering | `react-native-maps` + Google Maps provider | Cross-platform, dark-mode styling, custom markers |
| Device location | `expo-location` | Built into Expo SDK, iOS + Android, foreground + background |
| Geocoding | Google Geocoding API | Coordinates → "Jamie is at School" |
| Storage | Supabase `locations` table | Real-time subscriptions for live updates |
| Geofencing | `expo-location` geofencing API | On-device, battery-efficient |
| Push alerts | Existing push infra (Expo Push) | "Jamie arrived at School" |

### How It Works

1. **Check-in:** Kid (or parent) taps "Share Location" → app reads current GPS → writes to `locations` table
2. **Auto check-in:** Geofence triggers auto-update when entering/leaving saved places
3. **Map view:** Parent opens map → sees all family members' last known locations via Supabase real-time
4. **Reverse geocode:** Coordinates converted to readable place name ("Bondi Public School")

### 15.1 Parent Map View

Accessible from parent dashboard (new action row button) or kid detail screen.

```
← Family Map                    [⟳ refresh]

┌─────────────────────────────────────────┐
│                                         │
│         [Google Map — dark style]       │
│                                         │
│    🟣📍 Jamie                           │  kid accent color pin
│         "Bondi Public School"           │
│         12 min ago                      │
│                                         │
│    🟢📍 Riley                           │
│         "Home"                          │
│         Just now                        │
│                                         │
│    👩📍 You                              │  parent's own pin
│                                         │
└─────────────────────────────────────────┘

FAMILY
┌─────────────────────────────┐
│ 🟣 Jamie · Bondi Public School │  tap → zoom to kid
│   12 min ago                    │
│ 🟢 Riley · Home                 │
│   Just now                      │
└─────────────────────────────┘

[📍 Request check-in]          — sends push to kid asking for location
```

**Tap a pin** → bottom sheet with:
- Kid name + avatar
- Place name + address
- Last updated time
- [Navigate] — opens Apple/Google Maps directions
- [Request update] — push notification to kid

### 15.2 Kid Map View

Kids can see parent's location (confirmed feature).

```
← Family Map

┌─────────────────────────────────────────┐
│                                         │
│         [Google Map — dark style]       │
│                                         │
│    👩📍 Mum                              │
│         "Work — CBD"                    │
│         5 min ago                       │
│                                         │
│    📍 You                               │  kid's own pin (accent color)
│                                         │
└─────────────────────────────────────────┘

[📍 Share my location]         — manual check-in button
```

### 15.3 Geofences (Saved Places)

Parent creates saved places. Geofence triggers auto check-in + push notification.

**Setup screen (parent):**
```
← Saved Places              [+ Add]

┌─────────────────────────────┐
│ 🏠 Home                     │  200m radius
│   42 Beach Rd, Bondi        │
│   Alerts: arrive + leave    │
└─────────────────────────────┘
┌─────────────────────────────┐
│ 🏫 School                   │  300m radius
│   Bondi Public School       │
│   Alerts: arrive + leave    │
└─────────────────────────────┘

[+ Add place]
```

**Add place flow:**
```
← Add Place

[Map with draggable pin]

Name: [School              ]
Address: [auto-filled from pin]
Radius: [200m ▾]  (100m / 200m / 300m / 500m)
Alert when:
  [✓] Arrives   [✓] Leaves
Applies to:
  [✓] Jamie     [✓] Riley

[Save]
```

### 15.4 Notifications

| Event | Recipient | Title | Body |
|---|---|---|---|
| Kid enters geofence | Parent | "📍 Jamie arrived" | "Jamie arrived at School · 3:15 PM" |
| Kid leaves geofence | Parent | "📍 Jamie left" | "Jamie left School · 3:45 PM" |
| Location request | Kid | "📍 Location request" | "Mum wants to know where you are" |
| Kid shares location | Parent | "📍 Jamie checked in" | "Jamie is at Westfield Bondi · Just now" |

### 15.5 Database Schema

```sql
-- Last known location per family member
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  family_id       uuid not null references public.families(id) on delete cascade,
  latitude        double precision not null,
  longitude       double precision not null,
  accuracy        double precision,          -- meters
  place_name      text,                      -- reverse geocoded name
  source          text not null default 'manual'
                  check (source in ('manual','geofence','request')),
  created_at      timestamptz not null default now()
);

-- Only keep latest per account (upsert pattern), but log history
create index locations_account_idx on public.locations (account_id, created_at desc);
create index locations_family_idx  on public.locations (family_id, created_at desc);

alter table public.locations enable row level security;

create policy locations_family_scope on public.locations
  for all
  using (family_id in (
    select family_id from public.memberships where account_id = auth.uid()
  ))
  with check (family_id in (
    select family_id from public.memberships where account_id = auth.uid()
  ));

-- Saved places (geofences)
create table public.saved_places (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  created_by      uuid not null references public.accounts(id) on delete restrict,
  name            text not null,
  latitude        double precision not null,
  longitude       double precision not null,
  radius_meters   int not null default 200,
  alert_arrive    boolean not null default true,
  alert_leave     boolean not null default true,
  applies_to      uuid[] not null default '{}',  -- account_ids, empty = all kids
  created_at      timestamptz not null default now()
);

create index saved_places_family_idx on public.saved_places (family_id);

alter table public.saved_places enable row level security;

create policy saved_places_family_scope on public.saved_places
  for all
  using (family_id in (
    select family_id from public.memberships where account_id = auth.uid()
  ))
  with check (family_id in (
    select family_id from public.memberships where account_id = auth.uid()
  ));
```

### 15.6 API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/locations/checkin` | any | Submit current location (manual or geofence) |
| `GET` | `/locations/family` | any | Get latest location for each family member |
| `POST` | `/locations/request` | parent | Send push to kid requesting check-in |
| `POST` | `/saved-places` | parent | Create a geofence |
| `GET` | `/saved-places` | any | List family's saved places |
| `DELETE` | `/saved-places/:id` | parent | Remove a geofence |

### 15.7 Real-time Subscriptions

| Table | Filter | Who subscribes | Purpose |
|---|---|---|---|
| `locations` | `family_id` | parent + kid | Live pin updates on map |

### 15.8 Google Maps Dark Style

Custom map style matching the app's dark UI:

```json
[
  { "elementType": "geometry", "stylers": [{ "color": "#0A0A0F" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#6B7280" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#0A0A0F" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1E1E2E" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#141420" }] },
  { "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] }
]
```

### 15.9 Permissions

**iOS** — `Info.plist`:
```
NSLocationWhenInUseUsageDescription: "MoneyPal shows your family where you are."
NSLocationAlwaysAndWhenInUseUsageDescription: "MoneyPal alerts your family when you arrive or leave saved places."
```

**Android** — `AndroidManifest.xml` (via app.json plugin):
```
ACCESS_FINE_LOCATION
ACCESS_COARSE_LOCATION
ACCESS_BACKGROUND_LOCATION  (for geofence triggers)
```

---

## 16. Task Breakdown & Build Order

### Wave 0 — Foundation (Day 1–2)
- [ ] `0.1` Migration `0005_sprint1_chores_push.sql` — chores table + push_token column
- [ ] `0.2` Drizzle schema — add `chores` table + `push_token` to accounts
- [ ] `0.3` Push service `apps/api/src/services/push.ts`
- [ ] `0.4` `PATCH /me/push-token` route
- [ ] `0.5` Expo push permission request on first app open
- [ ] `0.6` Install `lucide-react-native`, add `iconSize` tokens to `theme/tokens.ts`

### Wave 1 — Wallet API (Day 2–3)
- [ ] `1.1` `GET /wallet` — balance + last 50 ledger entries with metadata
- [ ] `1.2` `POST /wallet/topup` — parent credits Brains to kid, writes ledger
- [ ] `1.3` Wire Stripe webhook to credit Brains + send push to kid

### Wave 2 — Chores API (Day 3–4)
- [ ] `2.1` `POST /chores` — create chore (parent, with voice intent support)
- [ ] `2.2` `GET /chores` — list for family (filtered by role)
- [ ] `2.3` `PATCH /chores/:id` — update status
- [ ] `2.4` `POST /chores/:id/verify` — kid submits photo → GPT-4o Vision → verdict
- [ ] `2.5` Chore payout logic — on parent_approved: write ledger, send push to kid

### Wave 3 — PAL Chat API (Day 4–5)
- [ ] `3.1` `POST /chat` — text message handler with family context
- [ ] `3.2` Voice intent parser — Whisper transcription + GPT-4o-mini intent extraction
- [ ] `3.3` Confirmable action preview response format
- [ ] `3.4` `POST /chat/execute` — execute a confirmed intent (add_chore, topup, etc.)

### Wave 4 — NFC Package (Day 5)
- [ ] `4.1` Install `react-native-nfc-manager`, add to `app.json`
- [ ] `4.2` NFC tag read service `apps/mobile/lib/nfc.ts`
- [ ] `4.3` Tag ID config (hardcoded for demo)

### Wave 5 — Mobile: Kid Home + Wallet (Day 5–7)
- [ ] `5.1` Kid home screen — real balance, goal progress, streak, today's activity
- [ ] `5.2` Wallet store `apps/mobile/stores/wallet.ts` — balance, ledger, real-time sub
- [ ] `5.3` Transaction history component

### Wave 6 — Mobile: Cart + NFC Checkout (Day 7–8)
- [ ] `6.1` Cart screen — item list, PAL basket comment, net Brains
- [ ] `6.2` NFC checkout screen — amount entry + card graphic + NFC wait
- [ ] `6.3` NFC tap handler → checkout API call → success screen with confetti

### Wave 7 — Mobile: Chores (Day 8–9)
- [ ] `7.1` Kid chores list screen
- [ ] `7.2` Camera chore verification screen — capture + AI verdict display
- [ ] `7.3` Retry / escalate to parent flow
- [ ] `7.4` Parent chores screen — pending approvals + approve/reject
- [ ] `7.5` Voice chore creation in parent chat

### Wave 8 — Mobile: Top-Up Wizard (Day 9–10)
- [ ] `8.1` Top-up wizard — 4-slide bottom sheet
- [ ] `8.2` Apple Pay integration (existing `ApplePayCheckout` component)
- [ ] `8.3` Success state + push to kid

### Wave 9 — Mobile: PAL Chat (Day 10–12)
- [ ] `9.1` Chat screen — bubble list, input bar, voice mic button
- [ ] `9.2` Voice recording — hold mic, waveform animation, release to send
- [ ] `9.3` Confirmable action preview cards
- [ ] `9.4` Chat history persistence (last 50 messages)

### Wave 10 — Mobile: Parent Dashboard (Day 12–13)
- [ ] `10.1` Parent home — real balances, kid cards, action row
- [ ] `10.2` Kid detail screen — full per-kid view
- [ ] `10.3` PAL feed screen

### Wave 11 — Onboarding: PAL Avatar (Day 13–15)
- [ ] `11.1` Tavus SDK integration (or ElevenLabs + Lottie fallback)
- [ ] `11.2` Parent persona wizard — 3 slides with PAL reactions
- [ ] `11.3` Kid persona wizard — 6 slides with PAL reactions
- [ ] `11.4` PAL voice preview on voice selection slide

### Wave 12 — Family Location / Find My (Day 15–16)
- [ ] `12.1` Migration `0006_locations.sql` — locations + saved_places tables
- [ ] `12.2` Drizzle schema — add `locations` and `saved_places` tables
- [ ] `12.3` `POST /locations/checkin` — submit location (manual / geofence / request)
- [ ] `12.4` `GET /locations/family` — latest location per family member
- [ ] `12.5` `POST /locations/request` — push to kid requesting check-in
- [ ] `12.6` `POST /saved-places` + `GET /saved-places` + `DELETE /saved-places/:id`
- [ ] `12.7` Install `react-native-maps`, configure Google Maps provider (iOS + Android)
- [ ] `12.8` Parent map screen — family pins, dark style, bottom sheet on tap
- [ ] `12.9` Kid map screen — parent pin + own location + share button
- [ ] `12.10` Saved places management screen (parent) — add/remove geofences
- [ ] `12.11` Geofence registration via `expo-location` — auto check-in on enter/leave
- [ ] `12.12` Geofence push notifications — "Jamie arrived at School"
- [ ] `12.13` Supabase Realtime subscription on `locations` table

### Wave 13 — Polish & Demo Prep (Day 16–18)
- [ ] `13.1` Supabase Realtime subscriptions — ledger, chores, inbox
- [ ] `13.2` Push notification deep links (tap notification → correct screen)
- [ ] `13.3` Confetti component (reusable)
- [ ] `13.4` Streak milestone celebration overlay
- [ ] `13.5` Goal completion celebration
- [ ] `13.6` Physical NFC card — order + configure tag IDs
- [ ] `13.7` End-to-end demo run on real devices


---

## 17. Out of Scope for Sprint 1

| Feature | Sprint |
|---|---|
| Parent natural-language spending rules | Sprint 2 |
| HSG multi-round scanning game | Sprint 2 |
| Allowance scheduler (recurring payments) | Sprint 3 |
| Family leaderboard | Sprint 3 |
| Charity box | Sprint 3 |
| Real card issuing (Stripe Issuing) | P1 |
| KYC / AML compliance | P1 |
| Multiplayer scan battles | P2 |
| Barcode product lookup | P2 |
| Round-ups on parent purchases | P3 |
| Family budget tracking | P3 |

---

## Appendix A — New Dependencies

### API
```
expo-server-sdk   — Expo push notifications
```

### Mobile
```
lucide-react-native        — icon system (replaces all emoji UI controls)
react-native-nfc-manager   — NFC card reading
react-native-maps          — Google Maps (iOS + Android), dark style, custom markers
expo-location              — foreground + background location, geofencing
expo-haptics               — vibration on NFC tap (already in Expo SDK)
```

### Already installed (confirm before adding)
```
@stripe/stripe-react-native  ✅
expo-camera                  ✅
expo-audio                   ✅
expo-image-manipulator       ✅
expo-file-system             ✅
expo-notifications           — need to add
```

---

## Appendix B — Environment Variables Needed

### Already set
```
STRIPE_SECRET_KEY            ✅
STRIPE_PUBLISHABLE_KEY       ✅
STRIPE_WEBHOOK_SECRET        ⚠️  still empty — get from Stripe dashboard
OPENAI_API_KEY               ✅
ELEVENLABS_API_KEY           ✅
ELEVENLABS_VOICE_ID          ✅
```

### New for Sprint 1
```
# Tavus (PAL avatar)
TAVUS_API_KEY=
TAVUS_REPLICA_ID=            # the PAL face replica ID

# ElevenLabs persona voices (one per PAL character)
ELEVENLABS_VOICE_ID_SARCASTIC=   # defaults to ELEVENLABS_VOICE_ID
ELEVENLABS_VOICE_ID_COOL=
ELEVENLABS_VOICE_ID_WISE=
ELEVENLABS_VOICE_ID_HYPED=
ELEVENLABS_VOICE_ID_CHILL=
ELEVENLABS_VOICE_ID_AUNTIE=

# NFC demo tag IDs (comma-separated, format: kidName:tagId)
NFC_DEMO_TAGS=jamie:04ABCDEF1234,riley:04ABCDEF5678

# Expo push
EXPO_ACCESS_TOKEN=           # from expo.dev account settings

# Google Maps (Family Location)
GOOGLE_MAPS_API_KEY=AIza...  # Maps SDK iOS + Android + Geocoding
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=  # same key, exposed to mobile bundle
```

---

## Appendix C — File Structure (new files only)

```
apps/api/src/
  routes/
    chores.ts              — chore CRUD + verify endpoint
    chat.ts                — PAL chat + voice intent
    locations.ts           — check-in, family locations, request
    saved-places.ts        — geofence CRUD
  services/
    push.ts                — Expo push notification sender
    chore-verify.ts        — GPT-4o Vision chore verification
    voice-intent.ts        — Whisper + intent parser
    tavus.ts               — Tavus avatar API client
    voice-persona.ts       — ElevenLabs persona mapping
    geocode.ts             — Google Geocoding API (coords → place name)

apps/mobile/app/(app)/
  kid/
    index.tsx              — REPLACE placeholder with real home
    cart.tsx               — cart screen
    checkout-nfc.tsx       — NFC checkout screen
    chores.tsx             — kid chores list
    chore-verify.tsx       — camera verification screen
    chat.tsx               — PAL chat screen
    map.tsx                — kid map (see parent + share location)
  parent/
    index.tsx              — UPDATE with real balances
    topup.tsx              — REPLACE placeholder with wizard
    kid-detail.tsx         — REPLACE placeholder with full screen
    chores.tsx             — parent chores screen
    feed.tsx               — PAL feed screen
    chat.tsx               — parent PAL chat screen
    map.tsx                — parent family map (all kids)
    saved-places.tsx       — geofence management

apps/mobile/
  stores/
    wallet.ts              — balance, ledger, real-time
    chores.ts              — chore list, real-time
    chat.ts                — chat history
    location.ts            — family locations, real-time
  lib/
    nfc.ts                 — NFC tag reader
    push.ts                — push token registration
    geofence.ts            — expo-location geofence registration
    map-style.ts           — Google Maps dark theme JSON
  components/
    Confetti.tsx           — reusable confetti burst
    VoiceMic.tsx           — hold-to-record mic button
    ActionPreviewCard.tsx  — confirmable intent preview
    NfcCardGraphic.tsx     — animated BrainPal card
    FamilyMapPin.tsx       — custom map marker (accent color + avatar)

supabase/migrations/
  0005_sprint1_chores_push.sql
  0006_locations.sql       — locations + saved_places tables
```

---

*Document version: Sprint 1 · May 2026*
*Next review: after Wave 6 (NFC checkout working end-to-end)*
