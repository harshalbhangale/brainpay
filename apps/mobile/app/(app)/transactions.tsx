import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ClipboardList, ShoppingBag, TrendingDown, TrendingUp, Wallet, Zap } from 'lucide-react-native'
import { useWallet, type LedgerEntry } from '@/hooks/useWallet'
import { kidTheme as tokens, shadow } from '@/theme/tokens'

const FILTERS = ['All', 'In', 'Out'] as const
type Filter = (typeof FILTERS)[number]

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

function describe(e: LedgerEntry): { label: string; Icon: LucideIcon; color: string } {
  const meta = e.metadata as { itemName?: string; note?: string; choreTitle?: string }
  const pos = e.brainsDelta >= 0
  if (e.kind === 'topup' || e.kind === 'topup_stripe') return { label: meta.note ? `Top up — ${meta.note}` : 'Top up', Icon: TrendingUp, color: tokens.color.positive }
  if (e.kind === 'cart_checkout') return { label: `Bought ${meta.itemName ?? 'item'}`, Icon: ShoppingBag, color: tokens.color.orange }
  if (e.kind === 'scan_skip_reward') return { label: `Skipped ${meta.itemName ?? 'junk'}`, Icon: Zap, color: tokens.color.accent }
  if (e.kind === 'chore_payout') return { label: `Chore: ${meta.choreTitle ?? 'done'}`, Icon: ClipboardList, color: tokens.color.blue }
  return { label: e.kind.replace(/_/g, ' '), Icon: pos ? TrendingUp : TrendingDown, color: pos ? tokens.color.positive : tokens.color.negative }
}

export default function Transactions() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useWallet()
  const [filter, setFilter] = useState<Filter>('All')

  const groups = useMemo(() => {
    const entries = (data?.entries ?? []).filter((e) =>
      filter === 'All' ? true : filter === 'In' ? e.brainsDelta >= 0 : e.brainsDelta < 0,
    )
    const byDay: Record<string, LedgerEntry[]> = {}
    for (const e of entries) {
      const day = new Date(e.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      ;(byDay[day] ??= []).push(e)
    }
    return Object.entries(byDay)
  }, [data, filter])

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.title}>Transactions</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabs}>
        {FILTERS.map((f) => (
          <Pressable key={f} style={[s.tab, filter === f && s.tabActive]} onPress={() => setFilter(f)}>
            <Text style={[s.tabText, filter === f && s.tabTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={tokens.color.primary} /></View>
      ) : groups.length === 0 ? (
        <View style={s.center}><Wallet size={32} color={tokens.color.textMuted} strokeWidth={1.5} /><Text style={s.empty}>No transactions yet</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + tokens.spacing[8], paddingHorizontal: tokens.spacing[5] }} showsVerticalScrollIndicator={false}>
          {groups.map(([day, items]) => (
            <View key={day}>
              <Text style={s.day}>{day}</Text>
              <View style={s.card}>
                {items.map((e, i) => {
                  const { label, Icon, color } = describe(e)
                  const pos = e.brainsDelta >= 0
                  const time = new Date(e.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                  return (
                    <View key={e.id} style={[s.row, i < items.length - 1 && s.rowBorder]}>
                      <View style={[s.icon, { backgroundColor: color + '1F' }]}><Icon size={16} color={color} strokeWidth={2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>{label}</Text>
                        <Text style={s.time}>{time}</Text>
                      </View>
                      <Text style={[s.amount, { color: pos ? tokens.color.positive : tokens.color.negative }]}>
                        {pos ? '+' : '−'}{Math.abs(e.brainsDelta)} pts
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[3] },
  empty: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3] },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: tokens.spacing[2], paddingHorizontal: tokens.spacing[5], marginBottom: tokens.spacing[3] },
  tab: { paddingHorizontal: tokens.spacing[4], paddingVertical: 8, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface },
  tabActive: { backgroundColor: tokens.color.primary },
  tabText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  day: { color: tokens.color.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: tokens.spacing[4], marginBottom: tokens.spacing[2] },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, ...shadow.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], padding: tokens.spacing[4] },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: tokens.color.surface2 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  time: { color: tokens.color.textMuted, fontSize: 12, marginTop: 2 },
  amount: { fontSize: tokens.fontSize.sm, fontWeight: '800' },
})
