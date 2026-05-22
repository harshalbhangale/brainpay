# BrainPal — Camera Feature: End-to-End Reference

This document explains how the live camera feature works from the moment the user opens it to the moment PAL stops talking. Read top to bottom for the full picture, or jump to any section using the table of contents.

---

## Table of contents

1. [The user-facing experience](#1-the-user-facing-experience)
2. [Architecture overview](#2-architecture-overview)
3. [Data flow — one frame at a time](#3-data-flow--one-frame-at-a-time)
4. [The mobile pipeline (capture, send, render)](#4-the-mobile-pipeline-capture-send-render)
5. [The server pipeline (perception, voice, detail)](#5-the-server-pipeline-perception-voice-detail)
6. [The wire protocol](#6-the-wire-protocol)
7. [The animations](#7-the-animations)
8. [The detail sheet](#8-the-detail-sheet)
9. [Latency budget](#9-latency-budget)
10. [Failure modes and what happens](#10-failure-modes-and-what-happens)
11. [Where to look in code](#11-where-to-look-in-code)

---

## 1. The user-facing experience

Open camera tab → green fog/shimmer fades out → camera preview is live.

Point camera at any object (a Coke can, a banana, a laptop). After ~1.5 seconds:
- A ripple ring expands outward from the object
- A coin badge springs in showing the score and a 🟢 / 🟡 / 🔴 ring
- PAL says one sarcastic line about it
- The item name and quote appear at the bottom

Tap the coin → a detail sheet slides up with:
- Traffic light verdict (Good choice / Okay / Think twice)
- Brains delta (+15 or −10)
- PAL's quote
- Estimated price (if known)
- "What's in it" (ingredients summary)
- "Why it's good" or "Why it's not great"
- "For you specifically" (health context for kids 10–14)
- **Skip it +2 🧠** and **Add to cart ±N 🧠** buttons

Move the camera away → after a few misses, the coin disappears and we're back to the idle state.

---

## 2. Architecture overview

Three machines, one persistent connection:

```
┌─────────────────┐                           ┌──────────────────────────┐
│  Mobile (iOS)   │ ─── wss://api.zapfan.com/live ─────▶                 │
│  Expo / RN      │                           │  Hono on ECS Fargate     │
│  CameraView     │ ◀──── JSON + binary MP3 ──│  ap-southeast-2          │
└─────────────────┘                           └────────────┬─────────────┘
                                                           │
                                                  ┌────────┼────────────────┐
                                                  ▼        ▼                ▼
                                            ┌──────────┐ ┌─────────┐ ┌──────────┐
                                            │ Bedrock  │ │ OpenAI  │ │ElevenLabs│
                                            │ Nova     │ │ gpt-4o- │ │ Flash    │
                                            │ Lite     │ │ mini    │ │ v2.5     │
                                            └──────────┘ └─────────┘ └──────────┘
                                            (perception) (verdict +  (TTS audio
                                                          PAL line)   stream)
```

**Mobile** captures frames and renders the overlay. It's a thin client — no AI logic on device.

**API** is the brain. It owns the WebSocket, runs perception, generates the verdict, calls TTS, and pushes everything back over the same socket.

**The three AI services** are all called from the API in parallel. Mobile never talks to them directly.

---

## 3. Data flow — one frame at a time

Here's what happens from a single tick of the capture loop:

```
[T+0ms]    Mobile timer fires (every 1500ms)
[T+0ms]    cameraRef.takePictureAsync() → JPEG file written to cache
[T+~80ms]  expo-image-manipulator resizes to 384px wide, q60 JPEG
[T+~120ms] Read file as base64 → Uint8Array
[T+~130ms] Prepend tag byte 0x01 → ws.send(buffer)
[T+~180ms] Bytes arrive at API server (TLS + ALB)
[T+~190ms] Server decodes frame, calls Bedrock Nova Lite with the JPEG
[T+~700ms] Bedrock returns: { items: [{name, category, healthScore, confidence, bbox}] }
[T+~700ms] Hysteresis check: was this same item seen N-1 frame? Hit count ≥ 2?
           If YES and not currently active:
             → Generate detectionId
             → Fire getVerdict() to OpenAI in parallel
[T+~1000ms] gpt-4o-mini returns verdict JSON
[T+~1000ms] Server sends { type: 'detection.appeared', ..., verdict } to mobile
[T+~1010ms] Mobile receives → spring animation → coin appears, ripple ring expands
[T+~1010ms] In parallel: server fires speakReaction()
[T+~1100ms] gpt-4o-mini streams PAL line tokens
[T+~1150ms] First tokens trigger ElevenLabs WS
[T+~1300ms] First MP3 chunk arrives at server → forwarded to mobile as 0x02 frame
[T+~1310ms] Mobile buffers MP3 chunks by detectionId
[T+~1700ms] Server emits speech.ended with full text
[T+~1700ms] Mobile assembles MP3 buffer → writes to cache → expo-audio plays
[T+~1750ms] PAL voice plays through phone speaker
```

That's the happy path for a fresh detection. Subsequent frames of the same item just send `detection.updated` events to keep the anchor position in sync.

---

## 4. The mobile pipeline (capture, send, render)

File: `apps/mobile/app/(app)/camera.tsx`

### 4.1 Permission and camera setup

On mount:
1. Ask for camera permission via `useCameraPermissions()`. If denied with `canAskAgain`, prompt again.
2. Set audio mode (`playsInSilentMode: true`, `duckOthers`) so PAL plays even if the iPhone is on silent.
3. Render `<CameraView facing="back" onCameraReady={...} />` to fill the screen.

### 4.2 WebSocket connection

When permission is granted, call `connectLive()` (from `lib/ws.ts`). This:
- Opens `WebSocket(env.wsUrl)` (defaults to `wss://api.zapfan.com/live`)
- Sets `binaryType = 'arraybuffer'` so we can receive MP3 chunks as raw bytes
- Wires four callbacks: `onOpen`, `onClose`, `onError`, `onJson`, `onAudioChunk`

The same socket is used to both send frames (binary, tag 0x01) and receive everything back.

### 4.3 The capture loop

Once both `cameraReady` and `perm.granted` are true, a recursive `setTimeout` loop runs every 1500ms:

```ts
const tick = async () => {
  if (cancelled || inFlight) return scheduleNext()
  inFlight = true
  try {
    const photo = await cameraRef.takePictureAsync({ quality: 0.5, shutterSound: false })
    const shrunk = await ImageManipulator.manipulateAsync(
      photo.uri, [{ resize: { width: 384 } }], { compress: 0.6, format: JPEG }
    )
    const b64 = await FileSystem.readAsStringAsync(shrunk.uri, { encoding: Base64 })
    const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
    sock.sendFrame(bytes)
    deleteAsync(photo.uri)
    deleteAsync(shrunk.uri)
  } finally {
    inFlight = false
    scheduleNext()
  }
}
```

Three guarantees:
1. **Never overlap** — `inFlight` flag ensures we never have two captures running at once
2. **Skip if disconnected** — `sock.isOpen()` check before sending
3. **Always clean up** — deleted JPEGs from cache, even on error

Why 1500ms? It's well below Bedrock's burst quota and gives the server time to run perception + verdict + voice without queueing. A faster cadence would just drop frames upstream.

### 4.4 Receiving messages

`onJson` dispatches to a switch statement based on `msg.type`:

| Type | What happens |
|---|---|
| `session.started` | Log it |
| `detection.appeared` | Set `detection` state with all fields including `verdict` |
| `detection.updated` | Update `anchor` only (keeps coin tracking moving items) |
| `detection.cleared` | Clear `detection`, close detail sheet if open |
| `speech.started` | Initialize audio buffer for this `detectionId` |
| `speech.ended` | Set `palLine` text, kick off `playSpeech()` to assemble + play |

`onAudioChunk` appends each MP3 chunk to a `Map<detectionId, Uint8Array[]>` keyed by the currently-playing detection.

### 4.5 Audio playback

Why we don't stream-play: `expo-audio` can't play partial MP3 streams, only complete files. So we buffer all chunks until `speech.ended`, concatenate them into one buffer, write to cache as `pal-{detectionId}.mp3`, and play with `createAudioPlayer({ uri: path })`.

This adds ~50ms vs true streaming, but it's reliable. When ElevenLabs streaming via `expo-av` lands properly we'll switch.

### 4.6 The overlay rendering

The coin position is computed from `detection.anchor` which is `[cx, cy]` normalized 0..1:

```ts
left: `${Math.round(cx * 100)}%`
top:  `${Math.round(cy * 100)}%`
```

The badge has `marginLeft: -44, marginTop: -44` to center the 88×88 badge on the anchor point.

When `detection.updated` fires with a new anchor, React re-renders the `CoinBadge` at the new position. There's no smooth interpolation between positions — it teleports. Movement is rare (kids hold the phone roughly still) and the 1.5s frame interval makes any movement feel slow anyway.

---

## 5. The server pipeline (perception, voice, detail)

File: `apps/api/src/index.ts` boots the WS server, then dispatches to:
- `apps/api/src/ws/handler.ts` — connection lifecycle
- `apps/api/src/ws/perception.ts` — frame dispatch + state machine
- `apps/api/src/ws/voice.ts` — PAL speech pipeline

### 5.1 Connection lifecycle

`onConnect(ws)`:
1. Generate a `sessionId` (UUID)
2. Create a `SessionState` object stored in a `WeakMap<WebSocket, SessionState>`
3. Send `{ type: 'session.started', sessionId }` to client

`SessionState` shape:

```ts
{
  sessionId: string
  current: { itemId, hits, misses, latest } | null   // candidate being tracked
  active: { detectionId, itemId } | null              // currently shown to user
  lastSpokeAt: Record<itemId, timestamp>              // 30s cooldown per item
  voiceAbort: AbortController | null                  // to cut off in-flight TTS
  framesSent, detections, reactions: number           // metrics
}
```

State is in-process. **TODO(scale)**: when we run >1 ECS task, this needs to move to Redis or use ALB sticky sessions (already enabled).

### 5.2 The frame handler

`onMessage(ws, data)` looks at the first byte:
- `0x01` = JPEG frame → call `onFrame(ws, jpegBytes)`
- otherwise = JSON control message (`interrupt`, `session.end`)

`onFrame()` is the core state machine. For each frame:

**Step 1 — Call Bedrock**

`detectItems(jpegBytes)` calls Amazon Nova Lite (via Bedrock) with a structured JSON schema. Nova returns:

```json
{
  "items": [{
    "name": "Coca-Cola Classic 375ml can",
    "category": "drink",
    "healthScore": -10,
    "confidence": 0.92,
    "bbox": [0.3, 0.4, 0.2, 0.4]
  }]
}
```

Why Bedrock Nova Lite? Same region as our Fargate task (~10ms hop), structured output support, ~400ms p50 inference. Gemini 2.0 Flash was the original pick but Bedrock won on co-location and pricing.

**Step 2 — Hysteresis filter**

If `confidence < 0.4` or no items returned → bump miss counter. Otherwise:

- If same `itemId` (slug of name) as previous frame: increment hit, reset miss
- If different: reset to `{itemId, hits: 1, misses: 0}`

This prevents flicker. We need **2 consecutive hits** to declare a detection appeared, and **5 consecutive misses** to declare it cleared.

**Step 3 — Emit appropriate event**

| State transition | Event sent |
|---|---|
| `hits >= 2` and no current active detection | `detection.appeared` |
| `hits >= 2` and different item is active | `detection.cleared` (old) → `detection.appeared` (new) |
| Same active item, new bbox | `detection.updated` |
| `misses >= 5` while active | `detection.cleared` |

**Step 4 — Voice + verdict trigger**

Only when a NEW detection appears:

1. Check 30s cooldown (don't speak about the same item twice in 30s)
2. If allowed, fire `getVerdict()` (OpenAI) and `speakReaction()` (Grok→ElevenLabs) in parallel
3. The verdict is `await`ed before sending `detection.appeared` so it ships in the same message
4. The voice runs as fire-and-forget — the audio frames stream back independently

### 5.3 The verdict generator

`apps/api/src/services/llm.ts:getVerdict()`

Uses **gpt-4o-mini** with `response_format: { type: 'json_object' }` and `temperature: 0` for determinism. The prompt asks for:

- `trafficLight`: green | amber | red
- `ingredientsSummary`: one short line (e.g. "39g sugar, 0 protein, 330ml")
- `whyBad` / `whyGood`: one sentence explanation
- `healthContext`: one sentence aimed at a 10–14 year old
- `estimatedPrice`: AUD price if known, omitted if uncertain

Falls back to a derived traffic light from `healthScore` if the call fails. Never blocks the perception loop more than ~300ms.

### 5.4 The voice pipeline

`apps/api/src/ws/voice.ts:speakReaction()`

```
streamReaction (gpt-4o-mini, streaming)
  → guardedTokens() (banned-phrase regex check mid-stream)
  → streamTTS (ElevenLabs WSS, MP3 chunks back)
  → encodeAudioChunk(seq++, mp3) (binary frame with seq number)
  → ws.send(...) over the same client WS
```

The PAL system prompt enforces:
- Max 15 words
- Roast the product, never the kid
- Lead with reaction word ("oh", "ugh", "okay")
- End with the score (`+15` or `−10`)

Banned phrases (`should`, `must`, `careful`, etc.) abort the stream and substitute a fallback line.

ElevenLabs config:
- Model: `eleven_flash_v2_5` (~150ms first chunk)
- Voice: configured in `ELEVENLABS_VOICE_ID` secret
- Format: `mp3_44100_128`
- Settings: `stability: 0.3, similarity_boost: 0.8, style: 0.6`

Aborting works via `AbortController`. Tap-to-interrupt on the client sends `{type: 'interrupt'}`, server calls `state.voiceAbort.abort()` which cuts both the OpenAI stream and the ElevenLabs WS.

---

## 6. The wire protocol

Defined in `packages/shared/src/ws-contract.ts`.

### 6.1 Binary framing

**Client → Server:**
```
[0x01] [JPEG bytes...]
```

**Server → Client (audio):**
```
[0x02] [seq u32 BE] [MP3 bytes...]
```

The `seq` byte ordering allows the client to detect dropped chunks (currently unused but reserved).

### 6.2 JSON messages

**Server → Client:**

```ts
type WsServerMessage =
  | { type: 'session.started', sessionId }
  | { type: 'detection.appeared',
      detectionId, itemId, brand, product,
      coinDelta, emoji, bbox: [x,y,w,h], anchor: [cx,cy],
      verdict?: { trafficLight, ingredientsSummary, whyBad?, whyGood?, healthContext, estimatedPrice? } }
  | { type: 'detection.updated', detectionId, anchor: [cx,cy] }
  | { type: 'detection.cleared', detectionId }
  | { type: 'speech.started', detectionId }
  | { type: 'speech.ended', detectionId, text? }
  | { type: 'error', code, message }
```

**Client → Server:**

```ts
type WsClientMessage =
  | { type: 'interrupt', reason: 'tap' | 'item_changed' }
  | { type: 'session.end' }
```

All schemas are zod-validated so a malformed message is rejected loudly rather than silently breaking state.

---

## 7. The animations

Three pieces of motion, all using React Native's `Animated` API (no Skia, no Reanimated). Native driver where possible for 60fps off the JS thread.

### 7.1 Fog wake (camera open)

Component: `FogWake` in `camera.tsx`.

Four nested radial-ish `View` layers with progressively brighter centers. On mount:
- `opacity` 1 → 0 over 900ms (delay 200ms)
- `scale` 1 → 1.08 over 900ms (delay 200ms)

The effect: the screen starts fully dimmed with concentric green glows, then expands and fades out, revealing the live camera feed underneath. Runs once per session (`fogDone` state). Pure CSS-style View layering — no shaders, no GPU work beyond standard compositing.

### 7.2 Ripple ring (detection entrance)

Component: `RippleRing` inside `CoinBadge`.

A 120×120 circular border that:
- Spring-scales from 0.4 → 1 (tension 80, friction 5)
- Opacity goes 0.8 → 0 over 700ms (delay 300ms)

Each new detectionId remounts the ripple via a `key={rippleKey}` increment, so swapping items re-fires the animation. Color matches the traffic light.

### 7.3 Coin spring-in

The `CoinBadge` itself scale-springs from 0 → 1 (tension 100, friction 4). Combined with the ripple, the detection entrance feels like:

```
ring expands ─→ coin pops in ─→ ring fades out
   (300ms)        (200ms)          (700ms)
```

### 7.4 Detail sheet slide-up

`DetailSheet` uses `translateY` from 400 → 0 with a spring (tension 60, friction 7). On dismiss it animates back to 500 over 220ms with a timing animation (faster, cleaner exit).

The backdrop dim (`rgba(0,0,0,0.5)`) is rendered as a separate `Pressable` so tapping outside dismisses.

---

## 8. The detail sheet

Component: `DetailSheet` in `camera.tsx`.

### 8.1 Layout

```
┌─────────────────────────────────────────┐
│           ──── handle bar ────          │
├─────────────────────────────────────────┤
│  [emoji]  🟢 GOOD CHOICE       [+15  ]  │ ← header (bg color = traffic light)
│           Coca-Cola Classic    [BRAINS]  │
├─────────────────────────────────────────┤
│  🤖  "Liquid candy in a red can. −10."  │ ← PAL quote
├─────────────────────────────────────────┤
│  💰  ESTIMATED PRICE                    │
│      $3.50                              │
├─────────────────────────────────────────┤
│  🔬  WHAT'S IN IT                       │
│      39g sugar, 0 protein, 330ml        │
├─────────────────────────────────────────┤
│  ⚠️   WHY IT'S NOT GREAT  (red bg)      │
│      That's 2x your daily sugar limit   │
│      in one can.                        │
├─────────────────────────────────────────┤
│  🧬  FOR YOU SPECIFICALLY               │
│      A 12yo only needs 25g sugar/day.   │
├─────────────────────────────────────────┤
│  [ Skip it +2 🧠 ]  [ Add to cart 🧠 ]  │ ← actions
└─────────────────────────────────────────┘
```

### 8.2 Behavior

- **Skip it** → closes sheet, awards +2 Brains for resisting (currently UI-only — DB not wired)
- **Add to cart** → closes sheet, sends `interrupt` to server (cuts PAL audio), eventually triggers `POST /wallet/purchase` (currently UI-only)
- **Tap backdrop** → dismiss with no action
- **Drag down on handle** — not yet implemented (would need `PanGestureHandler`)

### 8.3 Conditional rendering

Each section only renders if its data is present:
- `whyBad` shown only when health score < 0
- `whyGood` shown only when score ≥ 0
- `estimatedPrice` only when GPT-4o-mini was confident enough to include it
- `palLine` only after `speech.ended` has fired

This keeps the sheet honest — no fake "$0" or "ingredients unknown" placeholders.

---

## 9. Latency budget

Target: **first audible PAL word ≤ 800ms p50**, ≤ 1100ms acceptable.

| Stage | Budget | Actual (typical) |
|---|---|---|
| Frame encode (mobile) | ≤50ms | ~80ms |
| Upload over WSS | ≤80ms | ~50ms (AU-region) |
| Bedrock Nova Lite inference | ≤350ms | ~500-700ms |
| Hysteresis decision (2 hits) | +1500ms (one extra frame) | inherent |
| OpenAI verdict (gpt-4o-mini) | ≤300ms | ~250-400ms |
| OpenAI PAL line stream TTFT | ≤250ms | ~200-300ms |
| ElevenLabs first MP3 chunk | ≤200ms | ~150-250ms |
| Audio assembly + playback start | ≤100ms | ~50-80ms |

**Real-world end-to-end (point camera → first audio):** ~2.5-3.5 seconds the first time, dropping to ~1.5s for already-cooled-down items in the same session because the perception result is cached in the hysteresis state.

The perceived feel is closer to "instant" because:
1. The fog wake animation hides the WS connect delay
2. The ripple + coin spring runs while audio is still buffering
3. PAL voice arrives ~200ms after the coin appears, so the visual pop already established the moment

---

## 10. Failure modes and what happens

| Failure | What user sees |
|---|---|
| Camera permission denied | "Camera permission needed" + Grant button |
| WS fails to connect | Red "OFFLINE" pill in HUD, no detections |
| WS drops mid-session | Pill flips to OFFLINE; reconnect not yet implemented |
| Bedrock returns empty/low-confidence | Nothing appears; idle state |
| Bedrock errors | Logged server-side; mobile shows nothing for that frame |
| OpenAI verdict fails | Detail sheet shows traffic light + score only, no rich text |
| PAL line generation fails | Fallback templated line is sent ("Genuinely a good shout. +N.") |
| Banned phrase detected mid-stream | Stream aborted, fallback line substituted |
| ElevenLabs WS errors | No audio plays, but quote text still appears |
| User taps interrupt while PAL is talking | Audio stops within ~100ms via AbortController |
| Take picture fails (camera busy) | Frame skipped, next tick retries |

Nothing in this list crashes the app or drops the WS. Every failure degrades gracefully to "less rich experience".

---

## 11. Where to look in code

### Mobile

| File | Responsibility |
|---|---|
| `apps/mobile/app/(app)/camera.tsx` | Everything: capture loop, WS handlers, all overlay components |
| `apps/mobile/lib/ws.ts` | `connectLive()` — typed WS client with binary framing |
| `apps/mobile/lib/env.ts` | `EXPO_PUBLIC_*` env reading + defaults |
| `apps/mobile/theme/tokens.ts` | Colors, spacing, typography tokens |

### API

| File | Responsibility |
|---|---|
| `apps/api/src/index.ts` | Hono boot, WS upgrade handler |
| `apps/api/src/ws/handler.ts` | `onConnect`, `onMessage`, `onClose` dispatch |
| `apps/api/src/ws/perception.ts` | Hysteresis state machine, detection events |
| `apps/api/src/ws/voice.ts` | PAL stream → guardrail → TTS → audio frames |
| `apps/api/src/ws/framing.ts` | Binary tag encode/decode helpers |
| `apps/api/src/services/bedrock.ts` | Nova Lite call, structured JSON schema |
| `apps/api/src/services/llm.ts` | OpenAI for both verdict and PAL streaming |
| `apps/api/src/services/elevenlabs.ts` | Streaming TTS WebSocket |

### Shared

| File | Responsibility |
|---|---|
| `packages/shared/src/ws-contract.ts` | All WS message zod schemas + binary tags |

---

## Glossary

- **Brains** — BrainPal's currency name. 1 Brain ≈ 1 cent in DB (when wired).
- **Anchor** — Normalized [cx, cy] coordinates 0..1 of the object center, used to position the coin badge.
- **bbox** — `[x, y, width, height]` of the detected object, all 0..1 normalized. Currently sent but not rendered as an outline.
- **Hysteresis** — The hit/miss counter that prevents detection flicker. 2 hits to appear, 5 misses to clear.
- **Cooldown** — 30-second gate to prevent PAL from speaking about the same item twice in a row.
- **Verdict** — The structured JSON returned by gpt-4o-mini with traffic light, ingredients, why good/bad, health context.
- **Detection ID** — UUID generated server-side, used to correlate audio chunks with their text.
- **Traffic light** — Green / amber / red signal derived from health score, replaces raw numbers as the primary visual cue.
