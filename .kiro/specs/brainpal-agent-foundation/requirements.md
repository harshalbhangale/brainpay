# Requirements Document

## Introduction

The BrainPal Agent Foundation turns today's single conversational PAL into a structured, multi-specialist family companion **without rebuilding the parts that already work**. BrainPal already owns a well-bounded Action Layer — the `chores` state machine (`pending → … → paid`), the atomic `wallet.creditBrains()` ledger transaction, and the validated `voice-tools` dispatcher — where money can only move through a parent-approved transition. This document does not change that boundary; it builds the missing substrate *around* it: a structured per-turn agent state, a layered Memory system with a trusted write path, a centralized Policy Engine that enforces a fixed decision hierarchy, and a thin Orchestrator that routes each turn to the right specialist persona while keeping the experience feeling like one companion.

The core architectural decision in this foundation is that **a "PAL" is a configuration, not a separate service or model**. MoneyPal, HealthPal, StudyPal, and SafetyPal are defined by a persona, an allowed-tool list, a memory-access scope, and a policy profile. The Orchestrator assembles one model call per turn from the relevant PAL config plus recalled memory plus the policy result. This delivers the "one conversation, many specialists, one shared memory" experience without distributed-agent complexity.

Scope of this spec (P0 of the foundation): the AgentTurn contract and audit log; the Memory Layer (session, personal, family, behavioral) with the Observe → Suggest → Confirm → Store write discipline and retention rules; the Policy Engine implementing the Safety → Parent-rule → Family-goal → Suggestion → Action hierarchy; the Orchestrator/Router; the PAL Registry with **MoneyPal and HealthPal implemented** and **StudyPal and SafetyPal defined as contracts only**; and the Parent Control surface for viewing, editing, confirming, and resetting memory and rules. Explicitly **out of scope** (P1+): system/global learning memory, the predictive and multi-agent-coordination evolution stages, the Capture → Evaluate → Improve → Promote learning loop, and the StudyPal/SafetyPal domain implementations (homework/streaks, location/safe-zones).

This foundation reuses every relevant existing primitive: `apps/api/src/routes/chat.ts` (the `/chat/execute` boundary), `apps/api/src/services/pal-context.ts` (`loadPalContext` / `contextToSystemPrompt`), `apps/api/src/services/pal-intent.ts` (`parseIntent`), `apps/api/src/services/voice-tools.ts` (tool schemas + dispatcher), `apps/api/src/services/llm.ts` (`getVerdict`, `containsBannedPhrase`), `apps/api/src/db/schema.ts` (`accounts.persona`, `families`, `chat_messages`, `inbox`, `ledger`, `call_sessions`), and the `/voice-rt` and `/twilio-media` WebSocket bridges.

## Glossary

