# Implementation Plan: BrainPal Agent Foundation

## Status Summary

**None of the agent foundation has been built yet.** The Action Layer it builds on is already complete.

### What exists (reusable foundation — do NOT rebuild)
- ✅ `apps/api/src/routes/chat.ts` — inline single-PAL flow (`POST /chat`, `POST /chat/execute` for `add_chore`/`topup`/`set_goal`, `/chat/history`, `/chat/transcribe`). Becomes a thin Orchestrator caller.
- ✅ `apps/api/src/services/pal-context.ts` — `loadPalContext()` / `contextToSystemPrompt()`. The de-facto memory recall + prompt assembly; becomes a Memory Layer source.
- ✅ `apps/api/src/services/pal-intent.ts` — `parseIntent()` (its own prompt already says "MoneyPal"). Becomes the Router's understand step.
- ✅ `apps/api/src/services/voice-tools.ts` — `VOICE_TOOLS`, `resolveCallerParent`, `toolFindChild`, `toolCreateTask`; money-safety boundary documented. The Action Layer dispatcher.
- ✅ `apps/api/src/services/llm.ts` — `containsBannedPhrase()`, `getVerdict()` (HealthPal traffic-light), `streamReaction()`. Safety + health primitives.
- ✅ `apps/api/src/services/bedrock.ts` — `detectItems()` for scan-based HealthPal context.
- ✅ `apps/api/src/routes/{wallet,chores,goals}.ts` — `creditBrains()` + chore state machine (`pending → … → paid`). Money only moves here.
- ✅ `apps/api/src/db/schema.ts` — `accounts.persona` (jsonb), `families`, `memberships`, `chat_messages`, `call_sessions`, `inbox`, `ledger`, `goals`, `chores`. RLS family-scope pattern in migrations `0002`/`0003`.
- ✅ `apps/api/src/ws/{voice-realtime,twilio-media}.ts` — voice bridges already calling `voice-tools`.
- ✅ `packages/shared/src/` — workspace types package wired to api + mobile.

### What's missing (everything agent-foundation-specific)
- ❌ Shared contract `packages/shared/src/agent.ts` (`AgentTurn`)
- ❌ Tables `memory_facts`, `family_rules`, `agent_turns` + migration `0008_agent_foundation.sql`
- ❌ `apps/api/src/agent/memory.ts` (recall / propose / confirm / reject / sweep / consolidate)
- ❌ `apps/api/src/agent/policy.ts` (Decision Hierarchy `evaluate()`)
- ❌ `apps/api/src/agent/registry.ts` + `pals/{core,money,health,study,safety}.ts`
- ❌ `apps/api/src/agent/orchestrator.ts` (`runTurn()`)
- ❌ `apps/api/src/routes/agent-control.ts` (parent control) + route registration in `routes/index.ts`
- ❌ New `inbox.kind` values `memory_suggestion`, `approval_request`
- ❌ Orchestrator wiring into `chat.ts` and the voice bridges
- ❌ Retention sweep trigger + tests

---

## Overview

Implements [`requirements.md`](./requirements.md) per [`design.md`](./design.md). Tasks deliver the foundation bottom-up so each layer compiles against the one below: contract → data → memory → policy → registry → orchestrator → entry-point wiring → parent control → retention/tests. Each task is the **WHAT**; design.md is the **HOW**.

**Sequencing principle:** the substrate (memory, policy, registry) lands as pure, testable services *before* the Orchestrator wires them together, and *before* any entry point (`chat.ts`, voice) is switched over. The existing inline `chat.ts` flow keeps working until Phase 5 flips it, so there is no broken intermediate state.

**Tech context:** API is Hono + Node 20 + Drizzle in `apps/api`; verify with `pnpm --filter @brainpal/api typecheck`. Shared types in `packages/shared` (`pnpm --filter @brainpal/shared build`). DB migrations in `supabase/migrations/`, applied via `supabase db push`. Money-safety boundary (Requirement 7) is a hard invariant across every phase.

## Tasks

