# BrainPay — Feature Catalogue

The complete feature set we're building toward, across both roles and all phases. This is the vision document — what BrainPay becomes over the next 18+ months.

For each feature: who it's for, when it ships, what foundation it needs.

---

## How to read this

**Audience tags:**
- 🟣 **Kid** — kid-only feature
- 🟡 **Parent** — parent-only feature
- 🟢 **Family** — both, shared

**Capability tags:**
- 📷 **Camera** — uses the AI scan
- 💳 **Card** — needs real card integration
- 🤖 **PAL** — uses the AI voice/personality

**Phases:**
- **P0** — MVP / virtual Brains (next 3 weeks)
- **P1** — pre-card, real-money virtual Brains (3–6 months)
- **P2** — kid card live (6–12 months)
- **P3** — parent card + full family OS (12–18 months)
- **P4** — network effects, social (18+ months)

---

## P0 — MVP / virtual Brains (next 3 weeks)

### Onboarding & accounts
- 🟢 **Phone + OTP signup** — single auth flow for both roles
- 🟢 **Role selection** — "I'm a parent / I'm a kid / I have an invite"
- 🟢 **Family creation** — first parent creates the family unit
- 🟡 **Parent persona setup** — name, avatar, parenting style (chill/balanced/strict)
- 🟣 **Kid persona setup** — name, age, color, avatar, PAL voice picker, first goal
- 🟢 **Invite system** — SMS code or QR to add a kid to a family
- 🟢 **Multi-parent support** — second parent (or grandparent) can join existing family

### The kid experience
- 🟣📷 **Live camera scan** — point at any item, get traffic light + Brains delta
- 🟣📷🤖 **PAL voice reactions** — sarcastic 1-line take per item
- 🟣📷 **Detail sheet** — ingredients, why good/bad, health context, price if known
- 🟣 **Buy / Skip buttons** — kid decides; skipping earns +2 Brains
- 🟣🤖 **PAL chat tab** — conversational AI for money questions
- 🟣 **Balance dashboard** — big number, kid's color theme
- 🟣 **Activity feed** — every scan, decision, top-up, milestone in one feed
- 🟣 **First goal** — single savings target (AirPods, game, etc.) with progress bar
- 🟣 **Streaks** — "🔥 4 days clean choices"

### The parent experience
- 🟡 **Family dashboard** — all kids in one view
- 🟡 **Per-kid detail screen** — balance, today's activity, goals
- 🟡 **PAL feed** — see PAL's roasts as a parent stream (the gold)
- 🟡 **Manual top-up** — send Brains with a note ("for tidying your room")
- 🟡 **Hold-to-send gesture** — Rainbow-style deliberate confirmation
- 🟡 **Add another kid** — same family, additional kid

### Foundations
- 🟢 **Family-first data model** — `families`, `accounts`, `relationships`, `ledger`
- 🟢 **Brains ledger** — every transaction recorded, balance derived
- 🟢 **Real-time sync** — parent sees kid's actions live (Supabase realtime)
- 🟢 **Push notifications** — basic events (top-up received, goal hit, PAL spoke)

---

## P1 — Real money in, no card yet (3–6 months)

### Real money
- 🟡💳 **Stripe top-up** — parent connects debit card, real $ converts to Brains
- 🟡 **Auto pocket money** — recurring weekly allowance, Friday 9am drop
- 🟡 **Withdraw to bank** — parent can pull unspent Brains back to their card
- 🟢 **Real-money disclosure** — "1 Brain = 1 cent" made explicit, T&Cs, AML basics

### Chores & earning
- 🟡 **Chore creator** — parent sets up chores with $ value, frequency, days
- 🟣 **Chore tracker for kid** — see today's chores, mark complete
- 🟡 **Chore approval** — parent ticks done, money releases instantly
- 🟢 **Chore streaks** — bonus Brains for completing all weekly chores
- 🟡 **Chore templates** — quick-pick common chores (dishes, room, homework)

### Goals & saving
- 🟣 **Multiple goals** — save for several things at once, allocate Brains across
- 🟣 **Goal carousel** — visual cards with progress, time-to-finish estimate
- 🟢 **Joint goals** — family-wide ("Bali holiday $2400") everyone contributes to
- 🟣🤖 **PAL goal coaching** — references goals in roasts ("AirPods are 500. This Coke is 10. Maths.")
- 🟣 **Goal completion celebration** — confetti, sound, share-to-parent moment

### Rules & controls
- 🟡 **Weekly spend cap** — soft limit per kid
- 🟡 **Category bans** — toggle list (sugary drinks, candy, in-game purchases)
- 🟡 **Per-purchase approval threshold** — "ask me before spending >50 Brains"
- 🟡 **Time-based rules** — no spending after 9pm, no spending on school days
- 🟡 **Pause spending** — emergency lock all kid actions instantly

