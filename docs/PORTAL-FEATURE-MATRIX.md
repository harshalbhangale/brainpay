# BrainPal Portal: Feature Matrix (Kids vs Parents)

## Visual Overview

```
PORTAL STRUCTURE
════════════════════════════════════════════════════════════════════

TOP LEVEL TABS
──────────────
             KID                          PARENT
        ┌─────────┐                   ┌──────────────┐
        │   AI    │                   │     AI       │
        ├─────────┤                   ├──────────────┤
        │StudyPal │                   │ MoneyPal (*) │
        └─────────┘                   ├──────────────┤
                                      │  StudyPal    │
                                      └──────────────┘

(*) MoneyPal = Family dashboard + card management
```

---

## FEATURE MATRIX

### 1. AI / CHAT TAB
```
FEATURE                              KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
Text conversation                     ✅   ✅     Both talk to PAL
Voice/Camera mode                     ✅   ✅     Both can use
Intent confirmation                   ✅   ✅     Safety guard
Chat history                          ✅   ✅     Preserved
Clear/new chat                        ✅   ✅     Both can start fresh
Parent intents (e.g., remove kid)    ❌   ✅     Parent-only actions
```

---

### 2. STUDYPAL TAB
```
FEATURE                              KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
Create study topics                   ✅   ⚠️     Kid-friendly; parent could create
Grade level setup                     ✅   ⚠️     Kid sets; parent might override later
Upload study materials                ✅   ⚠️     Kid or parent can do
Flashcard study                       ✅   ✅     Kids study; parents view progress
Quiz creation & grading               ✅   ✅     Kids take; parents see scores
Interview (video tutor)               ✅   ✅     Learning feature
Tutor chat                            ✅   ✅     Study help
Saved notes                           ✅   ✅     Organize + review

RECOMMENDED: Parent view of kid's progress (future enhancement)
```

---

### 3. MONEYPAL / FAMILY TAB (PARENT ONLY)
```
STRUCTURE: Avatar Rail + Tabs
```

#### 3A. AVATAR RAIL
```
COMPONENT                            KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
"You" (family overview)              ❌   ✅     Kids shouldn't see family controls
Kid avatars (siblings)               ❌   ✅     Kids shouldn't see other kids
Own avatar                           ⚠️   ✅     Only if kid has own card section
```

#### 3B. OVERVIEW TAB
```
FEATURE                              KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
When viewing OWN info:
  Balance card                        ✅   ✅     Show what they have
  "Add money" button                  ❌   🚫     REMOVE - kids can't do this
  "Chores" link                       ✅   ✅     Show assigned chores
  "Activity" link                     ✅   ✅     Show earnings only
  Earned/spent stats                  ✅   ✅     Motivational
  Personal location map              ⚠️   ⚠️     Questionable UX
  Recent activity                     ✅   ✅     Shows earnings

When viewing FAMILY (parent view):
  Parent wallet                       ❌   ✅     Parent only
  "Send money" button                 ❌   ✅     Parent action
  "Add a chore" button                ❌   ✅     Parent action
  "Activity" link                     ❌   ✅     Full transaction log
  Family map                          ❌   ✅     Parent oversight
  Kids list                           ❌   ✅     Family management
  Pending invitations                 ❌   ✅     Parent action
```

#### 3C. CARD TAB
```
FEATURE                              KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
Card display                         ❌   ✅     Parent manages
Show/hide number                     ❌   ✅     Security
Freeze/unfreeze                      ❌   ✅     Parent control
Online payments toggle               ❌   ✅     Parent control
ATM withdrawals toggle               ❌   ✅     Parent control
Contactless toggle                   ❌   ✅     Parent control
Daily spend limit                    ❌   ✅     Parent control
Report lost/stolen                   ❌   ✅     Parent action
```

#### 3D. CHORES TAB
```
FEATURE                              KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
View assigned chores                 ✅   ✅     Kids see theirs; parents see all
Chore status badges                  ✅   ✅     Both see progress
Reward amount (Brains)               ✅   ✅     Both see value
"New chore" button                   ❌   ✅     HIDE for kids
AI feedback/reason                   ✅   ✅     Informational for both
"Approve & pay" button               ❌   ✅     HIDE for kids (parent review)
"Reject" button                      ❌   ✅     HIDE for kids (parent review)
Submit chore button                  ✅   ❌     For kids to submit (not built yet)
```

