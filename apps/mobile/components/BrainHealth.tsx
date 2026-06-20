import { StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import Svg, { Circle } from 'react-native-svg'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

type Stats = {
  cardsDue: number
  cardsMastered: number
  topicsActive: number
}

export function BrainHealth() {
  const { data } = useQuery({
    queryKey: ['study-stats'],
    queryFn: () => api<Stats>('/study/stats'),
    staleTime: 30_000,
  })

  if (!data) return null

  // Health = mastered / (mastered + due), capped at 100
  const total = (data.cardsMastered ?? 0) + (data.cardsDue ?? 0)
  const health = total > 0 ? Math.min(100, Math.round((data.cardsMastered / total) * 100)) : 100
  const fading = data.cardsDue ?? 0

  const color =
    health > 70 ? tokens.color.trafficGreen :
    health >= 40 ? tokens.color.trafficAmber :
    tokens.color.trafficRed

  const SIZE = 56
  const STROKE = 5
  const R = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R
  const progress = CIRC * (1 - health / 100)

  return (
    <View style={s.root}>
      <View style={s.ringWrap}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            stroke={tokens.color.surface2} strokeWidth={STROKE} fill="none"
          />
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            stroke={color} strokeWidth={STROKE} fill="none"
            strokeDasharray={`${CIRC}`} strokeDashoffset={progress}
            strokeLinecap="round" rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <Text style={[s.pct, { color }]}>{health}%</Text>
      </View>
      <View style={s.info}>
        <Text style={s.title}>🧠 Brain Health</Text>
        {fading > 0 && <Text style={s.sub}>{fading} cards fading</Text>}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg,
    padding: 14, marginBottom: 20,
    shadowColor: '#103A33', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  ringWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pct: { position: 'absolute', fontSize: 13, fontWeight: '900' },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: tokens.color.text },
  sub: { fontSize: 12, color: tokens.color.textMuted, marginTop: 2 },
})
