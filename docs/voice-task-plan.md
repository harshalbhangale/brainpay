# BrainPal Voice-Task Feature — Build Plan

> Parent calls a phone number → speaks a task → AI creates it via tools → WhatsApp confirms → kid completes → wallet credited. Built on the EXISTING codebase, reusing the Realtime bridge, chores state machine, and ledger.

## Principle
The AI never touches money or DB directly. It only calls approved backend tools. Money moves only through the existing `chores` state machine (`pending → ... → paid`) and `creditBrains()` transaction. This mirrors the existing `/chat/execute` boundary.

## What already exists (reuse, don't rebuild)
- `wallet.ts creditBrains()` — atomic ledger credit (the "ledger agent")
- `chores.ts` — task CRUD + state machine + payout
- `voice-realtime.ts` — OpenAI Realtime WebSocket bridge (built for onboarding)
- `push.ts` — notification template pattern to mirror for WhatsApp
- `twilio.ts` — Twilio auth pattern (SMS); reuse account SID/token

## Identity & money safety (the one hard decision)
- Inbound caller identified by matching Twilio `From` → `accounts.phone`.
- Voice can CREATE tasks freely (status `pending`).
- Voice CANNOT credit a wallet directly. Credit only happens through the
  existing `parent_approved → paid` transition (kid completes, parent approves).
- This keeps caller-ID spoofing from ever moving money.

## New env vars (apps/api/src/env.ts)
- `TWILIO_VOICE_NUMBER` — the inbound number (E.164)
- `PUBLIC_BASE_URL` — public https URL for TwiML webhooks / media stream
- `TWILIO_MESSAGING_SERVICE_SID` — SMS sender (preferred for AU)
- `TWILIO_MESSAGING_FROM` — or a plain From number
- All optional so the server still boots without them.

## New tables (apps/api/src/db/schema.ts)
- `call_sessions` — id, accountId(nullable), fromPhone, twilioCallSid, openaiSessionId, status, transcript(jsonb), startedAt, endedAt
- `sms_messages` — id, accountId(nullable), toPhone, template, variables(jsonb), messageSid, status, createdAt

## Phases (each shippable on its own)

### Phase 1 — SMS service (no telephony yet)
- `services/sms.ts` — `sendSms(to, body)` mirroring `push.ts`, with `SmsTemplates` (taskCreated, taskAssigned, taskCompleted, rewardPaid). Reuses the existing Twilio account.
- Logs each send into `sms_messages`.
- Wire into existing chore flows alongside push (parallel channel, not replacement).

### Phase 2 — Voice tool layer
- `services/voice-tools.ts` — defines the OpenAI tool schemas (`find_child`, `create_task`) and a dispatcher that calls existing chore/family logic with full validation (family, role, identity).
- Pure functions — callable from both the voice bridge and tests.

### Phase 3 — Twilio Voice inbound + media bridge
- `routes/twilio-voice.ts` — `POST /twilio/voice/incoming` returns TwiML opening a Media Stream to `/twilio-media`.
- `ws/twilio-media.ts` — bridges Twilio ↔ OpenAI Realtime, registers tools, identifies caller, writes `call_sessions`.
- Register `/twilio-media` upgrade in `index.ts` (same pattern as `/live`, `/voice-rt`).

**Protocol (aligned with official twilio-samples reference):**
- Model: `gpt-realtime` (GA), NOT the beta `gpt-4o-realtime-preview`.
- No `OpenAI-Beta` header (GA doesn't need it).
- Session shape: `{ type: 'realtime', output_modalities: ['audio'], audio: { input: { format: { type: 'audio/pcmu' }, turn_detection, transcription }, output: { format: { type: 'audio/pcmu' }, voice } }, tools, tool_choice }`.
- Both sides speak G.711 μ-law (`audio/pcmu`) — no resampling.
- Audio out event: `response.output_audio.delta` (GA name).
- **Barge-in interruption handling**: on `input_audio_buffer.speech_started`, truncate PAL's in-flight item (`conversation.item.truncate` with mark-queue-computed `audio_end_ms`) and send Twilio a `clear` event. Without this, PAL talks over the caller.
- Tools: flat `{ type: 'function', name, description, parameters }` shape at session level.

### Phase 4 — Notify on task creation
- When the voice tool creates a task, fire `sendSms` to parent (confirmation) and kid (assignment), and `sendPushToAccount` to kid.

## Acceptance
- Parent calls the number, says a task, it lands in `chores` as `pending`.
- SMS confirmation sent to parent + assignment to kid.
- Kid completes via existing chore-verify → parent approves → existing payout credits wallet + writes ledger.
- No duplicate tasks (idempotency by callSid+title).
- Every call has a `call_sessions` row.
