import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './screens/Login'
import { RoleSelect } from './screens/RoleSelect'
import { ParentOnboarding } from './screens/ParentOnboarding'
import { Home } from './screens/Home'

/**
 * Single-camera app: the only camera lives inside the PAL chat (point & ask
 * with health + budget popups). The old kid-section "Live scan" was removed.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/role"
        element={
          <ProtectedRoute>
            <RoleSelect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <ParentOnboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
