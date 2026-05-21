import { StyleSheet, Text, View } from 'react-native'
import { tokens } from '@/theme/tokens'

/**
 * Phone OTP entry — Detailed Spec § 2.2 Screen A.
 * Implemented day 2.
 */
export default function PhoneScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>What's your number?</Text>
      <Text style={styles.subtitle}>We'll text you a code.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing[5],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '700' },
  subtitle: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: tokens.spacing[2] },
})
