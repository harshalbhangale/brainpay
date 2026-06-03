import { View, Text, StyleSheet } from 'react-native'
import { kidTheme as tokens } from '@/theme/tokens'

export default function ScanTab() {
  return (
    <View style={s.root}>
      <Text style={s.text}>Opening camera...</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, alignItems: 'center', justifyContent: 'center' },
  text: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },
})