#### 3E. ACTIVITY TAB
```
FEATURE                              KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
View own transactions                ✅   ✅     Both see their activity
View siblings' activity              ❌   ✅     Parent sees all
Transaction type (icon)              ✅   ✅     Both see what happened
Balance delta (+ / -)                ✅   ✅     Both see amounts
Timestamp                            ✅   ✅     Both see when
Description (e.g., "Chore: Walk dog") ✅  ✅    Both see details
```

#### 3F. BOTTOM BAR (Family View Tabs)
```
TAB                                  KID  PARENT  NOTES
─────────────────────────────────────────────────────────────
Overview                            ⚠️   ✅     Modified for kids (no "Add money")
Card                                ❌   ✅     HIDE for kids
Chores                              ✅   ✅     Kids see assigned; parents see all
Activity                            ⚠️   ✅     Kids see own only; parents see all
```

---

## QUICK DECISION TREE

```
IS THE USER A KID?
│
├─ YES: Show AI + StudyPal only
│  │
│  └─ If they somehow access Family view:
│     ├─ Hide AvatarRail (no family structure visibility)
│     ├─ Hide "Add money" button
│     ├─ Hide Card tab
│     ├─ Hide "New chore" button
│     └─ Show: their chores, activity, balance (read-only)
│
└─ NO (PARENT): Show AI + MoneyPal + StudyPal
   │
   └─ MoneyPal = Full family control (all tabs, all actions)
```

---

## IMMEDIATE FIXES (PRIORITY)

### 🔴 CRITICAL (Confusing/Wrong)
1. ✅ **DONE**: Hide MoneyPal tab from kids → Home.tsx
2. ⏳ **TODO**: Hide "Add money" button for kid balance view → OverviewTab.tsx
3. ⏳ **TODO**: Hide Card tab from kids → BottomBar.tsx / CardTab.tsx
4. ⏳ **TODO**: Hide approval buttons from kids → ChoresTab.tsx

### 🟡 IMPORTANT (Edge cases)
5. Hide "New chore" button for kids
6. Ensure kids can't navigate to Card tab
7. Ensure kids can't see siblings' data

### 🟢 NICE-TO-HAVE (Enhancement)
8. Add parent view of kid's study progress
9. Celebrate Brains earned (chores, quizzes, interviews)
10. Add HealthPal tab
11. Parent spending controls/limits

---

## CODE CHANGES NEEDED

### Home.tsx
- ✅ DONE: Conditionally show tabs based on accountType

### OverviewTab.tsx
- ⏳ Hide "Add money" button when `subject.kind === 'kid'`

### BottomBar.tsx
- ⏳ Conditionally render Card tab based on account role

### CardTab.tsx
- ⏳ Add guard to prevent kids from accessing

### ChoresTab.tsx
- ⏳ Hide "New chore" button for kids
- ⏳ Hide Approve/Reject buttons for kids

### FamilyView.tsx
- ⏳ Make AvatarRail hidden or read-only for kids

---

## ROLE-BASED SUMMARY

```
KID PORTAL (SAFE & FOCUSED)
═══════════════════════════════════════════════════════════
Purpose: Learn, grow, earn rewards
Tabs: AI + StudyPal
What they see:
  • Their conversation with PAL (AI)
  • Study topics, quizzes, interviews (StudyPal)
What they DON'T see:
  • Family structure (no siblings, no parents list)
  • Money management (no Send/Add money)
  • Card controls (no freezing, no limits)
  • Other kids' data (privacy)


PARENT PORTAL (FULL CONTROL & OVERSIGHT)
═══════════════════════════════════════════════════════════
Purpose: Manage family, monitor kids, control spending
Tabs: AI + MoneyPal + StudyPal
What they see:
  • Conversation with PAL (AI)
  • Family overview (all kids, balances, locations)
  • Card management (freezing, limits, categories)
  • Chore management (assign, approve, pay)
  • Full activity log (all transactions)
  • Money sending & tracking
  • Study progress monitoring (future)
What they control:
  • Kid balances (add money, adjustments)
  • Card settings per kid
  • Chore creation & approval
  • Family structure (add/remove kids)
  • Spending limits
```