- **Action Layer**: The existing set of validated, side-effecting operations — `voice-tools.ts` dispatcher, `chores.ts` state machine, `wallet.creditBrains()`. The only place real effects (task creation, money movement) occur.
- **Agent_Turn**: The structured state object produced for every conversational turn (chat or voice). Carries intent, chosen PAL, recalled memory references, applied constraints, risk level, suggestion, confidence, parent-approval flag, tool calls, and logged outcome. Defined in `packages/shared/src/agent.ts`.
- **BrainPal_Core / Orchestrator**: The component that receives a user message, builds the Agent_Turn, selects a PAL, recalls memory, calls the model, runs the Policy Engine, dispatches allowed tools, and writes the audit log. Implemented as `apps/api/src/agent/orchestrator.ts`.
- **PAL**: A specialist configuration consisting of a persona, an allowed-tool list, a memory-access scope, and a policy profile. Not a separate service. One of `core`, `money`, `health`, `study`, `safety`.
- **PAL_Registry**: The static set of PAL configurations in `apps/api/src/agent/pals/`.
- **Router**: The step inside the Orchestrator that maps a parsed intent to exactly one PAL for a turn. Reuses `pal-intent.ts`.
- **Memory_Layer**: The set of memory stores and the service (`apps/api/src/agent/memory.ts`) that reads slices and applies the write discipline.
- **Session_Memory**: Short-lived context for the current conversation. Backed by existing `chat_messages` / `call_sessions.transcript`. Expires.
- **Personal_Memory**: Stable facts about one account (child name, age, school, favorite snack, role). Backed by `accounts.persona` and `memory_facts` rows scoped to one account.
- **Family_Memory**: Shared household rules and patterns (allowance schedule, sugar limit, spending limits, approved merchants, safe zones). Backed by the new `family_rules` table.
- **Behavioral_Memory**: Patterns learned over time (e.g. "child usually buys snacks after school"). Backed by `memory_facts` rows of layer `behavioral`. Always begins life as a Proposed_Fact.
- **System_Memory**: Global, non-personal product learning. **Out of scope for this spec.**
- **Memory_Fact**: A single stored fact in the `memory_facts` table with a layer, scope, value, source, confidence, status, and optional expiry.
- **Proposed_Fact**: A Memory_Fact with `status = 'proposed'` — observed by an agent but not yet trusted. Never used to drive an action until confirmed.
- **Confirmed_Fact**: A Memory_Fact with `status = 'confirmed'` — promoted by an explicit parent (or, for low-risk personal facts, kid) confirmation.
- **Write_Discipline**: The required Observe → Suggest → Confirm → Store sequence for any non-session memory write. Agents may write Proposed_Facts; only a confirmation promotes a fact to Confirmed.
- **Consolidation**: The periodic process that distills many granular Behavioral_Memory facts (and recent activity) for one account into a small number of higher-level Summary_Facts, so durable memory stays bounded and high-signal as a child uses the product over months and years. Applies the Write_Discipline (summaries are proposed, then confirmed).
- **Summary_Fact**: A Memory_Fact produced by Consolidation with `source = 'consolidation'`. It records, in its value, the ids of the granular facts it supersedes. Once confirmed, its superseded source facts become eligible for expiry.
- **Policy_Engine**: The deterministic component (`apps/api/src/agent/policy.ts`) that evaluates a candidate action against the Decision_Hierarchy and returns an allow/deny/needs-approval decision plus the applied constraint ids.
- **Decision_Hierarchy**: The fixed precedence every PAL obeys: (1) Safety, (2) Parent rules, (3) Family goals, (4) Best suggestion, (5) Optional action.
- **Family_Rule**: A parent-defined constraint stored in `family_rules` (e.g. `sugar_limit_g`, `weekly_allowance`, `spend_limit_per_txn`, `approved_merchants`, `safe_zones`, `health_threshold`).
- **Parent**: An account with role `primary_parent` or `co_parent`.
- **Kid**: An account with role `kid`.
- **Parent_Approval**: A required explicit parent confirmation before a flagged action executes. Surfaced via the existing `inbox`.
- **Audit_Log**: The `agent_turns` table — one row per Agent_Turn, capturing the decision trail for explainability.
- **Evolution_Stage**: The maturity level of agent behavior. Stage 1 = rule-based, Stage 2 = context-aware. Stages 3 (predictive) and 4 (coordinated) are **out of scope**.

## Requirements

### Requirement 1: Structured agent turn state and audit log

**User Story:** As a developer maintaining BrainPal, I want every conversational turn to produce one structured, logged state object, so that agent behavior is predictable, explainable, and testable.

#### Acceptance Criteria

