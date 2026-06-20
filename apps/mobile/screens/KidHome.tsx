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
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Camera,
  CaretRight,
  ClipboardText,
  Flame,
  MapPin,
  Scan,
  ShoppingBag,
  ShoppingCart,
  Sparkle,
  Star,
  Target,
  TrendDown,
  TrendUp,
  Users,
  Wallet,
  Lightning,
} from 'phosphor-react-native'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useFamily } from '@/hooks/useFamily'
import { useChores } from '@/hooks/useChores'
import { api } from '@/lib/api'
import { useWallet } from '@/hooks/useWallet'
import { ActionButton } from '@/components/ActionButton'
import { BrainHealth } from '@/components/BrainHealth'
import { PayCard, heroColors } from '@/components/dashboard'
import { FadeIn } from '@/components/ui'
import { TAB_BAR_TOTAL_HEIGHT } from '@/components/TabBar'
import { kidTheme as tokens } from '@/theme/tokens'

type Goal = { id: string; targetBrains: number; currentBrains: number; status: string }

export default function KidHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const accountId = useAuthStore((s) => s.accountId)
  const signOut = useAuthStore((s) => s.signOut)
  const { data: famData } = useFamily()
  const { data: walletData, isLoading } = useWallet()
  const { data: choresData } = useChores()
  const { data: goalsData } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api<{ goals: Goal[] }>('/goals'),
    staleTime: 10_000,
  })
  const { data: studyStats } = useQuery({
    queryKey: ['study-stats'],
    queryFn: () => api<{ topicsActive: number }>('/study/stats'),
    staleTime: 30_000,
  })

  const me = famData?.members.find((m) => m.accountId === accountId)
  const persona = me?.persona ?? {}
  const name = persona.name ?? 'You'
  const avatar = persona.avatar ?? '🧒'
  const streak = (persona as { streak?: number }).streak ?? 0

  const balance = walletData?.balance ?? me?.cachedBalance ?? 0
  const entries = walletData?.entries ?? []
  const audBalance = balance / 100
  const brainPoints = balance

  const missionsInProgress = (choresData?.chores ?? []).filter((c) =>
    ['pending', 'submitted', 'ai_approved', 'ai_uncertain'].includes(c.status),
  ).length

  const activeGoal = (goalsData?.goals ?? []).find((g) => g.status === 'active')
  const awayFromGoal = activeGoal
    ? Math.max(0, activeGoal.targetBrains - activeGoal.currentBrains)
    : null

  const setCartCount = useCartStore((s) => s.setItemCount)
  const cartCount = useCartStore((s) => s.itemCount)
  const { data: cartData } = useQuery({
    queryKey: ['cart'],
    queryFn: () => api<{ items: { id: string }[] }>('/cart'),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
  useEffect(() => {
    if (cartData?.items) setCartCount(cartData.items.length)
  }, [cartData])

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
        <ActivityIndicator color={tokens.color.purple} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_TOTAL_HEIGHT + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable style={s.streakChip}>
            <Flame size={15} color={tokens.color.orange} weight="fill" />
            <Text style={s.streakText}>{streak} day streak</Text>
          </Pressable>
          <View style={s.topBarRight}>
            <Pressable style={s.iconBtn} onPress={() => router.push('/(app)/cart')}>
              <ShoppingCart size={19} color={tokens.color.text} weight="duotone" />
              {cartCount > 0 && (
                <View style={s.cartBadge}>
                  <Text style={s.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable hitSlop={12} onPress={onProfilePress}>
              <View style={s.avatarBubble}>
                <Text style={s.avatarEmoji}>{avatar}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Greeting */}
        <Text style={s.greeting}>Hey, {name} 👋</Text>
        <Text style={s.greetingSub}>I'm here to help you make smart choices today.</Text>

        {/* Balance card */}
        <FadeIn>
          <PayCard
            name={name}
            last4={(accountId ?? '').replace(/\D/g, '').slice(-4) || '2734'}
            balance={audBalance}
            colors={heroColors((persona as { color?: string }).color)}
            tier="Hero"
            onPress={() => router.push('/(app)/transactions')}
          />
        </FadeIn>

        {/* Brain Health widget */}
        {(studyStats?.topicsActive ?? 0) > 0 && <BrainHealth />}

        {/* Today's progress */}
        <Text style={s.section}>TODAY'S PROGRESS</Text>
        <View style={s.statRow}>
          <StatCard
            icon={Target}
            color={tokens.color.purple}
            value={`${missionsInProgress}`}
            label="Missions"
          />
          <StatCard
            icon={Sparkle}
            color={tokens.color.accent}
            value={brainPoints.toLocaleString()}
            label="Brain Score"
          />
          <StatCard
            icon={TrendUp}
            color={tokens.color.blue}
            value={awayFromGoal !== null ? `$${(awayFromGoal / 100).toFixed(0)}` : '—'}
            label="To goal"
          />
        </View>

        {/* Quick actions */}
        <FadeIn delay={120}>
        <Text style={s.section}>QUICK ACTIONS</Text>
        <View style={s.actionRow}>
          <ActionButton
            icon={Camera}
            label="Scan"
            variant="tile"
            gradient={[tokens.color.blue, tokens.color.blue + 'AA']}
            labelColor={tokens.color.text}
            onPress={() => router.push('/(app)/camera')}
          />
          <ActionButton
            icon={Target}
            label="Goals"
            variant="tile"
            gradient={[tokens.color.purple, tokens.color.purple + 'AA']}
            labelColor={tokens.color.text}
            onPress={() => router.push('/(app)/goals')}
          />
          <ActionButton
            icon={Sparkle}
            label="Ask PAL"
            variant="tile"
            gradient={[tokens.color.pink, tokens.color.pink + 'AA']}
            labelColor={tokens.color.text}
            onPress={() => router.push('/(app)/(tabs)')}
          />
          <ActionButton
            icon={Users}
            label="Family"
            variant="tile"
            gradient={[tokens.color.orange, tokens.color.orange + 'AA']}
            labelColor={tokens.color.text}
            onPress={() => router.push('/(app)/family-safety')}
          />
        </View>
        </FadeIn>

        {/* Missions tile */}
        <Pressable
          style={({ pressed }) => [s.missionTile, pressed && { opacity: 0.9 }]}
          onPress={() => router.push('/(app)/chores')}
        >
          <View style={s.missionIconWrap}>
            <ClipboardText size={20} color={tokens.color.purple} weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.missionTitle}>My Missions</Text>
            <Text style={s.missionSub}>Complete missions to earn Brain Points</Text>
          </View>
          <CaretRight size={18} color={tokens.color.textMuted} weight="bold" />
        </Pressable>

        {/* Find Family tile */}
        <Pressable
          style={({ pressed }) => [s.missionTile, pressed && { opacity: 0.9 }]}
          onPress={() => router.push('/(app)/family-safety')}
        >
          <View style={[s.missionIconWrap, { backgroundColor: tokens.color.blue + '1A' }]}>
            <MapPin size={20} color={tokens.color.blue} weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.missionTitle}>Find Family</Text>
            <Text style={s.missionSub}>See where everyone is on the map</Text>
          </View>
          <CaretRight size={18} color={tokens.color.textMuted} weight="bold" />
        </Pressable>

        {/* Today's activity */}
        <View style={s.sectionHeader}>
          <Text style={s.section}>TODAY'S ACTIVITY</Text>
          {todayEntries.length > 0 && <Text style={s.sectionCount}>{todayEntries.length} events</Text>}
        </View>

        {todayEntries.length === 0 ? (
          <View style={s.emptyToday}>
            <Scan size={28} color={tokens.color.textMuted} weight="duotone" />
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

type IconType = React.ComponentType<{
  size?: number
  color?: string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}>

function StatCard({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: IconType
  color: string
  value: string
  label: string
}) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIconWrap, { backgroundColor: color + '1A' }]}>
        <Icon size={16} color={color} weight="duotone" />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function ActivityRow({
  entry,
}: {
  entry: { id?: string; kind: string; brainsDelta: number; metadata: Record<string, unknown> }
}) {
  const meta = entry.metadata as { itemName?: string; note?: string; choreTitle?: string }
  const isPositive = entry.brainsDelta >= 0
  const sign = isPositive ? '+' : ''
  const color = isPositive ? tokens.color.trafficGreen : tokens.color.danger

  let label = ''
  let Icon: IconType = Wallet
  let iconColor: string = tokens.color.textMuted

  if (entry.kind === 'topup' || entry.kind === 'topup_stripe') {
    label = meta.note ? `Top up — ${meta.note}` : 'Top up received'
    Icon = TrendUp
    iconColor = tokens.color.trafficGreen
  } else if (entry.kind === 'cart_checkout') {
    label = `Bought ${meta.itemName ?? 'item'}`
    Icon = ShoppingBag
    iconColor = tokens.color.orange
  } else if (entry.kind === 'scan_skip_reward') {
    label = `Skipped ${meta.itemName ?? 'junk'}`
    Icon = Lightning
    iconColor = tokens.color.purple
  } else if (entry.kind === 'chore_payout') {
    label = `Mission: ${meta.choreTitle ?? 'done'}`
    Icon = ClipboardText
    iconColor = tokens.color.blue
  } else {
    label = entry.kind.replace(/_/g, ' ')
    Icon = isPositive ? TrendUp : TrendDown
    iconColor = color
  }

  return (
    <View style={s.activityRow}>
      <View style={[s.activityIconWrap, { backgroundColor: iconColor + '1A' }]}>
        <Icon size={14} color={iconColor} weight="duotone" />
      </View>
      <Text style={s.activityLabel}>{label}</Text>
      <View style={[s.activityDeltaWrap, { backgroundColor: color + '18' }]}>
        <Text style={[s.activityDelta, { color }]}>{sign}{entry.brainsDelta} pts</Text>
      </View>
    </View>
  )
}

const card = {
  shadowColor: '#3B2E8C',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
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
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3] },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    ...card,
  },
  cartBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: tokens.color.danger,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: tokens.spacing[3], paddingVertical: 7,
    backgroundColor: tokens.color.orange + '1A',
    borderRadius: tokens.radius.pill,
  },
  streakText: { color: tokens.color.orange, fontWeight: '800', fontSize: 12 },
  avatarBubble: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    ...card,
  },
  avatarEmoji: { fontSize: 20 },

  greeting: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl,
    fontWeight: '900',
    marginTop: tokens.spacing[3],
    letterSpacing: -0.5,
  },
  greetingSub: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: 4,
    marginBottom: tokens.spacing[4],
  },

  heroCard: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[5],
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: tokens.spacing[3] },
  heroWalletChip: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroBalance: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 56 },
  heroPointsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: tokens.spacing[2] },
  heroPointsText: { color: '#fff', fontSize: tokens.fontSize.sm, fontWeight: '700' },

  section: {
    color: tokens.color.textMuted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.5, marginBottom: tokens.spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: tokens.spacing[2],
  },
  sectionCount: { color: tokens.color.textMuted, fontSize: 11, fontWeight: '600', marginBottom: tokens.spacing[3] },

  statRow: { flexDirection: 'row', gap: tokens.spacing[3], marginBottom: tokens.spacing[5] },
  statCard: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[3],
    gap: 6,
    ...card,
  },
  statIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: tokens.color.textMuted, fontSize: 11, fontWeight: '600' },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing[3], marginBottom: tokens.spacing[5] },

  missionTile: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[5],
    ...card,
  },
  missionIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tokens.color.purple + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  missionTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  missionSub: { color: tokens.color.textMuted, fontSize: 12, marginTop: 2 },

  emptyToday: {
    alignItems: 'center', paddingVertical: tokens.spacing[6], gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, ...card,
  },
  emptyTodayText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },

  activityList: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    ...card,
  },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface2,
  },
  activityIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  activityLabel: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '500' },
  activityDeltaWrap: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: tokens.radius.pill },
  activityDelta: { fontSize: 12, fontWeight: '800' },
})
