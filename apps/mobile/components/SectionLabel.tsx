import { StyleSheet, Text, View } from 'react-native'
import { kidTheme as tokens } from '@/theme/tokens'

type Props = {
  text: string
  color?: string
}

export function SectionLabel({ text, color = tokens.color.textMuted }: Props) {
  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.text}>{text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: tokens.spacing[5],
    marginBottom: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[5],
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: {
    color: tokens.color.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
})