1. WHEN the Orchestrator processes a user message from chat or voice, THE Agent Foundation SHALL construct exactly one Agent_Turn object containing the fields: `intent`, `pal`, `memoryUsed`, `constraints`, `risk`, `suggestion`, `confidence`, `needsParentApproval`, `toolCalls`, and `outcome`.
2. THE Agent_Turn type SHALL be defined once in `packages/shared/src/agent.ts` and SHALL be imported by both the API and any consumer; the API SHALL NOT redefine the shape locally.
3. WHEN an Agent_Turn reaches a terminal state, THE Agent Foundation SHALL persist one `agent_turns` row recording the turn's `account_id`, `family_id`, `pal`, `intent`, `risk`, `needs_parent_approval`, the ids of memory facts in `memoryUsed`, the applied constraint ids, the dispatched tool names, and the final `outcome`.
4. THE Audit_Log SHALL NOT store raw model prompts or full message content beyond a truncated summary, SO THAT the log is safe to retain and review.
5. WHERE a turn dispatches one or more tools, THE Agent_Turn `outcome` SHALL be one of `executed`, `denied`, or `pending_parent`, matching the Policy_Engine decision for that turn.
6. IF Orchestrator processing fails after model output but before tool dispatch, THEN THE Agent Foundation SHALL persist the Agent_Turn with `outcome = 'denied'` and SHALL NOT dispatch any tool.

### Requirement 2: PAL registry and single-companion routing

**User Story:** As a child or parent, I want to talk to one companion that quietly involves the right specialist, so that I never feel like I am switching between separate apps or bots.

#### Acceptance Criteria

1. THE PAL_Registry SHALL define each PAL with exactly four properties: a persona descriptor, an allowed-tool list, a memory-access scope, and a policy profile.
2. THE PAL_Registry SHALL contain `core`, `money`, `health`, `study`, and `safety` entries; `money` and `health` SHALL be marked `enabled`, and `study` and `safety` SHALL be marked `contract_only`.
3. WHEN the Router resolves an intent for a turn, THE Orchestrator SHALL select exactly one PAL for that turn.
4. IF the Router cannot confidently map an intent to a specialist PAL, THEN THE Orchestrator SHALL select the `core` PAL.
5. IF the Router selects a PAL marked `contract_only`, THEN THE Orchestrator SHALL respond with a graceful "not available yet" message in the companion's single voice and SHALL NOT dispatch any tool.
6. WHEN any PAL responds to the user, THE Agent Foundation SHALL present the reply in one consistent companion identity and SHALL NOT expose internal PAL names or routing as separate senders in the user-facing transcript.
7. WHEN a PAL is selected, THE Orchestrator SHALL expose to the model only the tools in that PAL's allowed-tool list, and SHALL reject any model-requested tool outside that list.

### Requirement 3: Layered memory and access scoping

**User Story:** As a parent, I want the system to remember the right things at the right scope, so that BrainPal feels smart without being creepy or leaking one child's data into another's context.

#### Acceptance Criteria

1. THE Memory_Layer SHALL classify every stored fact into exactly one of: `session`, `personal`, `family`, or `behavioral`.
2. WHEN the Orchestrator recalls memory for a turn, THE Memory_Layer SHALL return only facts permitted by the selected PAL's memory-access scope, and SHALL record the returned fact ids in the Agent_Turn `memoryUsed`.
3. THE Memory_Layer SHALL scope Personal_Memory and Behavioral_Memory to a single `account_id` and SHALL NOT return one kid's personal facts when recalling memory for a different kid.
4. THE Memory_Layer SHALL scope Family_Memory to a `family_id` and SHALL make it readable by every member of that family subject to PAL access scope.
5. THE Memory_Layer SHALL back Session_Memory with the existing `chat_messages` and `call_sessions` records and SHALL NOT create a new long-lived store for it.
6. WHEN the Orchestrator drives an action, THE Policy_Engine SHALL consider only Confirmed_Facts and Family_Rules, and SHALL NOT treat a Proposed_Fact as authoritative.

### Requirement 4: Trusted memory write discipline

**User Story:** As a parent, I want to approve what BrainPal learns about my family before it acts on it, so that the system never silently rewrites important facts.

#### Acceptance Criteria

