import { Navigate, Route, Routes } from 'react-router-dom'
import PayApp from './pay/PayApp'

/**
 * BrainPal — the light "Soft Light Premium" app is the main frame.
 * ───────────────────────────────────────────────────────────────────────────
 * PayApp is fully self-contained: it gates on auth (phone OTP → role → voice
 * onboarding) and then renders the animated Pal switcher with the three real
 * sections — AI (the multi-agent council + live camera), MoneyPal (real family
 * banking), and StudyPal (real learning). It mounts at both `/` and `/pay`.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PayApp />} />
      <Route path="/pay/*" element={<PayApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
