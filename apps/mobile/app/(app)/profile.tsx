import { StyleSheet, Text, View } from 'react-native'
import { tokens } from '@/theme/tokens'

/**
 * Profile — Detailed Spec § 3.2 Screen D, § 5.3.
 * Implemented day 13.
 */
export default function Profile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>You</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.spacing[5] },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '700' },
})
