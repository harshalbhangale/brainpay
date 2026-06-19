import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { CreditCard, PiggyBank, ListChecks, CalendarBlank } from 'phosphor-react-native'
import { PayCard, ManageCardRow, StatTile, heroColors } from '@/components/dashboard'
import { kidTheme as t } from '@/theme/tokens'

/**
 * KidProfileSheet — the kid's full profile that slides up when their avatar
 * is spotlighted, and slides/fades away when deselected. Pure Animated, so
 * it works on web and native with no extra deps.
 */

export type KidProfile = {
  id: string
  name: string
  avatar?: string
  color?: string
  balanceCents: number
  eventsToday?: number
}

export function KidProfileSheet({
  kid,
  visible,
  onOpenCard,
  onSpending,
  onSaving,
  onChores,
  onTransactions,
}: {
  kid: KidProfile | null
  visible: boolean
  onOpenCard: () => void
  onSpending: () => void
  onSaving: () => void
  onChores: () => void
  onTransactions: () => void
}) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 420 : 240,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [visible, anim])

  if (!kid) return null

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] })
  const last4 = (kid.id.replace(/\D/g, '').slice(-4) || '2734')
  const balance = kid.balanceCents / 100
  const accent = kid.color ?? t.color.primary

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
      <PayCard
        name={kid.name}
        last4={last4}
        balance={balance}
        colors={heroColors(kid.color)}
        tier="Hero"
        onPress={onTransactions}
      />

      <ManageCardRow name={kid.name} last4={last4} onPress={onOpenCard} />

      <View style={s.grid}>
        <View style={s.gridRow}>
          <StatTile icon={CreditCard} label="Spending" value={`$${balance.toFixed(2)}`} subtitle="Manage controls" tint={accent} onPress={onSpending} />
          <StatTile icon={PiggyBank} label="Saving" value="$0.00" subtitle="Add goal" onPress={onSaving} />
        </View>
        <View style={s.gridRow}>
          <StatTile icon={ListChecks} label="Chores" value={`${kid.eventsToday ?? 0}`} subtitle="Due today" onPress={onChores} />
          <StatTile icon={CalendarBlank} label="Allowance" value="$0.00" subtitle="Set up" onPress={onChores} />
        </View>
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  grid: { gap: t.spacing[3], marginTop: t.spacing[4] },
  gridRow: { flexDirection: 'row', gap: t.spacing[3] },
})
