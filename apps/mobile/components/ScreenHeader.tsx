import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { kidTheme as tokens } from '@/theme/tokens'

type Props = {
  title: string
  onBack?: () => void
  right?: React.ReactNode
}

export function ScreenHeader({ title, onBack, right }: Props) {
  const router = useRouter()

  return (
    <View style={s.header}>
      <Pressable hitSlop={12} onPress={onBack ?? (() => router.back())} style={s.backBtn}>
        <ArrowLeft size={20} color={tokens.color.text} strokeWidth={1.8} />
      </Pressable>
      <Text style={s.title}>{title}</Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
})
