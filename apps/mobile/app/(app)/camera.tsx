import { StyleSheet, Text, View } from 'react-native'
import { tokens } from '@/theme/tokens'

/**
 * Camera (the hero) — Detailed Spec § 4.
 * Vision-camera + Skia + WS pipeline lands days 6–11.
 */
export default function Camera() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg },
})
