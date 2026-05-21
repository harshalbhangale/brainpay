import { StyleSheet, Text, View } from 'react-native'
import { tokens } from '@/theme/tokens'

/**
 * Add funds modal — Detailed Spec § 3.2 Screen B.
 * Implemented day 5.
 */
export default function Topup() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add coins</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.surface, padding: tokens.spacing[5] },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '700' },
})
