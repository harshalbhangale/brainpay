/**
 * MoneyPal — the family-bank Pal (tabs + screens + its own bottom nav).
 * Rendered inside the shared PhoneCanvas by the Pal switcher (PalShell).
 *
 * Parent tabs: Home · Family (kids, allowance, chores, card & location)
 *               · Activity · Card. Center action funds a child (TopUpSheet).
 * Kid tabs:    Home · Chores (verify with camera) · Activity · Card.
 *               Center action opens the camera to verify a chore.
 */
import { useState } from 'react'
import { Home as HomeIcon, Receipt, MapPin, Plus, Users, ListChecks, Camera } from 'lucide-react'
import { BottomNav, type TabKey } from '../components/shell'
import { useAuthStore } from '../../stores/auth'
import { Dashboard } from '../screens/Dashboard'
import { Activity } from '../screens/Activity'
import { CardSheet } from '../screens/Card'
import { Family } from '../screens/Family'
import { FamilyMap } from '../screens/FamilyMap'
import { KidChores } from '../screens/KidChores'
import { TopUpSheet } from '../screens/TopUpSheet'
import { ChorePickerSheet } from '../chores/verify'
import type { PalKey } from './config'

const PARENT_TABS: { key: TabKey; label: string; Icon: typeof HomeIcon }[] = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'family', label: 'Family', Icon: Users },
  { key: 'activity', label: 'Activity', Icon: Receipt },
  { key: 'map', label: 'Map', Icon: MapPin },
]

const KID_TABS: { key: TabKey; label: string; Icon: typeof HomeIcon }[] = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'chores', label: 'Chores', Icon: ListChecks },
  { key: 'activity', label: 'Activity', Icon: Receipt },
  { key: 'map', label: 'Map', Icon: MapPin },
]

export function MoneyPal({ goPal }: { goPal?: (k: PalKey) => void }) {
  const isKid = useAuthStore((s) => s.account?.accountType === 'kid')
  const [tab, setTab] = useState<TabKey>('home')
  const [topUp, setTopUp] = useState(false)
  const [verify, setVerify] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [activityFilter, setActivityFilter] = useState<'all' | 'in' | 'out' | 'pending'>('all')

  const viewRewards = () => { setActivityFilter('in'); setTab('activity') }
  const goTab = (t: TabKey) => { if (t === 'activity') setActivityFilter('all'); setTab(t) }

  return (
    <>
      <div key={tab} className="pv-pal-enter flex min-h-0 flex-1 flex-col">
        {tab === 'home' && <Dashboard go={goTab} goPal={goPal} onTopUp={() => setTopUp(true)} onRewards={viewRewards} onCard={() => setCardOpen(true)} />}
        {tab === 'family' && !isKid && <Family />}
        {tab === 'chores' && isKid && <KidChores />}
        {tab === 'activity' && <Activity initialFilter={activityFilter} />}
        {tab === 'map' && <FamilyMap />}
      </div>

      {isKid ? (
        <BottomNav active={tab} onChange={goTab} onCenter={() => setVerify(true)} centerIcon={Camera} tabs={KID_TABS} />
      ) : (
        <BottomNav active={tab} onChange={goTab} onCenter={() => setTopUp(true)} centerIcon={Plus} tabs={PARENT_TABS} />
      )}

      {topUp && !isKid && <TopUpSheet onClose={() => setTopUp(false)} />}
      {verify && isKid && <ChorePickerSheet onClose={() => setVerify(false)} />}
      {cardOpen && <CardSheet onClose={() => setCardOpen(false)} />}
    </>
  )
}
