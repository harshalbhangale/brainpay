import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { AvatarRail } from './AvatarRail'
import { BottomBar } from './BottomBar'
import { OverviewTab } from './OverviewTab'
import { CardTab } from './CardTab'
import { ChoresTab } from './ChoresTab'
import { ActivityTab } from './ActivityTab'
import type { FamilyResponse, FamilyTab, Subject } from './types'

/**
 * The Family experience: avatar rail (You + kids) on top, a bottom tab bar
 * (Overview / Chores / Activity), and a content area scoped to the active
 * subject (the parent overview, or a specific kid).
 */
export function FamilyView() {
  const account = useAuthStore((s) => s.account)
  const meAccountId = account?.id
  const parentName = (account?.persona?.name as string) || 'You'

  const familyQ = useQuery({ queryKey: ['family'], queryFn: () => api<FamilyResponse>('/family') })
  const members = familyQ.data?.members ?? []
  const familyName = familyQ.data?.family?.name ?? undefined

  const [subject, setSubject] = useState<Subject>({ kind: 'family' })
  const [tab, setTab] = useState<FamilyTab>('overview')

  function selectSubject(s: Subject) {
    setSubject(s)
    setTab('overview')
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <AvatarRail
        members={members}
        meAccountId={meAccountId}
        parentName={parentName}
        subject={subject}
        onSelect={selectSubject}
      />

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <OverviewTab
            subject={subject}
            members={members}
            familyName={familyName}
            meAccountId={meAccountId}
            parentName={parentName}
            onSelectSubject={selectSubject}
            onGoTab={setTab}
          />
        )}
        {tab === 'chores' && <ChoresTab subject={subject} members={members} />}
        {tab === 'activity' && <ActivityTab subject={subject} members={members} />}
        {tab === 'card' && (
          <CardTab subject={subject} members={members} meAccountId={meAccountId} parentName={parentName} />
        )}
      </div>

      <BottomBar tab={tab} onTab={setTab} />
    </div>
  )
}
