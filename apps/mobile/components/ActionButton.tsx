import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { haptic } from '@/lib/haptics'
import { tokens } from '@/theme/tokens'

// Accepts either a Lucide or Phosphor icon component.
type AnyIcon = React.ComponentType<any>

type Props = {
  icon: AnyIcon
  label: string
  gradient: [string, string]
  onPress: () => void
  labelColor?: string
  /** 'gradient' (default, dark) or 'tile' (light fintech card). */
  variant?: 'gradient' | 'tile'
}

export function ActionButton({ icon: Icon, label, gradient, onPress, labelColor, variant = 'gradient' }: Props) {
  const press = () => { haptic.tap(); onPress() }
  if (variant === 'tile') {
    const color = gradient[0]
    return (
      <Pressable
        style={({ pressed }) => [t.card, pressed && { transform: [{ scale: 0.95 }] }]}
        onPress={press}
      >
        <View style={[t.iconTile, { backgroundColor: color + '1A' }]}>
          <Icon size={22} color={color} weight="duotone" />
        </View>
        <Text style={[t.label, labelColor ? { color: labelColor } : null]}>{label}</Text>
      </Pressable>
    )
  }

  return (
    <Pressable
      style={({ pressed }) => [s.btn, pressed && { transform: [{ scale: 0.93 }] }]}
      onPress={press}
    >
      <View style={s.dotWrap}>
        <LinearGradient
          colors={gradient}
          style={s.dot}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <Icon size={22} color="#fff" weight="fill" />
      </View>
      <Text style={[s.label, labelColor ? { color: labelColor } : null]}>{label}</Text>
    </Pressable>
  )
}

const t = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    shadowColor: '#3B2E8C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#16161F', fontSize: 11, fontWeight: '700' },
})

const s = StyleSheet.create({
  btn: { alignItems: 'center', gap: 8, flex: 1 },
  dotWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 29,
  },
  label: {
    color: tokens.color.text,
    fontSize: 11,
    fontWeight: '700',
  },
})
