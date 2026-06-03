# Live (WebRTC) Voice Onboarding — Setup

Replaces the stalled expo-audio onboarding with OpenAI Realtime GA over **WebRTC**:
phone ↔ OpenAI directly (ephemeral secret), API key stays server-side.

## 1. Install the native dependency (mobile)
```bash
# from repo root — aligns versions to Expo SDK 54
npx expo install react-native-webrtc @config-plugins/react-native-webrtc
# or: pnpm install   (package.json already pins react-native-webrtc 124.0.5)
```
`@config-plugins/react-native-webrtc` is already added to `apps/mobile/app.json` plugins.

## 2. Apply the DB migration
```bash
supabase db push          # applies 0008_agent_foundation.sql
pnpm --filter @brainpal/api db:generate   # verify no Drizzle drift
```
Creates `memory_facts`, `family_rules`, `agent_turns` (+ family-scope RLS).

## 3. Rebuild the dev client (WebRTC is native — Expo Go won't work)
```bash
# device build via EAS
pnpm --filter @brainpal/mobile build:ios      # eas build -p ios
# or local prebuild + run
cd apps/mobile && npx expo prebuild && npx expo run:ios --device
```

## 4. Env
Server already requires `OPENAI_API_KEY` (apps/api `.env`). No new vars.
The account must have a Realtime-enabled OpenAI key with `gpt-realtime` access.

## 5. Device test (must be a physical device — mic + WebRTC)
1. OTP login → land on parent dashboard.
2. Open the voice onboarding screen (`(auth)/voice-onboard`).
3. Grant mic permission. PAL should speak first, then converse hands-free
   (server VAD handles turn-taking — no tap needed).
4. Answer the 4 questions; when PAL calls `save_persona` it persists and routes
   to the dashboard.
5. Verify persistence:
   - `accounts.persona` + `account_type` set.
   - `memory_facts` rows (`source='onboarding'`, `status='confirmed'`).
   - parent food/save goal → a `family_rules` row (`status='proposed'`).

## Flow (reference)
```
client → POST /realtime/onboarding-token  → ephemeral clientSecret (+model)
client → getUserMedia(audio) + RTCPeerConnection + dc 'oai-events'
client → POST https://api.openai.com/v1/realtime/calls?model=… (Bearer clientSecret, application/sdp)
dc     ← transcript deltas / speech events / response.function_call_arguments.done(save_persona)
client → POST /realtime/persona {role,persona}  → accounts.persona + seedPersonaMemory()
```

## Notes / follow-ups
- Audio routes through the default output; if earpiece-vs-speaker routing is
  wrong on iOS, add `react-native-incall-manager` and force speaker on connect.
- Web + mic-denied still fall back to the text flow (`parent-onboarding` /
  `kid-persona`) — redirects already exist in `voice-onboard.tsx`.
- `family_rules` are written `proposed`; the parent confirms them in the
  (future) parent-control surface before any agent enforces them.
