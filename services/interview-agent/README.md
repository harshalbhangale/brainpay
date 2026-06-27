# Interview Agent — Phase 2 (Option B: we drive the brain)

A LiveKit Agents worker that **conducts the oral viva itself**. Our own LLM (driven
by the generated interview blueprint) asks the questions, adapts, and probes; Runway
is used purely as the **visual layer** — it renders the "Simon" avatar's face from the
agent's synthesized speech.

This is the high-control counterpart to **Phase 1 (Option A)**, which is already
live: there the Runway avatar's own brain asks questions from a knowledge document.
Use Phase 1 for the simple path; use Phase 2 when you want exact, adaptive,
rubric-driven questioning.

```
user mic ─▶ STT (Deepgram) ─▶ LLM (OpenAI, blueprint) ─▶ TTS (ElevenLabs) ─▶ Runway avatar ─▶ video+audio
```

## Status

⚠️ **Scaffold — not yet run end-to-end.** It needs a LiveKit account (keys below)
and a Python runtime, neither of which were available when this was written. The
Phase 1 path is fully working and live-verified; this Phase 2 worker is wired to the
same blueprint + avatar but must be validated once you provide LiveKit credentials.
Pin plugin versions and re-check the Runway LiveKit plugin API
(https://docs.dev.runwayml.com/characters/livekit/) before first run.

## Prerequisites

1. **LiveKit Cloud** project → copy `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. **Deepgram** API key (STT). (Swappable for `openai.STT` if you prefer.)
3. Existing **OpenAI**, **ElevenLabs**, and **Runway** keys (reuse from the API `.env`).

## Run (local)

```bash
cd services/interview-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in the keys
python agent.py dev    # starts the worker; waits for dispatched jobs
```

## How it connects to the app

Three pieces wire Phase 2 into BrainPal. Only the agent worker lives here; the other
two are small additions to `apps/api` and `apps/web`, to add **when you turn Phase 2
on** (kept out of the live build so they don't require LiveKit keys to boot):

1. **Server dispatch** (`apps/api`): a route that, for an `agent`-mode interview,
   - generates the blueprint (reuse `generateBlueprint`, already built),
   - mints a LiveKit room + a join token for the student (via `livekit-server-sdk`),
   - dispatches this agent into the room with the blueprint as job metadata:
     ```ts
     // pseudo — needs `livekit-server-sdk`
     import { AgentDispatchClient, RoomServiceClient, AccessToken } from 'livekit-server-sdk'
     const metadata = JSON.stringify({ blueprint, kidName })
     await new AgentDispatchClient(LIVEKIT_URL, KEY, SECRET)
       .createDispatch(roomName, 'interview-agent', { metadata })
     const token = await studentJoinToken(roomName, accountId) // grants join
     return { provider: 'agent', livekit: { url: LIVEKIT_URL, token, roomName } }
     ```
2. **Client** (`apps/web`): when `provider === 'agent'`, join the LiveKit room
   directly with `@livekit/components-react` (already transitively installed) and
   reuse the same WhatsApp two-up layout — Simon's published video track on top, the
   local camera on the bottom. The transcript still flows to `/study/interviews/:id/complete`
   for scoring (same as Phase 1).
3. **This worker**: reads `blueprint` from job metadata and runs the viva.

## Why metadata, not an API callback

The blueprint travels in the dispatch metadata so the agent needs no API token or
callback. If you prefer a callback, add `GET /study/topics/:id/blueprint` (already
implemented and authed) and fetch it with a service token instead.

## Switching STT/TTS

- STT: `deepgram.STT(model="nova-3")` → or `openai.STT()`.
- TTS: `elevenlabs.TTS(voice_id=...)` → set `ELEVENLABS_TUTOR_VOICE_ID` to Simon's voice.
- LLM: `openai.LLM(model="gpt-4o-mini")` → swap model as needed.
