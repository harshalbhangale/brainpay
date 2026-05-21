import { StyleSheet, Text, View } from 'react-native'
import { tokens } from '@/theme/tokens'

/**
 * Dashboard — Detailed Spec § 3.2 Screen A.
 * Implemented day 4.
 */
export default function Dashboard() {
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hey 👋</Text>
      <Text style={styles.balance}>💰 0 coins</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.spacing[5] },
  greeting: { color: tokens.color.text, fontSize: tokens.fontSize.lg },
  balance: { color: tokens.color.text, fontSize: tokens.fontSize.hero, fontWeight: '700', marginTop: tokens.spacing[5] },
})
