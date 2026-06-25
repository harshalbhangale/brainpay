# BrainPal Portal Audit: What Should/Shouldn't Exist for Kids vs Parents

## Overview
The portal currently has role-appropriate sections that need refinement. This audit details every feature and whether it should appear for kids, parents, or both.

---

## TOP-LEVEL TABS (apps/web/src/screens/Home.tsx)

### Current Structure
All users see:
1. **AI** (Chat) - PAL conversation
2. **MoneyPal** (Family) - Financial & family management
3. **StudyPal** - Learning

### VERDICT: NEEDS FIX
- **KIDS**: Should see **AI** + **StudyPal** ONLY (no MoneyPal)
- **PARENTS**: Should see **AI** + **MoneyPal** + **StudyPal**

---

## SECTION 1: AI / CHAT (apps/web/src/components/Chat.tsx)

### Current Features
- ✅ Conversation history
- ✅ Text messaging with PAL orchestrator
- ✅ Specialist Pals respond (e.g., StudyPal, MoneyPal, HealthPal experts)
- ✅ Voice mode (camera-on or audio-only)
- ✅ Intent confirmation (for actionable requests)
- ✅ New chat / clear history

### VERDICT: SAME FOR BOTH
**KIDS & PARENTS**: All features appropriate
- Kids should chat with their companion Pal
- Parents should chat with their PAL coordinator
- Both can ask questions, get help, trigger actions

### Notes
- Intent confirmation ensures kids can't accidentally do harmful things
- May need parent-level intents hidden from kids (e.g., "remove kid from family")

---

## SECTION 2: MONEYPAL / FAMILY (apps/web/src/components/family/)

### Structure Overview
```
FamilyView (top-level)
├── AvatarRail (You + Kids selection)
├── OverviewTab (default; family summary or kid details)
├── CardTab (payment card controls)
├── ChoresTab (chore management)
└── ActivityTab (transaction history)
```

### 2.1 AVATAR RAIL (AvatarRail.tsx)

**Current Behavior**
- Shows "You" (parent avatar + name)
- Shows all kids (kid avatars + names)
- Tapping a kid loads that kid's overview
- Tapping "You" returns to family overview

**VERDICT: ROLE-SPECIFIC**

| Component | Kids | Parents | Reason |
|-----------|------|---------|--------|
| "You" button | ❌ NO | ✅ YES | Kids shouldn't see family overview; only their own context |
| Kid avatars (siblings) | ❌ NO | ✅ YES | Kids shouldn't see siblings or family structure |
| Own avatar | ⚠️ MAYBE | ✅ YES | If kids see their own card/balance, needs own context |

**RECOMMENDED FIX**
- **Kids**: Don't show MoneyPal tab at all OR create a kid-only balance view (separate from family view)
- **Parents**: Keep full AvatarRail with family + all kids

---

### 2.2 OVERVIEW TAB (OverviewTab.tsx)

#### FOR PARENTS (subject.kind === 'family')
**Current**
- Welcome + parent name
- Action buttons: Send money, Add a chore, Activity
- Parent wallet card (balance display)
- Family map (where everyone is)
- Kids list with balances & map cards
- Pending invitations

**VERDICT: ✅ ALL GOOD**
- ✅ Send money (parent action)
- ✅ Add a chore (parent action)
- ✅ Activity link (transaction log)
- ✅ Family map (parent oversight)
- ✅ Kids list with balances (parent oversight)
- ✅ Pending invitations (parent action)

#### FOR KIDS (subject.kind === 'kid' but kid IS the subject)
**Current**
- Kid's name
- Kid's balance card
- Action buttons: Add money, Chores, Activity
- Earned/spent stats
- Where they are (map)
- Recent activity

**VERDICT: NEEDS MAJOR CHANGES**

| Feature | Current | Issue | Fix |
|---------|---------|-------|-----|
| Balance card | ✅ | None | OK to show kid their balance |
| "Add money" button | ❌ | Kids can't actually add money; confusing UX | **REMOVE** |
| "Chores" button | ✅ | OK for kid to see chores assigned to them | Keep |
| "Activity" button | ⚠️ | Shows transactions (earned/spent); appropriate in context | Keep, but label clearly as "Earned/Spent" |
| "Earned/Spent" stats | ✅ | Motivating; shows recent balance changes | Keep |
| "Where they are" map | ⚠️ | Parents can see this; but kids probably don't need to see their own location displayed | Questionable but low priority |
| Recent activity | ✅ | Shows what they earned; motivational | Keep |

