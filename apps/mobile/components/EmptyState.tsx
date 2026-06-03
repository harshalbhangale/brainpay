import { Pressable, StyleSheet, Text, View } from 'react-native'
import { kidTheme as tokens } from '@/theme/tokens'
import { Lottie, type LottieName } from './Lottie'

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

type Props = {
  icon: LucideIcon
  lottie?: LottieName
  title: string
  subtitle: string
  ctaLabel?: string
  onCtaPress?: () => void
}

export function EmptyState({ icon: Icon, lottie, title, subtitle, ctaLabel, onCtaPress }: Props) {
  return (
    <View style={s.container}>
      {lottie ? (
        <Lottie name={lottie} size={140} />
      ) : (
        <View style={s.iconWrap}>
          <Icon size={40} color={tokens.color.textMuted} strokeWidth={1.2} />
        </View>
      )}
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>
      {ctaLabel && onCtaPress && (
        <Pressable style={s.cta} onPress={onCtaPress}>
          <Text style={s.ctaText}>{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: tokens.spacing[8],
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[5],
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[2],
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '800',
  },
  subtitle: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
  },
  cta: {
    height: 56,
    paddingHorizontal: tokens.spacing[6],
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing[2],
  },
  ctaText: {
    color: '#000',
    fontWeight: '800',
    fontSize: tokens.fontSize.md,
  },
})
