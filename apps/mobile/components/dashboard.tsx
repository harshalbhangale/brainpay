import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CaretRight, Users } from 'phosphor-react-native'
import { haptic } from '@/lib/haptics'
import { kidTheme as t, shadow } from '@/theme/tokens'

type IconType = React.ComponentType<{
  size?: number
  color?: string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}>

/** Top family-member switcher: "Family" + members, teal underline on selected. */
export type SwitcherItem = { id: string; label: string; avatar?: string }

export function FamilySwitcher({
  items,
  selectedId,
  onSelect,
}: {
  items: SwitcherItem[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.switchRow}
    >
      {items.map((it) => {
        const active = it.id === selectedId
        const isFamily = it.id === 'family'
        return (
          <Pressable key={it.id} style={s.switchItem} onPress={() => onSelect(it.id)}>
            <View style={[s.avatar, active && s.avatarActive]}>
              {isFamily ? (
                <Users size={20} color={t.color.primary} weight="duotone" />
              ) : (
                <Text style={s.avatarEmoji}>{it.avatar ?? '🧒'}</Text>
              )}
            </View>
            <Text style={[s.switchLabel, active && s.switchLabelActive]} numberOfLines={1}>
              {it.label}
            </Text>
            <View style={[s.underline, active && s.underlineActive]} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/** Big quick-action button (filled primary or outlined) with label beneath. */
export function QuickActionButton({
  icon: Icon,
  label,
  variant = 'outlined',
  onPress,
}: {
  icon: IconType
  label: string
  variant?: 'filled' | 'outlined'
  onPress: () => void
}) {
  const filled = variant === 'filled'
  return (
    <View style={s.qaWrap}>
      <Pressable
        style={({ pressed }) => [s.qaBtn, filled ? s.qaFilled : s.qaOutlined, pressed && { opacity: 0.85 }]}
        onPress={() => { haptic.tap(); onPress() }}
      >
        <Icon size={24} color={filled ? '#fff' : t.color.text} weight={filled ? 'fill' : 'duotone'} />
      </Pressable>
      <Text style={s.qaLabel}>{label}</Text>
    </View>
  )
}

/** White stat card: icon + label, big value, muted subtitle. */
export function StatTile({
  icon: Icon,
  label,
  value,
  subtitle,
  tint = t.color.accent,
  onPress,
  style,
}: {
  icon: IconType
  label: string
  value: string
  subtitle: string
  tint?: string
  onPress?: () => void
  style?: ViewStyle
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.statTile, style, pressed && onPress ? { opacity: 0.9 } : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={s.statTop}>
        <View style={[s.statIcon, { backgroundColor: tint + '1F' }]}>
          <Icon size={16} color={tint} weight="duotone" />
        </View>
        <Text style={s.statLabel}>{label}</Text>
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statSubtitle}>{subtitle}</Text>
    </Pressable>
  )
}

/** "Manage <name>'s card" row with a mini card thumbnail + chevron. */
export function ManageCardRow({
  name,
  last4,
  locked,
  onPress,
}: {
  name: string
  last4: string
  locked?: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={({ pressed }) => [s.cardRow, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={s.miniCard}>
        <Text style={s.miniCardMark}>GL</Text>
        <View style={s.miniCardDot} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardRowTitle}>Manage {name}'s card</Text>
        <Text style={s.cardRowSub}>*{last4} card is {locked ? 'locked' : 'unlocked'}</Text>
      </View>
      <CaretRight size={20} color={t.color.textMuted} weight="bold" />
    </Pressable>
  )
}

const s = StyleSheet.create({
  // FamilySwitcher
  switchRow: { gap: t.spacing[5], paddingVertical: t.spacing[2], paddingHorizontal: t.spacing[1] },
  switchItem: { alignItems: 'center', gap: 6, width: 64 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: t.color.accent + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarActive: { borderWidth: 2, borderColor: t.color.primary },
  avatarEmoji: { fontSize: 24 },
  switchLabel: { color: t.color.textMuted, fontSize: 13, fontWeight: '600' },
  switchLabelActive: { color: t.color.text, fontWeight: '800' },
  underline: { height: 2, width: 0, borderRadius: 1, backgroundColor: 'transparent' },
  underlineActive: { width: 26, backgroundColor: t.color.primary },

  // QuickActionButton
  qaWrap: { flex: 1, alignItems: 'center', gap: 8 },
  qaBtn: {
    width: '100%', height: 66, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  qaFilled: { backgroundColor: t.color.primary, ...shadow.sm },
  qaOutlined: { backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.surface2 },
  qaLabel: { color: t.color.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // StatTile
  statTile: {
    flex: 1, backgroundColor: t.color.surface, borderRadius: t.radius.lg,
    padding: t.spacing[4], gap: 6, ...shadow.md,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: t.color.text, fontSize: t.fontSize.md, fontWeight: '700' },
  statValue: { color: t.color.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  statSubtitle: { color: t.color.textMuted, fontSize: 13, fontWeight: '500' },

  // ManageCardRow
  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: t.spacing[3],
    backgroundColor: t.color.surface, borderRadius: t.radius.lg,
    padding: t.spacing[3], ...shadow.md,
  },
  miniCard: {
    width: 46, height: 32, borderRadius: 6, backgroundColor: '#1A1A1A',
    padding: 5, justifyContent: 'space-between',
  },
  miniCardMark: { color: '#fff', fontSize: 9, fontWeight: '900' },
  miniCardDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: t.color.orange, alignSelf: 'flex-end' },
  cardRowTitle: { color: t.color.text, fontSize: t.fontSize.md, fontWeight: '800' },
  cardRowSub: { color: t.color.textMuted, fontSize: 13, marginTop: 2 },
})

/** Hero payment card — clean light card with the hero character art centered,
 *  the BrainPal logo (natural green) top-right, and card details below.
 *  `colors` is kept for API compatibility (used as a soft accent tint). */
export function PayCard({
  name,
  last4,
  balance,
  colors,
  brand = 'BRAINPAL',
  tier = 'Hero',
  onPress,
}: {
  name: string
  last4: string
  balance: number
  colors?: string[]
  brand?: string
  tier?: string
  onPress?: () => void
}) {
  const accent = colors?.[1] ?? t.color.primary
  return (
    <Pressable
      style={({ pressed }) => [pc.card, pressed && onPress ? { opacity: 0.97, transform: [{ scale: 0.99 }] } : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      {/* Soft light background */}
      <LinearGradient
        colors={['#FFFFFF', '#F4FAF7', '#E9F4EF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Faint brand glow behind the hero */}
      <View style={[pc.glow, { backgroundColor: accent + '22' }]} pointerEvents="none" />

      {/* Top row: brand logo at the very top-right (natural colors) */}
      <View style={pc.topRow}>
        <Image source={LOGO_IMG} style={pc.logo} resizeMode="contain" />
      </View>

      {/* Hero character art — centered */}
      <View style={pc.artWrap} pointerEvents="none">
        <Image source={HERO_ART_IMG} style={pc.art} resizeMode="contain" />
      </View>

      {/* Balance */}
      <View>
        <Text style={pc.balLabel}>Available balance</Text>
        <Text style={pc.bal}>${balance.toFixed(2)}</Text>
      </View>

      {/* Card number */}
      <Text style={pc.num}>••••  ••••  ••••  {last4}</Text>

      {/* Bottom: cardholder + tier */}
      <View style={pc.bottomRow}>
        <View>
          <Text style={pc.holderLabel}>CARDHOLDER</Text>
          <Text style={pc.name}>{name.toUpperCase()}</Text>
        </View>
        <View style={[pc.tierPill, { backgroundColor: accent + '1A' }]}>
          <Text style={[pc.tier, { color: accent }]}>{tier}</Text>
        </View>
      </View>
    </Pressable>
  )
}

const HERO_ART_IMG = require('@/assets/images/captain-america-art.png')
const LOGO_IMG = require('@/assets/images/logo.png')

/**
 * Build a 3-ring hero-shield palette from a single accent hex.
 * Kept for API compatibility with existing callers.
 */
export function heroColors(accent?: string): [string, string, string] {
  if (!accent) return ['#1E3A8A', '#3B82F6', '#93C5FD']
  return [shade(accent, -0.35), accent, shade(accent, 0.45)]
}

// Lighten (amount > 0) or darken (amount < 0) a hex color.
function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const num = parseInt(full, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)))
  r = adj(r); g = adj(g); b = adj(b)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

const pc = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: t.spacing[5],
    minHeight: 230,
    justifyContent: 'space-between',
    marginBottom: t.spacing[5],
    borderWidth: 1,
    borderColor: 'rgba(16,58,51,0.08)',
    shadowColor: '#103A33',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },

  // Soft brand glow blob behind the hero art
  glow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
  },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 2 },
  logo: { width: 116, height: 34 },

  // Centered hero character
  artWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  art: { width: 150, height: 178, opacity: 0.96 },

  balLabel: {
    color: t.color.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, zIndex: 1,
  },
  bal: {
    color: t.color.text, fontSize: 40, fontWeight: '900', letterSpacing: -1.5, marginTop: 2, zIndex: 1,
  },

  num: {
    color: t.color.text, fontSize: 16, fontWeight: '800', letterSpacing: 2, zIndex: 1, opacity: 0.85,
  },

  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', zIndex: 1 },
  holderLabel: { color: t.color.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  name: { color: t.color.text, fontSize: t.fontSize.md, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  tierPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: t.radius.pill },
  tier: { fontSize: t.fontSize.sm, fontWeight: '900', letterSpacing: 0.5 },
})
