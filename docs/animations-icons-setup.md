# Animations & Premium Icons — Setup

## What's added
- **`lottie-react-native`** (already in deps) for animated illustrations.
- **5 original, commercial-safe Lottie assets** in `apps/mobile/assets/lottie/`
  (`confetti`, `coin-burst`, `success`, `loading`, `empty`) — hand-authored, no
  attribution/licensing needed.
- **`components/Lottie.tsx`** — one wrapper, named presets:
  `<Lottie name="confetti|coinBurst|success|loading|empty" size={…} loop />`.
  Web renders nothing (gracefully); native plays.

## Where it's wired
| Moment | File | Animation |
|---|---|---|
| Any celebration (`<Confetti show>`) | `components/Confetti.tsx` | `confetti` — auto-applies to **every** caller (top-up, NFC, chore-approved, …) |
| NFC payment success | `(app)/checkout-nfc.tsx` | `success` (replaced `✓`) |
| Top-up sent | `(app)/topup.tsx` | `success` (replaced icon circle) |
| Welcome hero | `(auth)/welcome.tsx` | `coinBurst` (looping) |
| Empty states | `components/EmptyState.tsx` | optional `lottie="empty"` prop (icon stays default) |

To use the empty-state animation on a screen: `<EmptyState lottie="empty" icon={…} title=… subtitle=… />`.

## Install + rebuild (required — Lottie is native)
```bash
pnpm install                 # picks up phosphor-react-native (+ lottie already present)
# rebuild the dev client (folds into the WebRTC rebuild):
cd apps/mobile && npx expo run:ios --device     # or: pnpm --filter @brainpal/mobile build:ios
```
Until installed, `tsc` will error on `lottie-react-native` / `phosphor-react-native`
module resolution — that's expected, not a code bug.

## Upgrading to premium art later (free + commercial)
The hand-authored JSON is clean but simple. To swap in studio-grade art, drop a
LottieFiles JSON into `assets/lottie/` (same filename) — no code change. Pick from
**lottiefiles.com**, filtering to **Free** with a license that allows commercial
use. Good searches: "confetti", "coins reward", "success check", "wallet kids",
"empty box". Verify each file's license before bundling.

## Still pending (approved, not yet done)
- **Phosphor tab bar** (`components/TabBar.tsx`) — premium duotone/fill icons.
  Mapping when applied: `Home→House`, `Sparkles→Sparkle`, `ClipboardList→ClipboardText`,
  `TrendingUp→TrendUp` (Camera/CreditCard/ShieldCheck keep names); render with
  `weight="fill"` when focused, `"duotone"` otherwise; drop the `strokeWidth` prop
  (Phosphor uses `weight`). Deferred to avoid a rushed icon-type refactor.
- **Camera coin reward** (`(app)/camera.tsx` `CoinBadge`) → `coinBurst` on earn.
