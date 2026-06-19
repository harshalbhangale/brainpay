import { useAuthStore } from '@/stores/auth'
import KidHome from '@/screens/KidHome'
import ParentHome from '@/screens/ParentHome'

/**
 * Full dashboard — the relocated Greenlight-style home (card switcher, stats,
 * activity). No longer the landing surface; reached from the chat home's Money
 * panel ("View full dashboard") and the Surfaces drawer.
 */
export default function DashboardScreen() {
  const accountType = useAuthStore((s) => s.accountType)
  return accountType === 'kid' ? <KidHome /> : <ParentHome />
}
