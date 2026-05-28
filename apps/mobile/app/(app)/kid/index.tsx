import { useRouter } from 'expo-router'
import { useEffect, useMemo } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Camera, ClipboardList, Flame, ScanLine, ShoppingBag, Sparkles, Target, TrendingDown, TrendingUp, Wallet, Zap } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { useFamily } from '@/hooks/useFamily'
import { useWallet } from '@/hooks/useWallet'
import { AnimatedNumber } from '@/components'
import { tokens } from '@/theme/tokens'

/**
 * Kid home — real balance, savings goal progress, streak, today's activity.
 */
export default function KidHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const accountId = useAuthStore((s) => s.accountId)
  const signOut = useAuthStore((s) => s.signOut)
  const { data: famData } = useFamily()
  const { data: walletData, isLoading } = useWallet()

  const me = famData?.members.find((m) => m.accountId === accountId)
  const persona = me?.persona ?? {}
  const accent = persona.color ?? tokens.color.purple
  const name = persona.name ?? 'You'
  const avatar = persona.avatar ?? '🧒'
  const streak = (persona as { streak?: number }).streak ?? 0

  const balance = walletData?.balance ?? me?.cachedBalance ?? 0
  const entries = walletData?.entries ?? []

  // Today's events.
  const todayEntries = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return entries.filter((e) => new Date(e.createdAt) >= startOfToday).slice(0, 5)
  }, [entries])

  const onProfilePress = () => {
    Alert.alert(name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/(auth)/welcome')
        },
      },
    ])
  }

  if (isLoading && !walletData) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={accent} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable style={s.streakChip}>
            <Flame size={16} color={tokens.color.orange} strokeWidth={2} />
            <Text style={s.streakText}>{streak}</Text>
          </Pressable>
          <Pressable hitSlop={12} onPress={onProfilePress}>
            <View style={[s.avatarBubble, { backgroundColor: accent + '22' }]}>
              <Text style={s.avatarEmoji}>{avatar}</Text>
            </View>
          </Pressable>
        </View>

        {/* Greeting */}
        <Text style={s.greeting}>Hey {name}</Text>

        {/* Hero balance card */}
        <View style={[s.hero, { backgroundColor: accent + '15', borderColor: accent + '44' }]}>
          <AnimatedNumber value={balance} style={[s.heroBalance, { color: accent }]} />
          <Text style={s.heroLabel}>Brains</Text>
        </View>

        {/* Action row */}
        <View style={s.actionRow}>
          <ActionBtn icon={Camera}        label="Scan"   color={tokens.color.accent} onPress={() => router.push('/(app)/camera')} />
          <ActionBtn icon={Target}        label="Goal"   color={tokens.color.blue}   onPress={() => router.push('/(app)/kid/goals')} />
          <ActionBtn icon={Sparkles}      label="PAL"    color={tokens.color.purple} onPress={() => router.push('/(app)/kid/chat')} />
          <ActionBtn icon={ShoppingBag}   label="Cart"   color={tokens.color.orange} onPress={() => router.push('/(app)/kid/cart')} />
        </View>

        {/* Chores tile */}
        <Pressable
          style={[s.choresTile, { borderColor: tokens.color.surface2 }]}
          onPress={() => router.push('/(app)/kid/chores')}
        >
          <ClipboardList size={tokens.iconSize.lg} color={tokens.color.accent} strokeWidth={1.5} />
          <View style={{ flex: 1 }}>
            <Text style={s.choresTitle}>Chores</Text>
            <Text style={s.choresSub}>Tap to see what's on your list</Text>
          </View>
          <Text style={s.choresArrow}>›</Text>
        </Pressable>

        {/* Streak */}
        {streak > 0 && (
          <View style={s.streakCard}>
            <Flame size={20} color={tokens.color.orange} strokeWidth={2} />
            <Text style={s.streakLabel}>{streak} days clean</Text>
            <Text style={s.streakLine}>Don't blow it on a Mars.</Text>
          </View>
        )}

        {/* Today's activity */}
        <Text style={s.section}>TODAY</Text>
        {todayEntries.length === 0 ? (
          <View style={s.emptyToday}>
            <ScanLine size={tokens.iconSize.lg} color={tokens.color.textMuted} strokeWidth={1.5} />
            <Text style={s.emptyTodayText}>Scan something to start earning</Text>
          </View>
        ) : (
          <View style={s.activityList}>
            {todayEntries.map((e) => (
              <ActivityRow key={e.id} entry={e} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────
type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

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

function ActivityRow({ entry }: { entry: { kind: string; brainsDelta: number; metadata: Record<string, unknown> } }) {
  const meta = entry.metadata as { itemEmoji?: string; itemName?: string; note?: string; choreTitle?: string }
  const isPositive = entry.brainsDelta >= 0
  const sign = isPositive ? '+' : ''
  const color = isPositive ? tokens.color.accent : tokens.color.danger

  let label = ''
  let Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> = Wallet
  let iconColor: string = tokens.color.textMuted

  if (entry.kind === 'topup' || entry.kind === 'topup_stripe') {
    label = meta.note ? `Topup — ${meta.note}` : 'Topup received'
    Icon = TrendingUp
    iconColor = tokens.color.accent as string
  } else if (entry.kind === 'cart_checkout') {
    label = `Bought ${meta.itemName ?? 'item'}`
    Icon = ShoppingBag
    iconColor = tokens.color.orange as string
  } else if (entry.kind === 'scan_skip_reward') {
    label = `Skipped ${meta.itemName ?? 'junk'}`
    Icon = Zap
    iconColor = tokens.color.accent as string
  } else if (entry.kind === 'chore_payout') {
    label = `Chore: ${meta.choreTitle ?? 'done'}`
    Icon = ClipboardList
    iconColor = tokens.color.blue as string
  } else {
    label = entry.kind.replace(/_/g, ' ')
    Icon = isPositive ? TrendingUp : TrendingDown
    iconColor = color as string
  }

  return (
    <View style={s.activityRow}>
      <View style={[s.activityIconWrap, { backgroundColor: iconColor + '18' }]}>
        <Icon size={14} color={iconColor} strokeWidth={2} />
      </View>
      <Text style={s.activityLabel}>{label}</Text>
      <Text style={[s.activityDelta, { color }]}>{sign}{entry.brainsDelta}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing[3],
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
  },
  streakText: { color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm },
  avatarBubble: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },

  greeting: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    marginTop: tokens.spacing[3],
  },

  hero: {
    alignItems: 'center',
    paddingVertical: tokens.spacing[6],
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    marginTop: tokens.spacing[4],
  },
  heroBalance: { fontSize: 72, fontWeight: '900', letterSpacing: -2 },
  heroLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: tokens.spacing[1] },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[5],
  },
  actionBtn: { alignItems: 'center', gap: 6, flex: 1 },
  actionDot: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  actionLabel: { color: tokens.color.text, fontSize: tokens.fontSize.xs, fontWeight: '700' },

  choresTile: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    marginBottom: tokens.spacing[4],
  },
  choresTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choresSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  choresArrow: { color: tokens.color.textMuted, fontSize: 28, fontWeight: '300' },

  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.orange + '15',
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.color.orange + '44',
    marginBottom: tokens.spacing[4],
  },
  streakLabel: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  streakLine: { flex: 1, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontStyle: 'italic', textAlign: 'right' },

  section: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginTop: tokens.spacing[3], marginBottom: tokens.spacing[3],
  },

  emptyToday: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    paddingVertical: tokens.spacing[5],
    justifyContent: 'center',
  },
  emptyTodayText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },

  activityList: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, overflow: 'hidden' },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4],
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  activityIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  activityLabel: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm },
  activityDelta: { fontSize: tokens.fontSize.sm, fontWeight: '800' },
})