### Insights & education
- 🟡 **Weekly family report** — Sunday email/push with summary
- 🟡 **Spending breakdown** — pie chart by category per kid
- 🟡🤖 **PAL parent insights** — daily nudge ("Riley scanned 8 items, bought 3, you saved on 5 junk items")
- 🟣 **Money lesson cards** — bite-sized financial education unlocked by milestones
- 🟢 **The BrainPay score** — gamified financial literacy rating, both ages

### Parent persona evolution
- 🟡🤖 **PAL learns parent style** — tracks which tone parent reacts to, adapts kid PAL voice over weeks
- 🟡 **Persona dashboard** — "PAL has learned: you prefer specific numbers, you like morning summaries"
- 🟡 **Tone tuning** — slider to dial PAL's sarcasm level for each kid

### Social (limited)
- 🟢 **Family activity feed** — like a family WhatsApp but for money events
- 🟢 **Reactions on feed** — emoji react to PAL roasts, kid achievements
- 🟢 **Parent ↔ kid notes** — attach a message to any top-up

---

## P2 — Kid card launches (6–12 months)

### The kid card
- 🟣💳 **Virtual Visa card** — instant on issue, in app
- 🟣💳 **Physical Visa card** — shipped, kid's color theme on the plastic
- 🟣💳 **Apple Pay / Google Pay** — virtual card in mobile wallet
- 🟡💳 **Card management** — freeze, unfreeze, replace, view PIN
- 🟡💳 **Real-time card transactions** — webhook from issuer → instant push notification
- 🟢💳 **Network-level category controls** — block merchant codes (gambling, alcohol)

### Camera + card synergy
- 🟣📷💳 **Pre-purchase scan with real money** — same camera, but "buy" actually deducts card balance
- 🟣📷💳 **Scan-to-unlock override** — for blocked categories, kid scans, PAL evaluates, one-time spend allowed
- 🟣💳🤖 **Post-swipe PAL voice** — kid taps card at shop → PAL voice clip in notification ("Coca-Cola again? Predictable. −10")
- 🟡💳🤖 **Parent gets PAL clip too** — same voice line pushed to parent app

### Advanced controls
- 🟡💳 **ATM controls** — toggle on/off, daily withdrawal limit
- 🟡💳 **Online vs in-person spending** — separate toggles
- 🟡💳 **Geo-fencing** — card only works near home/school
- 🟡💳 **Per-merchant blocks** — block specific stores

### Missing transactions / receipts
- 🟢📷 **Receipt scanning** — point camera at receipt, auto-categorise items
- 🟣🤖 **PAL receipt review** — PAL summarises a shopping trip after the fact
- 🟡 **Cash transaction logging** — manually record cash spends to keep ledger complete

### KYC & compliance
- 🟡 **Parent KYC flow** — verify ID, address (required by AML/CTF Act from March 2026)
- 🟢 **Kid identity verification** — minor flow with parent attestation
- 🟢 **Transaction monitoring** — flag unusual spending patterns

---

## P3 — Parent card + full family OS (12–18 months)

### The parent card
- 🟡💳 **Parent debit/prepaid Visa** — actual everyday spend card
- 🟡💳 **Auto-categorisation** — groceries, fuel, dining, kids stuff
- 🟡💳 **Cashback boosts** — bonus on kid-relevant categories (school supplies, books, sports)
- 🟡💳 **Apple Pay / Google Pay** — same wallet integration as kid card

### Round-ups (the killer feature)
- 🟢💳 **Round-ups to kid goals** — every parent transaction rounds up, spare change to chosen kid's goal
- 🟢💳 **Round-up rules** — pick which kid, which goal, which transactions count
- 🟣 **Live "round-up arrived" notification** — kid sees "Mum just bought coffee, you got 70c"
- 🟢💳 **Multiple round-up streams** — split between kids based on % allocation

### Family budgeting
- 🟢💳 **Whole-family budget dashboard** — total monthly spend, category breakdown
- 🟢💳 **Joint family goals** — Bali holiday, new car, house deposit — both adults + kids contribute
- 🟢💳 **Bill split with the household** — parent flags shared bills, family contributes Brains
- 🟢 **Family savings rate** — % of total income saved, gamified

### Parent uses the camera too
- 🟡📷 **Parent grocery scan** — same camera, but PAL talks about household nutrition not kid spend
- 🟡📷🤖 **"Should I buy this for Riley?"** — point at item, PAL gives kid-specific verdict for adult buying for kid
- 🟢📷 **Family meal planning scan** — scan fridge/pantry, PAL suggests meals from what's there

### Parent PAL co-pilot
- 🟡🤖 **Daily money insight** — "you spent 40% more on takeaway this week"
- 🟡🤖 **Spend forecasting** — "at this rate you'll be $200 over budget"
- 🟡🤖 **Bill reminders** — voice nudges before due dates
- 🟡🤖 **Tax-time helper** — categorised summary for end of financial year

