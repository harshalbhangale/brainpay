/**
 * PalShell — the authenticated app shell. Full-size + responsive.
 * ───────────────────────────────────────────────────────────────────────────
 * Desktop (lg+): a persistent left sidebar (brand · primary nav · context card ·
 * history) beside a full-width main pane. Mobile: a slim top bar, the main pane,
 * and a bottom nav; the sidebar lives in the swipe drawer. One `useNav` section
 * drives everything, so switching between the AI **chat** and the structured
 * **UI** (Money / Study / Family / Map …) is a single tap.
 */
import { useCallback, useEffect, useState } from 'react'
import { Menu, User, MessageSquareText, Wallet, GraduationCap, Users, MapPin, ListChecks } from 'lucide-react'
import { useLocationReporter } from '../../lib/useLocationReporter'
import { useAuthStore } from '../../stores/auth'
import { Avatar } from '../components/primitives'
import { SwipeDrawer } from '../components/SwipeDrawer'
import { SidebarBody, type NavItem } from '../components/AppShell'
import { SheetHost } from '../components/Canvas'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Profile } from '../screens/Profile'
import { SessionHistory } from '../screens/SessionHistory'
import { sendAiCommand } from './aiBus'
import { useNav, type Section } from '../lib/useNav'
import { useHistoryView } from '../lib/historyStore'
import { useSessionStore, type ChatSession } from '../lib/sessions'
import { usePalSelection } from './usePalSelection'
import { AIPal } from './AIPal'
import { StudyPal } from './StudyPal'
import { MoneyHome } from '../screens/MoneyHome'
import { Family } from '../screens/Family'
import { Activity } from '../screens/Activity'
import { FamilyMap } from '../screens/FamilyMap'
import { KidChores } from '../screens/KidChores'

const PARENT_NAV: NavItem[] = [
  { key: 'chat', label: 'Chat', Icon: MessageSquareText },
  { key: 'family', label: 'Family', Icon: Users },
  { key: 'study', label: 'Study', Icon: GraduationCap },
  { key: 'map', label: 'Map', Icon: MapPin },
]
const KID_NAV: NavItem[] = [
  { key: 'chat', label: 'Chat', Icon: MessageSquareText },
  { key: 'money', label: 'Money', Icon: Wallet },
  { key: 'study', label: 'Study', Icon: GraduationCap },
  { key: 'chores', label: 'Chores', Icon: ListChecks },
  { key: 'map', label: 'Map', Icon: MapPin },
]

