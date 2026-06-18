import { initial, isKid, kidName, type Member, type Subject } from './types'

/** Top rail: "You" (family overview) + each kid. Selecting changes the subject. */
export function AvatarRail({
  members,
  meAccountId,
  parentName,
  subject,
  onSelect,
}: {
  members: Member[]
  meAccountId?: string
  parentName: string
  subject: Subject
  onSelect: (s: Subject) => void
}) {
  const kids = members.filter(isKid).filter((m) => m.accountId !== meAccountId)
  const familyActive = subject.kind === 'family'

  return (
    <div className="flex items-center gap-4 overflow-x-auto px-5 py-3">
      <RailItem
        label="You"
        active={familyActive}
        onClick={() => onSelect({ kind: 'family' })}
        content={<span className="text-lg font-extrabold text-black">{initial(parentName)}</span>}
        bg="#FCE17B"
      />
      {kids.map((k) => {
        const active = subject.kind === 'kid' && subject.accountId === k.accountId
        return (
          <RailItem
            key={k.accountId}
            label={kidName(k)}
            active={active}
            onClick={() => onSelect({ kind: 'kid', accountId: k.accountId })}
            content={<span className="text-lg font-extrabold text-ink">{initial(kidName(k))}</span>}
            bg="#20202a"
          />
        )
      })}
    </div>
  )
}

function RailItem({
  label,
  active,
  onClick,
  content,
  bg,
}: {
  label: string
  active: boolean
  onClick: () => void
  content: React.ReactNode
  bg: string
}) {
  return (
    <button onClick={onClick} className="flex shrink-0 flex-col items-center gap-1">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full transition"
        style={{
          backgroundColor: bg,
          boxShadow: active ? '0 0 0 2.5px #3ddc84, 0 0 0 5px rgba(61,220,132,0.25)' : 'none',
        }}
      >
        {content}
      </span>
      <span className={`max-w-[56px] truncate text-xs ${active ? 'font-bold text-ink' : 'text-muted'}`}>
        {label}
      </span>
    </button>
  )
}
