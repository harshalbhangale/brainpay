---
inclusion: always
---

# HARD RULE: Web application only

For now, **all work happens in the web application** at `apps/web`.

- Always implement features, fixes, styling, and design-system changes in `apps/web`.
- **Do NOT touch the mobile application** (`apps/mobile`) — skip it entirely until this rule is explicitly lifted.
- If a request seems aimed at mobile, implement the web equivalent in `apps/web` instead, and note that mobile was intentionally skipped.
- Shared/server code in `apps/api` and `packages/*` may be edited only when required to support the web app.

## Web app facts (so you don't re-discover them every time)

- Stack: **React 19 + Vite 7 + Tailwind CSS v4 + react-router-dom v7**, `lucide-react` icons, `zustand`, `@tanstack/react-query`.
- Entry: `apps/web/src/main.tsx` → `App.tsx` (routes). Global styles: `apps/web/src/index.css`.
- Dev: `pnpm --filter @brainpal/web dev`. Typecheck: `pnpm --filter @brainpal/web typecheck`. Build: `pnpm --filter @brainpal/web build`.

## Payments design system ("MoneyPal")

A self-contained, light, premium payments UI lives under `apps/web/src/pay/` and is
viewable at the `/pay` route. Its design system is scoped to a `.pv` root class
(tokens in `apps/web/src/pay/theme.css`) so it never collides with the existing
dark BrainPal theme in `index.css`. Build new payments UI from the primitives in
`apps/web/src/pay/components/` and keep everything inside the `.pv` scope.
