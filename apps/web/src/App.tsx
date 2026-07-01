import { Navigate, Route, Routes } from 'react-router-dom'
import PayApp from './pay/PayApp'
import { ErrorBoundary } from './pay/components/ErrorBoundary'

/**
 * BrainPal — the light "Soft Light Premium" app is the main frame.
 * ───────────────────────────────────────────────────────────────────────────
 * PayApp is fully self-contained: it gates on auth (phone OTP → role → voice
 * onboarding) and then renders the animated Pal switcher with the three real
 * sections — AI (the multi-agent council + live camera), MoneyPal (real family
 * banking), and StudyPal (real learning). It mounts at both `/` and `/pay`.
 *
 * A top-level ErrorBoundary is the app's last line of defence: a runtime throw
 * (or a stale lazy chunk after a deploy) can never leave a blank white screen.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<PayApp />} />
        <Route path="/pay/*" element={<PayApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