export function PalShell() {
  const section = useNav((s) => s.section)
  const setSection = useNav((s) => s.setSection)
  const account = useAuthStore((s) => s.account)
  const isKid = account?.accountType === 'kid'
  const [profileOpen, setProfileOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const historyOpen = useHistoryView((s) => s.open)
  const openHistory = useHistoryView((s) => s.openHistory)

  useEffect(() => { useSessionStore.getState().migrateLegacy() }, [])
  useLocationReporter(!!account)

  const name = (account?.persona?.name as string) || 'You'
  const photo = typeof account?.persona?.avatar === 'string' ? (account.persona.avatar as string) : undefined
  const role = isKid ? 'Kid' : 'Parent'
  const items = isKid ? KID_NAV : PARENT_NAV

  const select = useCallback((s: Section) => { setSection(s); setDrawerOpen(false) }, [setSection])
  const onNewChat = useCallback(() => {
    // "New chat" is an AI conversation. The chat section renders the pal-driven
    // PalSurface, which shows StudyPal (not a chat) when that Pal is selected —
    // so flip to the conversational AI Pal first, else new-chat has nothing to
    // mount onto and the user just sees StudyPal.
    if (usePalSelection.getState().pal === 'studypal') usePalSelection.getState().setPal('ai')
    setSection('chat'); setDrawerOpen(false); sendAiCommand({ type: 'new-chat' })
  }, [setSection])
  const onOpenHistory = useCallback((sessionId?: string) => { setDrawerOpen(false); openHistory(sessionId) }, [openHistory])
  const onProfile = useCallback(() => { setDrawerOpen(false); setProfileOpen(true) }, [])

  // Resume a recorded session into the right surface.
  const continueSession = useCallback((s: ChatSession) => {
    useHistoryView.getState().close()
    if (s.kind === 'avatar') { setSection('study'); return }
    // text/voice/camera sessions live in the AI chat — make sure a chat Pal is
    // active so the surface mounts <Chat> rather than StudyPal.
    if (usePalSelection.getState().pal === 'studypal') usePalSelection.getState().setPal('ai')
    setSection('chat')
    if (s.kind === 'text') sendAiCommand({ type: 'resume', sessionId: s.id })
    else if (s.kind === 'voice') sendAiCommand({ type: 'live', camera: false })
    else if (s.kind === 'camera') sendAiCommand({ type: 'live', camera: true })
  }, [setSection])

  const dataPal = section === 'study' ? 'studypal' : section === 'chat' ? 'ai' : 'moneypal'

  return (
    <div
      data-pal={dataPal}
      className="pv pv-aurora relative flex h-full w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(900px 520px at 12% -8%, var(--pv-accent-soft), transparent 60%),' +
          'linear-gradient(180deg, var(--pv-bg) 0%, var(--pv-bg-2) 100%)',
      }}
    >
      <div className="pv-mesh" aria-hidden />

      {/* Desktop sidebar */}
      <aside
        className="relative z-10 hidden h-full w-[300px] shrink-0 lg:flex lg:flex-col"
        style={{ borderRight: '1px solid var(--pv-line)', background: 'color-mix(in srgb, var(--pv-surface) 55%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        <SidebarBody items={items} active={section} onSelect={select} role={role} onNewChat={onNewChat} onOpenHistory={onOpenHistory} onProfile={onProfile} />
      </aside>

      {/* Main column */}
      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex flex-none items-center justify-between px-4 pb-1 pt-3 lg:hidden" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="pv-press flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-sm)', border: '1px solid rgba(255,255,255,0.6)' }}>
            <Menu size={19} strokeWidth={2.4} />
          </button>
          <span className="pv-title pv-tight">BrainPal</span>
          <button onClick={() => setProfileOpen(true)} aria-label="Profile and settings" className="pv-press rounded-full" style={{ boxShadow: 'var(--pv-shadow-sm)', border: '2px solid rgba(255,255,255,0.7)' }}>
            {photo ? <Avatar name={name} src={photo} size={38} /> : (
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--pv-ink-2)' }}><User size={18} strokeWidth={2.4} /></span>
            )}
          </button>
        </div>

        {/* Section content */}
        <main key={section} className="pv-pal-enter flex min-h-0 flex-1 flex-col">
          <ErrorBoundary resetKey={section}>
            <SectionView section={section} />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile drawer — full nav (2-up tiles) + account + history */}
      <div className="lg:hidden">
        <SwipeDrawer open={drawerOpen} onOpenChange={setDrawerOpen} ariaLabel="BrainPal menu" width={460}>
          <SidebarBody items={items} active={section} onSelect={select} role={role} onNewChat={onNewChat} onOpenHistory={onOpenHistory} onProfile={onProfile} onClose={() => setDrawerOpen(false)} />
        </SwipeDrawer>
      </div>

      <ErrorBoundary resetKey={`sheet-${section}`}><SheetHost /></ErrorBoundary>
      {historyOpen && <SessionHistory onContinue={continueSession} />}
      {profileOpen && <Profile onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

function SectionView({ section }: { section: Section }) {
  // Chat and the full-bleed map own their own width; everything else reads as a
  // centered column so the wide desktop pane never stretches content edge-to-edge.
  if (section === 'chat') return <AIPal />
  if (section === 'map') return <FamilyMap />

  const inner =
    section === 'money' ? <MoneyHome />
      : section === 'study' ? <StudyPal />
        : section === 'family' ? <Family />
          : section === 'activity' ? <Activity />
            : section === 'chores' ? <KidChores />
              : <AIPal />

  return <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">{inner}</div>
}
