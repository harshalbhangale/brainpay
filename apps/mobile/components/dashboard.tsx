import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'
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

/** Premium Visa-style card: cardholder name, balance, chip, brand mark. */
export function PayCard({
  name,
  last4,
  balance,
  colors = ['#0E7C66', '#16A07F'],
  brand = 'VISA',
  onPress,
}: {
  name: string
  last4: string
  balance: number
  colors?: [string, string]
  brand?: string
  onPress?: () => void
}) {
  return (
    <Pressable style={({ pressed }) => [pc.card, pressed && onPress ? { opacity: 0.95 } : null]} onPress={onPress} disabled={!onPress}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={pc.topRow}>
        <View style={pc.chip} />
        <Text style={pc.bp}>BrainPal</Text>
      </View>
      <Text style={pc.balLabel}>Balance</Text>
      <Text style={pc.bal}>${balance.toFixed(2)}</Text>
      <View style={pc.bottomRow}>
        <View>
          <Text style={pc.name}>{name.toUpperCase()}</Text>
          <Text style={pc.num}>•••• {last4}</Text>
        </View>
        <Text style={pc.brand}>{brand}</Text>
      </View>
    </Pressable>
  )
}

const pc = StyleSheet.create({
  card: {
    borderRadius: 24, overflow: 'hidden', padding: t.spacing[5], minHeight: 200,
    justifyContent: 'space-between',
    shadowColor: '#0E7C66', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { width: 38, height: 28, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.85)' },
  bp: { color: 'rgba(255,255,255,0.9)', fontSize: t.fontSize.sm, fontWeight: '800', letterSpacing: 0.5 },
  balLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: t.spacing[3] },
  bal: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: t.spacing[4] },
  name: { color: '#fff', fontSize: t.fontSize.md, fontWeight: '700', letterSpacing: 1.5 },
  num: { color: 'rgba(255,255,255,0.85)', fontSize: t.fontSize.sm, letterSpacing: 2, marginTop: 4 },
  brand: { color: '#fff', fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
})
