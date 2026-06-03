import { useMemo, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Polyline } from 'react-native-svg'
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react-native'
import { kidTheme as tokens, shadow } from '@/theme/tokens'

/** Dummy/educational investing — practice money only, nothing real. */
const INSTRUMENTS = [
  { id: 'tech', name: 'Tech Fund', emoji: '💻', price: 120, trend: 2.4 },
  { id: 'green', name: 'Green Fund', emoji: '🌱', price: 80, trend: 1.1 },
  { id: 'space', name: 'Space Fund', emoji: '🚀', price: 200, trend: -0.8 },
  { id: 'gold', name: 'Gold', emoji: '🥇', price: 150, trend: 0.5 },
]

const CHART_W = Dimensions.get('window').width - tokens.spacing[5] * 2 - tokens.spacing[5] * 2
const CHART_H = 72

// Seeded random walk so the chart is stable across renders.
function series(seed: number, n = 24) {
  const out: number[] = []
  let v = 50
  let s = seed
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    v += (s / 233280 - 0.45) * 8
    out.push(Math.max(8, Math.min(64, v)))
  }
  return out
}

export default function Grow() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [holdings, setHoldings] = useState<Record<string, number>>({ tech: 1, green: 2 })

  const portfolio = useMemo(
    () => INSTRUMENTS.reduce((sum, it) => sum + (holdings[it.id] ?? 0) * it.price, 0),
    [holdings],
  )
  const points = useMemo(() => {
    const ys = series(portfolio || 100)
    const step = CHART_W / (ys.length - 1)
    return ys.map((y, i) => `${(i * step).toFixed(1)},${(CHART_H - y).toFixed(1)}`).join(' ')
  }, [portfolio])

  const invest = (id: string) => setHoldings((h) => ({ ...h, [id]: (h[id] ?? 0) + 1 }))

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.title}>Grow</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: tokens.spacing[5], paddingBottom: insets.bottom + tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        <View style={s.banner}>
          <Text style={s.bannerText}>🧪 Practice money — learn investing risk-free.</Text>
        </View>

        <View style={s.portfolioCard}>
          <Text style={s.pLabel}>YOUR PORTFOLIO</Text>
          <Text style={s.pValue}>{portfolio.toLocaleString()} pts</Text>
          <Svg width={CHART_W} height={CHART_H} style={{ marginTop: tokens.spacing[3] }}>
            <Polyline points={points} fill="none" stroke={tokens.color.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        </View>

        <Text style={s.section}>FUNDS</Text>
        {INSTRUMENTS.map((it) => {
          const up = it.trend >= 0
          const units = holdings[it.id] ?? 0
          return (
            <View key={it.id} style={s.row}>
              <Text style={s.emoji}>{it.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{it.name}</Text>
                <View style={s.trendRow}>
                  {up ? <TrendingUp size={12} color={tokens.color.positive} strokeWidth={2.5} /> : <TrendingDown size={12} color={tokens.color.negative} strokeWidth={2.5} />}
                  <Text style={[s.trend, { color: up ? tokens.color.positive : tokens.color.negative }]}>{up ? '+' : ''}{it.trend}%</Text>
                  {units > 0 && <Text style={s.units}>· {units} owned</Text>}
                </View>
              </View>
              <Text style={s.price}>{it.price} pts</Text>
              <Pressable style={s.invest} onPress={() => invest(it.id)}>
                <Text style={s.investText}>Invest</Text>
              </Pressable>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3] },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  banner: { backgroundColor: tokens.color.accent + '1F', borderRadius: tokens.radius.md, padding: tokens.spacing[3], marginBottom: tokens.spacing[4] },
  bannerText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  portfolioCard: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[5], ...shadow.md },
  pLabel: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  pValue: { color: tokens.color.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  section: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[4], marginBottom: tokens.spacing[2], ...shadow.sm },
  emoji: { fontSize: 26 },
  name: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  trend: { fontSize: 12, fontWeight: '700' },
  units: { color: tokens.color.textMuted, fontSize: 12 },
  price: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  invest: { backgroundColor: tokens.color.primary, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.spacing[4], paddingVertical: 8 },
  investText: { color: '#fff', fontSize: 13, fontWeight: '800' },
})
