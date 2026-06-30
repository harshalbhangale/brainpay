import { avatarDef, type AvatarId } from '../lib/avatar'
import { VrmCompanion, type CompanionMood } from './VrmCompanion'
import { GlbCompanion } from './GlbCompanion'

export type { CompanionMood }

/**
 * Companion — the one component every screen uses to render the active
 * companion. It looks up the avatar definition and delegates to the right
 * renderer (VRM via three-vrm, or VRoid GLB via plain three.js), so call sites
 * never need to know which kind a character is.
 */
export function Companion({
  avatar,
  getLevel,
  mood = 'neutral',
  className,
}: {
  avatar: AvatarId
  getLevel?: () => number
  mood?: CompanionMood
  className?: string
}) {
  const def = avatarDef(avatar)
  return def.kind === 'vrm' ? (
    <VrmCompanion src={def.src} getLevel={getLevel} mood={mood} className={className} />
  ) : (
    <GlbCompanion src={def.src} getLevel={getLevel} mood={mood} className={className} />
  )
}