1. WHEN an agent observes a candidate non-session fact, THE Memory_Layer SHALL write it as a Proposed_Fact with `status = 'proposed'`, its `source`, and a `confidence` value.
2. THE Agent Foundation SHALL NOT promote a Proposed_Fact to `confirmed` without an explicit confirmation event.
3. WHEN a Parent confirms a Proposed_Fact, THE Memory_Layer SHALL set its `status` to `confirmed` and SHALL record the confirming `account_id` and timestamp.
4. WHERE a Proposed_Fact concerns Family_Memory, a Family_Rule, or any safety-relevant value, THE Agent Foundation SHALL require a Parent (not a Kid) to confirm it.
5. WHERE a Proposed_Fact is a low-risk Personal_Memory fact about a Kid's own profile (for example a favorite snack), THE Agent Foundation MAY allow that Kid to confirm it.
6. WHEN an agent observes a fact that conflicts with an existing Confirmed_Fact, THE Memory_Layer SHALL create a new Proposed_Fact representing the change and SHALL surface it for confirmation rather than overwriting the existing Confirmed_Fact.
7. WHEN a Proposed_Fact is created, THE Agent Foundation SHALL send an `inbox` event of kind `memory_suggestion` to the confirming party.

### Requirement 5: Memory retention and expiry

**User Story:** As a parent, I want temporary and stale information to expire automatically, so that BrainPal keeps only what stays relevant.

#### Acceptance Criteria

1. THE Memory_Layer SHALL retain Confirmed Personal_Memory, Family_Memory, Family_Rules, goals, and recorded approvals/refusals until explicitly changed or deleted.
2. THE Memory_Layer SHALL treat Session_Memory as expirable and SHALL exclude session context older than the configured session window from memory recall.
3. WHEN a Proposed_Fact has not been confirmed within its configured time-to-live, THE Memory_Layer SHALL mark it `expired` and SHALL exclude it from recall.
4. WHEN a goal referenced by a Memory_Fact reaches `completed` or `abandoned`, THE Memory_Layer SHALL mark associated routine facts eligible for expiry.
5. THE Memory_Layer SHALL provide a retention sweep that marks expirable facts `expired` and SHALL never hard-delete Confirmed_Facts as part of routine expiry.
6. WHEN memory is recalled for a turn, THE Memory_Layer SHALL exclude any fact whose `status` is `expired`.

### Requirement 6: Policy engine and decision hierarchy

**User Story:** As a parent, I want every recommendation and action to follow a fixed safety-first order of precedence, so that the agent's judgment is consistent and trustworthy.

#### Acceptance Criteria

1. WHEN the Orchestrator has a candidate action or suggestion, THE Policy_Engine SHALL evaluate it against the Decision_Hierarchy in the fixed order: (1) Safety, (2) Parent rules, (3) Family goals, (4) Best suggestion, (5) Optional action.
2. THE Policy_Engine SHALL be a deterministic function that runs after the model proposes an action and before any tool dispatch; THE model output SHALL NOT be able to bypass it.
3. IF a candidate action violates a Safety rule, THEN THE Policy_Engine SHALL deny it regardless of any lower-precedence rule that would allow it.
4. IF a candidate action is permitted by money rules but violates a Parent rule, THEN THE Policy_Engine SHALL deny or require Parent_Approval for it, and the Parent rule SHALL take precedence over the money rule.
5. WHEN the Policy_Engine denies or gates an action, THE Orchestrator SHALL still produce a best alternative suggestion in the companion voice rather than only refusing.
6. THE Policy_Engine SHALL return the ids of every applied rule so they can be recorded in the Agent_Turn `constraints`.
7. WHEN evaluating Safety for content, THE Policy_Engine SHALL reuse the existing `llm.containsBannedPhrase` / `getVerdict` checks rather than introducing a parallel safety check.
8. THE Policy_Engine SHALL set `needsParentApproval = true` for any action whose risk exceeds the PAL's policy profile threshold, and the Action Layer SHALL NOT execute such an action until Parent_Approval is recorded.

### Requirement 7: Money-movement safety boundary preserved

**User Story:** As a parent, I want to be certain that no agent can move money without my approval, so that conversational AI never becomes a spending loophole.

