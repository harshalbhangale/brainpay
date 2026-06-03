import { StyleSheet, Text, View } from 'react-native'
import { getPal } from '@/components/pals'
import { kidTheme as t, shadow } from '@/theme/tokens'

export type PalLine = { palId: string; line: string }

/** Small colored pill: pal emoji + name. */
export function PalChip({ palId }: { palId: string }) {
  const pal = getPal(palId)
  return (
    <View style={[s.chip, { backgroundColor: pal.color + '1A' }]}>
      <Text style={s.chipEmoji}>{pal.emoji}</Text>
      <Text style={[s.chipName, { color: pal.color }]}>{pal.name}</Text>
    </View>
  )
}

/** A council reply: each Pal that chimed in gets a row (avatar + name + line). */
export function CouncilCard({ pals }: { pals: PalLine[] }) {
  return (
    <View style={s.card}>
      {pals.map((p, i) => {
        const pal = getPal(p.palId)
        return (
          <View key={i} style={[s.row, i < pals.length - 1 && s.rowBorder]}>
            <View style={[s.avatar, { backgroundColor: pal.color + '1A' }]}>
              <Text style={s.avatarEmoji}>{pal.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.name, { color: pal.color }]}>{pal.name}</Text>
              <Text style={s.line}>{p.line}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: t.radius.pill },
  chipEmoji: { fontSize: 12 },
  chipName: { fontSize: 11, fontWeight: '800' },
  card: { backgroundColor: t.color.surface, borderRadius: t.radius.lg, marginBottom: t.spacing[3], ...shadow.md },
  row: { flexDirection: 'row', gap: t.spacing[3], padding: t.spacing[4] },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: t.color.surface2 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 18 },
  name: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  line: { color: t.color.text, fontSize: t.fontSize.sm, lineHeight: 20 },
})