**RECOMMENDED FIX**
```jsx
// If kid is viewing their own MoneyPal overview:
- Remove "Add money" button (they can't do it)
- Change "Activity" label to "Recent earnings"
- Consider removing self-map (kids don't need to see their own location)
- Keep: balance, chores link, earned/spent stats
```

---

### 2.3 CARD TAB (CardTab.tsx)

**Current Features**
- Display payment card (name, partially obscured number)
- Show/hide card number toggle
- Freeze/Unfreeze card button
- Card status (frozen/active)
- Controls: Online payments, ATM withdrawals, Contactless, Daily spend limit
- "Report lost or stolen" button

**VERDICT: PARENT-ONLY ❌**

| Feature | Kids | Parents | Reason |
|---------|------|---------|--------|
| Card display | ⚠️ | ✅ YES | Kids shouldn't manage cards; parents control spending |
| Show/hide number | ❌ | ✅ YES | Security risk for kids |
| Freeze card | ❌ | ✅ YES | Parent control |
| Toggle online/ATM/contactless | ❌ | ✅ YES | Parent spending controls |
| Daily spend limit | ❌ | ✅ YES | Parent control |
| Report lost/stolen | ❌ | ✅ YES | Parent action |

**RECOMMENDED FIX**
- **Kids**: NO access to Card tab at all
- **Parents**: Keep all features

---

### 2.4 CHORES TAB (ChoresTab.tsx)

**Current Features**
- List of chores (for family or specific kid)
- Status badges: To do, Submitted, AI approved/rejected, Parent approved/rejected, Paid
- Reward amount (Brains) per chore
- "New chore" button (to create a chore)
- Parent approval/rejection buttons for submitted chores

**VERDICT: ROLE-SPECIFIC**

| Feature | Kids | Parents | Reason |
|---------|------|---------|--------|
| View assigned chores | ✅ YES | ✅ YES | Kids see their chores; parents see all family chores |
| Chore status | ✅ YES | ✅ YES | Both should see progress |
| Reward amount | ✅ YES | ✅ YES | Both see what they'll earn |
| "New chore" button | ❌ NO | ✅ YES | Only parents create chores |
| Approve/reject buttons | ❌ NO | ✅ YES | Only parents verify & pay |
| AI reason | ✅ YES | ✅ YES | Both see PAL feedback (informational) |

**RECOMMENDED FIX**
- **Kids**: Show only their assigned chores, no "New chore" button, no approval buttons
- **Parents**: Keep all features, can create chores and review submissions

---

### 2.5 ACTIVITY TAB (ActivityTab.tsx)

**Current Features**
- Transaction history log
- Shows: Chore payouts, Top-ups (parent adds money), Purchases, Adjustments, Study rewards
- Icons indicate transaction type
- Shows who (for family view) and when
- Green (positive) / Red (negative) balance changes

**VERDICT: ROLE-SPECIFIC**

| Feature | Kids | Parents | Reason |
|---------|------|---------|--------|
| View own activity | ✅ YES | ✅ YES | Kids see their earnings; parents see all |
| See siblings' activity | ❌ NO | ✅ YES | Kids shouldn't see other kids' finances |
| See transaction type | ✅ YES | ✅ YES | Transparency |
| See balance delta | ✅ YES | ✅ YES | Both should see earnings |
| See timestamp | ✅ YES | ✅ YES | Both see when it happened |

**RECOMMENDED FIX**
- **Kids**: Only see their own activity; not shown for MoneyPal tab anyway
- **Parents**: See all family activity (current behavior is good)

---

## SECTION 3: STUDYPAL (apps/web/src/components/StudyPal.tsx)

