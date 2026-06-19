import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Plus } from 'phosphor-react-native'
import { haptic } from '@/lib/haptics'
import { kidTheme as t } from '@/theme/tokens'

/**
 * KidSpotlight — a horizontal row of kid avatars where the SELECTED kid is
 * large and centered (spotlight), and the others shrink + fade to the side.
 * Tapping an avatar moves the spotlight with a spring. An "Add" tile at the
 * end lets the parent add a child directly (no family-creation step).
 *
 * Built on React Native's Animated (web-safe, no native rebuild needed).
 */

export type SpotlightKid = {
  id: string
  name: string
  avatar?: string
  color?: string
}

const BIG = 84
const SMALL = 54

export function KidSpotlight({
  kids,
  selectedId,
  onSelect,
  onAddKid,
}: {
  kids: SpotlightKid[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddKid: () => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
    >
      {kids.map((kid) => (
        <AvatarItem
          key={kid.id}
          kid={kid}
          selected={kid.id === selectedId}
          onPress={() => {
            haptic.select()
            onSelect(kid.id)
          }}
        />
      ))}

      {/* Add tile */}
      <Pressable
        style={s.item}
        onPress={() => {
          haptic.tap()
          onAddKid()
        }}
      >
        <View style={s.addCircle}>
          <Plus size={26} color={t.color.primary} weight="bold" />
        </View>
        <Text style={s.addLabel}>Add</Text>
      </Pressable>
    </ScrollView>
  )
}

function AvatarItem({
  kid,
  selected,
  onPress,
}: {
  kid: SpotlightKid
  selected: boolean
  onPress: () => void
}) {
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(anim, {
      toValue: selected ? 1 : 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start()
  }, [selected, anim])

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [SMALL / BIG, 1] })
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
  const accent = kid.color ?? t.color.primary

  return (
    <Pressable style={s.item} onPress={onPress}>
      <Animated.View
        style={[
          s.avatarWrap,
          { transform: [{ scale }], opacity },
          selected && { borderColor: accent, borderWidth: 3 },
        ]}
      >
        <View style={[s.avatar, { backgroundColor: accent + '22' }]}>
          <Text style={s.avatarEmoji}>{kid.avatar ?? '🧒'}</Text>
        </View>
      </Animated.View>
      <Animated.Text
        style={[s.name, { opacity }, selected && { color: t.color.text, fontWeight: '800' }]}
        numberOfLines={1}
      >
        {kid.name}
      </Animated.Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    gap: t.spacing[4],
    paddingVertical: t.spacing[3],
    paddingHorizontal: t.spacing[2],
    alignItems: 'center',
    minHeight: 130,
  },
  item: { alignItems: 'center', justifyContent: 'flex-end', width: BIG, gap: 8 },
  avatarWrap: {
    width: BIG,
    height: BIG,
    borderRadius: BIG / 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: BIG - 8,
    height: BIG - 8,
    borderRadius: (BIG - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 34 },
  name: { color: t.color.textMuted, fontSize: 13, fontWeight: '600', maxWidth: BIG, textAlign: 'center' },

  addCircle: {
    width: SMALL,
    height: SMALL,
    borderRadius: SMALL / 2,
    backgroundColor: t.color.primary + '14',
    borderWidth: 2,
    borderColor: t.color.primary + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { color: t.color.primary, fontSize: 13, fontWeight: '700' },
})
