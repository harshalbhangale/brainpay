import { useAuthStore } from '@/stores/auth'
import KidHome from '@/screens/KidHome'
import ParentHome from '@/screens/ParentHome'

export default function HomeTab() {
  const accountType = useAuthStore((s) => s.accountType)
  return accountType === 'kid' ? <KidHome /> : <ParentHome />
}