- [ ] 1. Shared contract and data model
  - [ ] 1.1 Add `AgentTurn` contract to `packages/shared/src/agent.ts`
    - Export `PalName`, `RiskLevel`, `TurnOutcome`, and the `AgentTurn` type exactly as in design § 1; re-export from `packages/shared/src/index.ts`.
    - API must consume this type and not redefine the shape locally.
    - _Requirements: 1.1, 1.2_
    - _Design: § Components 1_
  - [ ] 1.2 Author migration `supabase/migrations/0008_agent_foundation.sql`
    - Create `memory_facts`, `family_rules`, `agent_turns` with columns, defaults, and indexes from design § 2 and § Data Model Summary.
    - Enable RLS with family-scope policies mirroring migrations `0002`/`0003`.
    - Idempotent (`supabase db push` re-runnable).
    - _Requirements: 1.3, 3.1, 3.3, 3.4, 4.1_
    - _Design: § Components 2, § Data Model Summary_
  - [ ] 1.3 Append Drizzle tables to `apps/api/src/db/schema.ts`
    - Add `memoryFacts`, `familyRules`, `agentTurns` `pgTable` defs matching the migration; reuse existing column-type imports.
    - `pnpm --filter @brainpal/api db:generate` must show no drift vs `0008`.
    - _Requirements: 1.3, 3.1, 4.1_
    - _Design: § Components 2_

- [ ] 2. Memory Layer service (`apps/api/src/agent/memory.ts`)
  - [ ] 2.1 Implement `recall()`
    - Compose `loadPalContext()` with `memory_facts` + `family_rules`, filtered by the caller's PAL `memoryScope`.
    - Scope personal/behavioral facts to one `account_id`; never leak across kids. Exclude `status='expired'`; for action use, exclude `proposed`.
    - Return recalled fact ids for `AgentTurn.memoryUsed`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.6_
    - _Design: § Components 2_
  - [ ] 2.2 Implement `propose()` / `confirm()` / `reject()` with write discipline
    - `propose()` writes `status='proposed'` + `source` + `confidence`, and sends `inbox` kind `memory_suggestion` to the confirmer.
    - `confirm()` promotes to `confirmed`, recording `confirmed_by`/`confirmed_at`; agent code must never call it.
    - Conflicting observation creates a NEW proposed fact; never overwrites a Confirmed_Fact.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
    - _Design: § Components 2_
  - [ ] 2.3 Implement `sweep()` retention
    - Mark expirable facts `expired` (unconfirmed past TTL; routine facts tied to completed/abandoned goals); never hard-delete Confirmed_Facts.
    - Expose as a callable for a scheduled trigger.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
    - _Design: § Components 2_
  - [ ] 2.4 Implement `consolidate(accountId)` (memory consolidation)
    - Read active behavioral facts + recent `ledger` activity; distill via one model call into a few Summary_Facts written through `propose()` with `source='consolidation'` and `value.sourceFactIds=[...]`. No schema change (reuse `status`/`value`).
    - On confirmation of a Summary_Fact, mark its superseded granular facts `expired` (soft); never expire them before the summary is confirmed; never hard-delete. Touch only behavioral/session-derived patterns — not profile facts, `family_rules`, `goals`, or `ledger`.
    - `recall()` (task 2.1) must prefer a confirmed Summary_Fact over its superseded sources.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.9_
    - _Design: § Components 2 (Memory consolidation)_

- [ ] 3. Policy Engine (`apps/api/src/agent/policy.ts`)
  - [ ] 3.1 Implement `evaluate()` with the fixed Decision Hierarchy
    - Order: Safety → Parent rules → Family goals → Best suggestion → Optional action; higher-tier `deny` short-circuits.
    - Reuse `llm.containsBannedPhrase()` / `getVerdict()` for safety; do not add a parallel safety check.
    - Return `effect`, `appliedRuleIds` (→ `constraints`), `risk`, `reason`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_
    - _Design: § Components 3_
  - [ ] 3.2 Enforce parent-approval and the money boundary
    - Return `needs_parent_approval` when risk exceeds the PAL `policyProfile` threshold.
    - Deny any agent-proposed direct wallet credit; permit only `pending` task creation. Deny credit on caller-ID-only voice turns and on kid turns.
    - _Requirements: 6.8, 7.1, 7.2, 7.3, 7.4_
    - _Design: § Components 3_

- [ ] 4. PAL Registry (`apps/api/src/agent/registry.ts` + `pals/*.ts`)
  - [ ] 4.1 Define `PalConfig`/`PolicyProfile` and the five PAL configs
    - One file per PAL; `core`/`money`/`health` = `enabled`, `study`/`safety` = `contract_only` (safety = highest gating).
    - Set `allowedTools`, `memoryScope`, `policyProfile` per design § Components 4. `money` maps to `parseIntent`/`voice-tools` ops; `health` is read-only (`detectItems`/`getVerdict`), never money.
    - _Requirements: 2.1, 2.2, 8.1, 8.4, 9.1, 9.2, 10.1, 10.4_
    - _Design: § Components 4_
  - [ ] 4.2 Implement `route(intent) → PalConfig`
    - Map intents to one PAL; unmappable → `core`; expose only that PAL's `allowedTools`.
    - _Requirements: 2.3, 2.4, 2.7_
    - _Design: § Components 4, 5_