### Advanced family features
- 🟢 **Multi-parent custody mode** — divorced parents share kid view but separate finances
- 🟢 **Grandparent gifting** — extended family can send Brains directly to a kid's goal
- 🟢 **Sibling competitions** — opt-in challenges ("most Brains saved this week wins +20")
- 🟢 **Birthday mode** — friends/family can contribute to a single goal in lieu of gifts

---

## P4 — Network & social (18+ months)

### P2P
- 🟣 **Send Brains to a friend** — kid-to-kid transfer (within BrainPay network)
- 🟣 **Payment requests** — kid asks friend to pay them back
- 🟣 **Group splits** — split a cinema trip across 4 friends

### Social layer
- 🟣 **Friend list** — connect with other BrainPay kids (parent-approved)
- 🟣 **Group goals** — friends saving together for the same thing
- 🟣 **Anonymous leaderboards** — opt-in streak comparisons in your school/area
- 🟣 **PAL battles** — your PAL roasts your friend's purchase, theirs roasts back

### Marketplace & deals
- 🟢 **Kid-friendly merchants** — partner shops give boosted Brains rewards
- 🟢 **In-app deals** — discounts on healthy food, books, school supplies
- 🟣 **Achievement badges** — collectible milestones, shareable
- 🟣 **PAL skins/voices** — unlock new PAL personalities at higher streak levels

### Advanced AI
- 🟢🤖 **Voice-first interactions** — talk to PAL while driving, getting ready, at the shops
- 🟣🤖 **PAL knows the school timetable** — references it ("test tomorrow, treat yourself after, not before")
- 🟢🤖 **Predictive nudges** — PAL learns family routines, warns before predictable bad spends

### Education ecosystem
- 🟢 **Money courses** — short interactive lessons unlocked at milestones
- 🟢 **School partnerships** — financial literacy module integrated with curriculum
- 🟢 **Investing 101** — for kids 14+, simulated portfolio with real-world data

---

## The features that make BrainPay genuinely different

Across all phases, three feature categories are uniquely ours and worth protecting:

### 1. The camera moment
- **P0**: pre-purchase scan
- **P2**: scan-to-unlock locked categories
- **P3**: parent uses it for household
- **P4**: receipt scanning, fridge scanning

The camera evolves from a kid demo into the family's universal money lens.

### 2. PAL the persona
- **P0**: kid PAL with sarcasm
- **P1**: persona evolves with usage
- **P3**: parent PAL (different tone, same character)
- **P4**: voice-first co-pilot, knows the family deeply

PAL is the moat. Anyone can build a card. No one else has a relatable AI character that grows with the family.

### 3. The family OS
- **P0**: simple parent ↔ kid
- **P3**: round-ups, joint goals, shared budgets
- **P4**: full social network within the family unit

The whole product is built around the family unit, not the individual. By the time competitors notice, the data model is irreplaceable.

---

## Foundation requirements

The features in P3 and P4 — joint goals, round-ups, parent grocery scans, family budgets — break the current data model. The minimum schema that supports everything above:

```
families                        ← the household
  ├── accounts                  ← every member: parents, kids, extended family
  │     └── account_type        ← 'parent' | 'kid' | 'extended'
  │     └── persona             ← evolving JSON: tone, preferences, learned traits
  │     └── color, avatar       ← visual identity that follows them
  ├── memberships               ← who is in the family, with what role
  │     └── role                ← 'primary_parent' | 'co_parent' | 'kid' | 'guardian'
  ├── ledger                    ← single source of truth for all money movement
  │     └── family_id, account_id, kind, amount, metadata
  ├── goals                     ← can be account-owned or family-owned
  ├── rules                     ← per-kid rules set by parents
  ├── chores                    ← parent-created, kid-completed
  └── cards                     ← future: physical/virtual card records
```

Every feature in P0 → P4 fits this shape without ripping it apart later.

---

## Phase summary

| Phase | Duration | Hero feature | Outcome |
|---|---|---|---|
| **P0** | 3 weeks | Camera + Brains demo | TestFlight-able prototype |
| **P1** | 3 months | Real money + chores | Spriggy-equivalent + AI |
| **P2** | 6 months | Kid Visa card | Real card with PAL voice on tap |
| **P3** | 6 months | Parent card + round-ups | Family OS, parent is real user |
| **P4** | 6+ months | Social + marketplace | Network effects, school partnerships |

---

## Notes on prioritisation

- Anything tagged 💳 is **gated on issuer partnership** — sign that conversation in P1, even if launch is P2
- Anything tagged 🤖 is **gated on AI cost stability** — model prices have to keep falling for this to scale
- Anything tagged 📷 only works as well as Gemini/Bedrock perception accuracy — track quality metrics from day 1
- Phases overlap. Start P1 conversations during P0 build. Start P2 issuer talks during P1 build.