#### Acceptance Criteria

1. THE Agent Foundation SHALL NOT create any code path that credits or debits a wallet outside the existing `chores` state machine and `wallet.creditBrains()` transaction.
2. WHEN any PAL needs to reward Brains, THE Orchestrator SHALL route the effect through the existing `parent_approved → paid` transition and SHALL NOT call a ledger write directly from agent code.
3. WHERE a turn is initiated over voice with a caller identified only by caller ID, THE Policy_Engine SHALL permit task creation (status `pending`) but SHALL deny any direct wallet credit, preserving the boundary documented in `docs/voice-task-plan.md`.
4. THE Agent_Turn for any money-affecting intent SHALL record `needsParentApproval = true` unless the effect is already gated by the chore state machine.

### Requirement 8: MoneyPal capabilities and limits

**User Story:** As a child, I want MoneyPal to help me with allowance, spending, savings, and goals, so that money decisions come with helpful context.

#### Acceptance Criteria

1. THE PAL_Registry `money` entry SHALL allow only the tools needed for allowance, spending guidance, savings, goals, and reward logic, drawn from the existing `voice-tools` / wallet / goals / chores operations.
2. WHEN a Kid asks whether they can afford or buy something, THE MoneyPal turn SHALL recall the Kid's balance, active goals, and relevant Family_Rules (for example `spend_limit_per_txn`, `approved_merchants`) before producing a suggestion.
3. THE MoneyPal policy profile SHALL require Parent_Approval for any action that would move money, consistent with Requirement 7.
4. THE PAL_Registry `money` entry SHALL NOT grant access to Health_Memory thresholds for write, NOR to any safety tool.
5. WHEN a purchase would exceed a Family_Rule spending limit, THE MoneyPal turn SHALL deny or gate it per the Policy_Engine and SHALL suggest a cheaper or savings-oriented alternative.

### Requirement 9: HealthPal capabilities and limits

**User Story:** As a parent, I want HealthPal to weigh in on food, sugar, and nutrition during scans and food questions, so that health context is part of everyday choices.

#### Acceptance Criteria

1. THE PAL_Registry `health` entry SHALL allow read access to scan/detection results (reusing `bedrock.detectItems`) and SHALL allow it to produce nutrition nudges and suggestions.
2. THE PAL_Registry `health` entry SHALL NOT allow any tool that moves money; HealthPal SHALL only read and suggest.
3. WHEN a scanned or named item exceeds a Family_Rule health threshold (for example `sugar_limit_g`), THE HealthPal turn SHALL produce a warning and a healthier alternative suggestion.
4. WHEN both money and health considerations apply to one request (for example "can I buy this drink?"), THE Orchestrator SHALL include Family_Rules from both domains in the single turn's context and THE Policy_Engine SHALL apply the Decision_Hierarchy across them, producing one combined recommendation.
5. THE HealthPal turn SHALL be able to propose a Behavioral_Fact (for example "child often buys sugary drinks after school") as a Proposed_Fact subject to Requirement 4, and SHALL NOT silently store it.

### Requirement 10: Deferred specialist PALs defined as contracts

**User Story:** As a developer, I want StudyPal and SafetyPal defined as contracts now, so that the architecture accommodates them without committing to their domains yet.

#### Acceptance Criteria

1. THE PAL_Registry SHALL include `study` and `safety` entries with declared persona, allowed-tool list, memory-access scope, and policy profile, each marked `contract_only`.
2. THE Agent Foundation SHALL NOT create domain tables or tools for homework/streaks (StudyPal) or location/safe-zones (SafetyPal) in this spec.
3. WHEN the Router selects a `contract_only` PAL, THE Orchestrator SHALL behave per Requirement 2 criterion 5 (graceful unavailability, no tool dispatch).
4. THE `safety` contract SHALL declare the highest policy profile (most actions require Parent_Approval) to reflect its future privacy and safety weight.

### Requirement 11: Parent control surface

