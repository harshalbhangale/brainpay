import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ClipboardList, CircleArrowUp, Flame, Target, TrendingUp } from 'lucide-react-native'
import { api } from '@/lib/api'
import { useFamily } from '@/hooks/useFamily'
import { AnimatedNumber } from '@/components'
import type { LedgerEntry } from '@/hooks/useWallet'
import type { Chore } from '@/hooks/useChores'
import { tokens } from '@/theme/tokens'

/**
 * Per-kid detail screen — full view of one kid:
 * balance, recent activity, chores, savings goal, week summary.
 */
export default function KidDetail() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id: kidId } = useLocalSearchParams<{ id?: string }>()
  const { data: famData } = useFamily()

  const kid = famData?.members.find((m) => m.accountId === kidId)
  const accent = kid?.persona?.color ?? tokens.color.purple
  const name = kid?.persona?.name ?? 'Kid'
  const avatar = kid?.persona?.avatar ?? '🧒'
  const age = kid?.persona?.age
  const balance = kid?.cachedBalance ?? 0

  // Load this kid's ledger via family/feed endpoint with kidId filter.
  const { data: feed } = useQuery({
    queryKey: ['family-feed', kidId],
    queryFn: () => api<{ entries: LedgerEntry[] }>(`/family/feed?kidId=${kidId}&limit=20`),
    enabled: !!kidId,
    staleTime: 10_000,
  })

  // Chores for this kid (filter from /chores).
  const { data: choresData } = useQuery({
    queryKey: ['chores'],
    queryFn: () => api<{ chores: Chore[] }>('/chores'),
    staleTime: 10_000,
  })

  const kidChores = choresData?.chores.filter((c) => c.assignedTo === kidId) ?? []
  const pendingChores = kidChores.filter((c) =>
    ['pending', 'submitted', 'ai_approved', 'ai_uncertain'].includes(c.status),
  )

  const entries = feed?.entries ?? []

  // This week summary.
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 7)
  const weekEntries = entries.filter((e) => new Date(e.createdAt) >= weekStart)
  const earned = weekEntries.filter((e) => e.brainsDelta > 0).reduce((s, e) => s + e.brainsDelta, 0)
  const spent = Math.abs(weekEntries.filter((e) => e.brainsDelta < 0).reduce((s, e) => s + e.brainsDelta, 0))

  if (!kid) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.avatarLarge, { backgroundColor: accent + '22' }]}>
            <Text style={s.avatarEmoji}>{avatar}</Text>
          </View>
          <Text style={s.heroName}>{name}</Text>
          {age ? <Text style={s.heroAge}>{age}yo</Text> : null}
          <AnimatedNumber value={balance} style={[s.heroBalance, { color: accent }]} />
          <Text style={s.heroBalanceLabel}>Brains</Text>
        </View>

        {/* Action row */}
        <View style={s.actionRow}>
          <ActionBtn
            icon={CircleArrowUp}
            label="Top Up"
            color={tokens.color.purple}
            onPress={() => router.push({ pathname: '/(app)/parent/topup', params: { kidId } })}
          />
          <ActionBtn
            icon={ClipboardList}
            label="Add Chore"
            color={tokens.color.accent}
            onPress={() => router.push({ pathname: '/(app)/parent/chores', params: { kidId } })}
          />
          <ActionBtn
            icon={Target}
            label="Goal"
            color={tokens.color.blue}
            onPress={() => {/* P2 */}}
          />
        </View>

        {/* This week */}
        <Text style={s.section}>THIS WEEK</Text>
        <View style={s.weekStats}>
          <View style={s.weekStat}>
            <TrendingUp size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
            <Text style={[s.weekStatNum, { color: tokens.color.accent }]}>+{earned}</Text>
            <Text style={s.weekStatLabel}>earned</Text>
          </View>
          <View style={s.weekStat}>
            <TrendingUp size={tokens.iconSize.md} color={tokens.color.danger} strokeWidth={1.5} style={{ transform: [{ rotate: '180deg' }] }} />
            <Text style={[s.weekStatNum, { color: tokens.color.danger }]}>-{spent}</Text>
            <Text style={s.weekStatLabel}>spent</Text>
          </View>
          <View style={s.weekStat}>
            <Flame size={tokens.iconSize.md} color={tokens.color.orange} strokeWidth={1.5} />
            <Text style={[s.weekStatNum, { color: tokens.color.orange }]}>0</Text>
            <Text style={s.weekStatLabel}>day streak</Text>
          </View>
        </View>

        {/* Chores */}
        {kidChores.length > 0 && (
          <>
            <Text style={s.section}>CHORES</Text>
            <View style={s.choreList}>
              {kidChores.slice(0, 5).map((c) => (
                <View key={c.id} style={s.choreRow}>
                  <Text style={s.choreTitle}>{c.title}</Text>
                  <Text style={s.choreReward}>+{c.rewardBrains} 🧠</Text>
                  <Text style={[s.choreStatus, statusStyle(c.status)]}>{statusLabel(c.status)}</Text>
                </View>
              ))}
            </View>
            {pendingChores.length > 0 && (
              <Pressable
                style={s.choreCta}
                onPress={() => router.push({ pathname: '/(app)/parent/chores', params: { kidId } })}
              >
                <Text style={[s.choreCtaText, { color: tokens.color.accent }]}>
                  Review {pendingChores.length} pending →
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* PAL Feed */}
        <Text style={s.section}>PAL'S FEED</Text>
        {entries.length === 0 ? (
          <View style={s.emptyFeed}>
            <Text style={s.emptyFeedText}>No activity yet.</Text>
          </View>
        ) : (
          <View style={s.feedList}>
            {entries.slice(0, 10).map((e) => (
              <FeedRow key={e.id} entry={e} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────
type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; style?: object }>

function ActionBtn({ icon: Icon, label, color, onPress }: { icon: LucideIcon; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={s.actionBtn} onPress={onPress}>
      <View style={[s.actionDot, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Icon size={tokens.iconSize.lg} color={color} strokeWidth={1.5} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  )
}

function FeedRow({ entry }: { entry: LedgerEntry }) {
  const meta = entry.metadata as { itemEmoji?: string; itemName?: string; note?: string; choreTitle?: string; palQuote?: string }
  const isPositive = entry.brainsDelta >= 0
  const sign = isPositive ? '+' : ''
  const color = isPositive ? tokens.color.accent : tokens.color.danger
  const date = new Date(entry.createdAt)
  const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`

  let title = ''
  let emoji = '🪙'
  if (entry.kind === 'topup' || entry.kind === 'topup_stripe') {
    title = meta.note ? `Topup — ${meta.note}` : 'Topup received'
    emoji = '💸'
  } else if (entry.kind === 'cart_checkout') {
    title = `Bought ${meta.itemName ?? 'item'}`
    emoji = meta.itemEmoji ?? '🛒'
  } else if (entry.kind === 'scan_skip_reward') {
    title = `Skipped ${meta.itemName ?? 'junk'}`
    emoji = '✋'
  } else if (entry.kind === 'chore_payout') {
    title = `Chore: ${meta.choreTitle ?? 'done'}`
    emoji = '🧹'
  } else {
    title = entry.kind.replace(/_/g, ' ')
  }

  return (
    <View style={s.feedRow}>
      <Text style={s.feedEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.feedTitle}>{title}</Text>
        {meta.palQuote ? <Text style={s.feedQuote}>"{meta.palQuote}"</Text> : null}
        <Text style={s.feedTime}>{time}</Text>
      </View>
      <Text style={[s.feedDelta, { color }]}>{sign}{entry.brainsDelta} 🧠</Text>
    </View>
  )
}

function statusLabel(status: Chore['status']) {
  switch (status) {
    case 'pending':         return 'Pending'
    case 'submitted':       return 'Awaiting AI'
    case 'ai_approved':     return 'AI ✓ — approve?'
    case 'ai_rejected':     return 'AI ✗'
    case 'ai_uncertain':    return 'Needs review'
    case 'parent_approved': return 'Approved'
    case 'parent_rejected': return 'Rejected'
    case 'paid':            return 'Paid'
    default:                return status
  }
}
function statusStyle(status: Chore['status']) {
  if (status === 'paid' || status === 'parent_approved') return { color: tokens.color.accent }
  if (status === 'parent_rejected' || status === 'ai_rejected') return { color: tokens.color.danger }
  if (status === 'ai_approved' || status === 'submitted' || status === 'ai_uncertain') return { color: tokens.color.orange }
  return { color: tokens.color.textMuted }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  topBar: { paddingVertical: tokens.spacing[3] },

  hero: { alignItems: 'center', paddingVertical: tokens.spacing[5] },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[3],
  },
  avatarEmoji: { fontSize: 40 },
  heroName: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  heroAge: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: 2 },
  heroBalance: { fontSize: 56, fontWeight: '900', letterSpacing: -2, marginTop: tokens.spacing[3] },
  heroBalanceLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: 2 },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: tokens.spacing[4],
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionDot: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  actionLabel: { color: tokens.color.text, fontSize: tokens.fontSize.xs, fontWeight: '700' },

  section: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
  },

  weekStats: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    justifyContent: 'space-around',
  },
  weekStat: { alignItems: 'center', gap: 4 },
  weekStatNum: { fontSize: tokens.fontSize.lg, fontWeight: '900' },
  weekStatLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs },

  choreList: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  choreRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  choreTitle: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm },
  choreReward: { color: tokens.color.accent, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  choreStatus: { fontSize: tokens.fontSize.xs, fontWeight: '700' },
  choreCta: { paddingVertical: tokens.spacing[3], alignItems: 'center' },
  choreCtaText: { fontSize: tokens.fontSize.sm, fontWeight: '700' },

  emptyFeed: { paddingVertical: tokens.spacing[5], alignItems: 'center' },
  emptyFeedText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },

  feedList: { gap: 1, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, overflow: 'hidden' },
  feedRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
  },
  feedEmoji: { fontSize: 22 },
  feedTitle: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  feedQuote: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontStyle: 'italic', marginTop: 2 },
  feedTime: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  feedDelta: { fontSize: tokens.fontSize.sm, fontWeight: '800' },
})