- [ ] 5. Orchestrator (`apps/api/src/agent/orchestrator.ts`) and entry wiring
  - [ ] 5.1 Implement `runTurn()` — Understand → Recall → Reason → Act → Learn
    - Build one `AgentTurn`; one model call exposing only allowed tools; run `policy.evaluate()` before any dispatch; on `needs_parent_approval` hold + `inbox` `approval_request`; on `deny` still return a best alternative; `contract_only` PAL → graceful no-tool reply.
    - Persist exactly one `agent_turns` row per turn (truncated suggestion, no raw prompts); on post-model failure persist `outcome='denied'` and dispatch nothing.
    - Combine money+health rules in one turn for "can I buy this drink?".
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.5, 2.6, 6.5, 9.3, 9.4, 9.5, 12.1, 12.2, 12.5_
    - _Design: § Components 5, § Architecture_
  - [ ] 5.2 Switch `routes/chat.ts` `POST /chat` to call `runTurn()`
    - Replace the inline recall/intent/completion block with a single `runTurn()` call; keep `POST /chat/execute` as the parent-confirmation effect endpoint (unchanged money path).
    - _Requirements: 1.1, 7.2_
    - _Design: § Components 5_
  - [ ] 5.3 Route voice tool calls through the Policy Engine
    - In `ws/voice-realtime.ts` and `ws/twilio-media.ts`, gate `voice-tools` dispatch through `policy.evaluate()` (preserve barge-in + caller-ID rules); deny credit on caller-ID-only turns.
    - _Requirements: 6.2, 7.3_
    - _Design: § Components 3, 5, § Error Handling_

- [ ] 6. Parent Control surface (`apps/api/src/routes/agent-control.ts`)
  - [ ] 6.1 Memory + rules endpoints
    - `GET /agent/memory`, `POST /agent/memory/:id/confirm|reject`, `PATCH`/`DELETE /agent/memory/:id`, `GET /agent/rules`, `PUT /agent/rules/:kind`. Restrict to parent roles via existing `requireAuth` + membership. Audit resets/deletes.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
    - _Design: § Components 6_
  - [ ] 6.2 Approval endpoints + route registration
    - `GET /agent/approvals`, `POST /agent/approvals/:turnId/decide` (approve releases the held action to the Action Layer). Register `agent-control` in `routes/index.ts` after auth-protected sub-apps.
    - Add narrow kid self-confirm for low-risk personal facts via `me.ts`.
    - _Requirements: 4.5, 11.7_
    - _Design: § Components 6_

- [ ] 7. Retention trigger, tests, and verification
  - [ ] 7.1 Wire the retention sweep and consolidation triggers
    - Invoke `memory.sweep()` on a schedule (cron/interval consistent with existing infra). Confirmed_Facts never hard-deleted.
    - Invoke `memory.consolidate(accountId)` on a schedule and/or when an account's active behavioral-fact count exceeds the configured threshold.
    - _Requirements: 5.1, 5.5, 13.8_
    - _Design: § Components 2 (Memory consolidation)_
  - [ ] 7.2 Tests per design § Testing Strategy
    - Policy hierarchy table tests (safety>money, parent-rule>money, money→approval, voice caller-ID cannot credit); memory write-discipline + conflict + expiry; consolidation (summary proposed→confirmed supersedes granular facts; granular never expired before summary confirmed; recall prefers summary, no double-count); routing incl. `contract_only`; orchestrator "can I buy this drink?" single-row + combined rules; money-boundary regression (no agent path to `ledger`/`creditBrains` except chore transition).
    - _Requirements: 2.4, 2.5, 4.2, 4.6, 5.3, 6.3, 6.4, 7.1, 9.4, 10.3, 13.4, 13.5, 13.7_
    - _Design: § Testing Strategy_
  - [ ] 7.3 Verify build
    - `pnpm --filter @brainpal/shared build` and `pnpm --filter @brainpal/api typecheck` clean; `db:generate` no-drift.
    - _Requirements: 1.2, 1.3_
    - _Design: § Testing Strategy_

## Non-Goals (this spec)

Per Requirement 12: no Stage 3 (predictive) or Stage 4 (multi-agent coordination); no System_Memory / global learning; no Capture→Evaluate→Improve→Promote loop; no inter-PAL messaging or per-PAL services; no StudyPal/SafetyPal domain tables or tools (contracts only). These are P1+ and should be separate specs once Money/Health prove the pattern.