### Current Features
- Topic management (create, list topics)
- Grade level setup (one-time onboarding)
- Document upload/processing
- Concept flashcard study
- Quiz generation & grading
- Interview (video tutor with Tavus or voice with Gemini Live)
- Tutor chat (text-based study help)
- Saved notes/docs

### VERDICT: ✅ ALL GOOD FOR KIDS

| Feature | Kids | Parents | Reason |
|---------|------|---------|--------|
| Study topics | ✅ YES | ⚠️ MAYBE | Kids use this for learning; parents might want to create topics for kids |
| Grade setup | ✅ YES | ⚠️ MAYBE | Kid sets their grade; parents might override |
| Document upload | ✅ YES | ⚠️ MAYBE | Kid uploads study materials or parent does |
| Flashcards | ✅ YES | ✅ YES (view) | Kids study; parents can monitor |
| Quiz | ✅ YES | ✅ YES (view) | Kids take quizzes; parents see scores |
| Interview (video tutor) | ✅ YES | ✅ YES (monitor?) | Core learning feature |
| Tutor chat | ✅ YES | ✅ YES (view) | Kids get help; parents can see |
| Saved notes | ✅ YES | ✅ YES (view) | Kids organize; parents can review |

**Notes**
- Parents might want a parent dashboard to see kid study progress
- Consider parent-only "monitor" view of kid's study activity
- Current implementation is GOOD for kids; no changes needed for core features

---

## SECTION 4: BOTTOM BAR (BottomBar.tsx)

**Current**
- Tabs in Family view: Overview, Card, Chores, Activity

**VERDICT: CONDITIONAL**

| Tab | Kids | Parents | Reason |
|-----|------|---------|--------|
| Overview | ⚠️ MODIFIED | ✅ YES | Kids should only see their own info |
| Card | ❌ NO | ✅ YES | Parent control |
| Chores | ✅ YES | ✅ YES | Both use this |
| Activity | ⚠️ MODIFIED | ✅ YES | Kids only see own activity |

**RECOMMENDED FIX**
- **Kids**: Don't show Card tab; conditionally show Chores/Activity (only their own data)
- **Parents**: Keep all tabs

---

## SUMMARY: RECOMMENDED CHANGES

### ✅ For KIDS
```
1. Top tabs: AI + StudyPal (NO MoneyPal)
2. If they stumble into Family view:
   - NO AvatarRail (don't show family structure or siblings)
   - NO "Add money" button
   - NO Card tab
   - NO "New chore" button or approve/reject
   - YES to: Own balance, assigned chores, activity
3. StudyPal: All features OK
4. AI Chat: All features OK
```

### ✅ For PARENTS
```
1. Top tabs: AI + MoneyPal + StudyPal
2. MoneyPal (Family view):
   - YES: Full AvatarRail (You + all kids)
   - YES: All tabs (Overview, Card, Chores, Activity)
   - YES: Send money, add chores, review submissions
   - YES: Family map, kids list, full activity log
3. StudyPal: Can view + monitor kid topics/progress (future enhancement)
4. AI Chat: All features OK
```

### Quick Wins (Easy Fixes)
1. Remove MoneyPal tab from kid portal (done in Home.tsx)
2. Hide "Add money" button when viewing own balance in OverviewTab
3. Hide Card tab when kid is subject
4. Hide "New chore" button for kids
5. Hide approval buttons for kids

### Longer-term Enhancements
1. Add parent study dashboard (monitor kid learning)
2. Show kid-friendly celebration when they earn Brains (from chores, quizzes, interviews)
3. Add HealthPal tab (future Pal)
4. Parent controls for MoneyPal limits (daily spend, card categories, etc.)

---

## Files to Modify

1. ✅ `apps/web/src/screens/Home.tsx` - Hide MoneyPal from kids (DONE)
2. ⏳ `apps/web/src/components/family/OverviewTab.tsx` - Hide "Add money" for kids viewing own balance
3. ⏳ `apps/web/src/components/family/BottomBar.tsx` - Conditionally hide Card tab
4. ⏳ `apps/web/src/components/family/ChoresTab.tsx` - Hide "New chore" and approval buttons for kids
5. ⏳ `apps/web/src/components/family/FamilyView.tsx` - Hide AvatarRail for kids or make read-only

