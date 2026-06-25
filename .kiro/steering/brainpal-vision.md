---
inclusion: always
---

# BrainPal — Company Vision & Product Bible

The single source of truth every agent shares. Keep it in mind for every decision.

## What BrainPal is
BrainPal is an **AI-native bank for families** — one trusted home where parents and
kids grow money, minds, health, and family life together. It delivers a suite of
AI "Pals", each a focused service inside one cohesive product:

- **StudyPal** — learning & tutoring (knowledge, homework, growth).
- **MoneyPal** — family banking & payments (allowance, saving, spending, cards).
- **HealthPal** — health & wellbeing (habits, check-ins, safety).
- **ParentPal** — the parent's command center (oversight, approvals, coordination across all Pals).

Audience is a **duality**: it must feel *safe and delightful for a 9-year-old* AND
*powerful and trustworthy for a parent*. Both truths hold at once, always.

## Product principles (non-negotiable)
1. **No dead-ends.** Every control does something real. No button wired to nothing.
2. **Every state designed.** Empty, loading, error, and success states are first-class, not afterthoughts.
3. **Trust is the product.** Money movement, kid safety, and data deserve confirmations, limits, and clarity.
4. **One system, many Pals.** Consistency via shared tokens + primitives; each Pal has a signature accent, never a different language.
5. **Detail obsession + delight.** Spring motion, tactile press, thoughtful copy, micro-rewards for kids.
6. **Accessibility by default.** Focus-visible rings, ≥44px hit targets, contrast, aria, reduced-motion.

## Design language
- New flagship system = **MoneyPal "Soft Light Premium"** (scoped to `.pv`, tokens in `apps/web/src/pay/theme.css`): calm light canvas, pure-white surfaces, oversized tight-tracked display type, soft pastel tiles, ink-black primary controls, feather-soft shadows, spring motion. This is the direction the whole product trends toward.
- A legacy dark CRED-inspired theme still powers the older BrainPal screens (`apps/web/src/index.css`). Do not break it; migrate intentionally, never accidentally.
- Pal accents (within one system): StudyPal=lilac, MoneyPal=indigo/ink, HealthPal=mint, ParentPal=sky.

## Engineering facts
- **Web only for now** (see `web-only` rule). Never touch `apps/mobile`.
- Stack: React 19 + Vite 7 + Tailwind v4 + react-router-dom v7, lucide-react, zustand, @tanstack/react-query.
- MoneyPal lives at `apps/web/src/pay/` and mounts at `/pay`. Build from its primitives/tokens.
- Verify every change: `pnpm --filter @brainpal/web typecheck` and `build` must pass before declaring done.

## Agent org
- **brainpal-ceo** — vision keeper & decision-maker; orchestrates auditor + builder; acts autonomously, escalates only high-impact/irreversible calls to the human CEO.
- **design-auditor** — the single, universal design + product auditor for any Pal / screen / design system (diagnose only, no implementation).
- **brainpal-builder** — implements approved work in `apps/web`, tests, hands off for manual testing.
