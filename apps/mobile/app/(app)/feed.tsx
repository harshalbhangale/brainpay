import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { kidTheme as tokens } from '@/theme/tokens'

/** Placeholder — Task 11 builds the full PAL feed with realtime. */
export default function ParentFeed() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={s.t}>PAL Feed</Text>
      <Text style={s.sub}>Coming next (Task 11).</Text>
      <Pressable style={s.cta} onPress={() => router.back()}>
        <Text style={s.ctaText}>Back</Text>
      </Pressable>
    </View>
  )
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.spacing[5], justifyContent: 'center', alignItems: 'center' },
  t: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  sub: { color: tokens.color.textMuted, marginTop: tokens.spacing[2] },
  cta: { marginTop: tokens.spacing[5], paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3], backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill },
  ctaText: { color: tokens.color.text, fontWeight: '700' },
})
