import { StyleSheet, Text, View } from 'react-native'
import { tokens } from '@/theme/tokens'

/**
 * OTP entry — Detailed Spec § 2.2 Screen B.
 * Implemented day 2.
 */
export default function OtpScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter the code</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '700' },
})