**User Story:** As a parent, I want to see and control what BrainPal knows and may do, so that I always feel like BrainPal helps me rather than replaces me.

#### Acceptance Criteria

1. THE Parent Control surface SHALL allow a Parent to view all Confirmed_Facts and Proposed_Facts for their family and each child.
2. THE Parent Control surface SHALL allow a Parent to confirm or reject any Proposed_Fact.
3. THE Parent Control surface SHALL allow a Parent to edit or reset a Confirmed_Fact and to edit a Kid's profile.
4. THE Parent Control surface SHALL allow a Parent to define and change Family_Rules: spending limits, health thresholds, allowance schedule, approved merchants, and (contract-only) safe zones.
5. WHEN a Parent resets or deletes a memory fact, THE Memory_Layer SHALL record the change in the Audit_Log and SHALL stop using that fact in subsequent recalls.
6. THE Parent Control endpoints SHALL be restricted to accounts with role `primary_parent` or `co_parent` in the target family, reusing the existing auth middleware and membership checks.
7. WHEN an action is gated with `needsParentApproval`, THE Parent Control surface SHALL allow a Parent to approve or deny it, and approval SHALL release the action to the Action Layer.

### Requirement 12: Evolution staging and non-goals

**User Story:** As a product owner, I want agent behavior to advance in controlled stages, so that the system grows without losing predictability.

#### Acceptance Criteria

1. THE Agent Foundation SHALL implement Stage 1 (rule-based) behavior: explicit Family_Rules and the Policy_Engine drive decisions.
2. THE Agent Foundation SHALL support Stage 2 (context-aware) behavior: Confirmed Personal, Family, and Behavioral memory inform suggestions within a turn.
3. THE Agent Foundation SHALL NOT implement Stage 3 (predictive) or Stage 4 (multi-agent coordination) behavior in this spec.
4. THE Agent Foundation SHALL NOT implement System_Memory (global learning) or the Capture → Evaluate → Improve → Promote loop in this spec.
5. THE design SHALL keep the Orchestrator to a single model call per turn and SHALL NOT introduce inter-PAL messaging or separate per-PAL services in this spec.

### Requirement 13: Memory consolidation

**User Story:** As a parent of a child who uses BrainPal for months and years, I want the system to distill its many small observations into a stable, accurate profile, so that memory stays meaningful and bounded instead of growing into noise or going stale.

#### Acceptance Criteria

1. THE Memory_Layer SHALL provide a Consolidation operation that, for one `account_id`, reads that account's active (non-expired) Behavioral_Memory facts and recent activity and produces one or more candidate Summary_Facts.
2. WHEN Consolidation produces a Summary_Fact, THE Memory_Layer SHALL write it as a Proposed_Fact with `source = 'consolidation'`, subject to the Write_Discipline of Requirement 4, and SHALL record in its value the ids of the granular facts it supersedes.
3. THE Agent Foundation SHALL require a Parent to confirm a Summary_Fact before it is treated as a Confirmed_Fact.
4. WHEN a Summary_Fact is confirmed, THE Memory_Layer SHALL mark each granular source fact it supersedes as `expired` (soft, status only) and SHALL NOT hard-delete any of them.
5. THE Memory_Layer SHALL NOT mark a granular fact `expired` by Consolidation until a Summary_Fact that supersedes it has been confirmed.
6. THE Consolidation operation SHALL act only on Behavioral_Memory and session-derived patterns, and SHALL NOT alter Confirmed personal-profile facts, Family_Rules, goals, or the `ledger`.
7. WHEN memory is recalled for a turn, THE Memory_Layer SHALL prefer a Confirmed Summary_Fact over the granular facts it supersedes, so the same pattern is not double-counted.
8. THE Memory_Layer SHALL trigger Consolidation on a configured schedule and/or WHEN an account's count of active Behavioral_Memory facts exceeds a configured threshold.
9. IF a parent rejects a proposed Summary_Fact, THEN THE Memory_Layer SHALL leave the granular source facts unchanged and active.
