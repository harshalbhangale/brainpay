import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  CaretRight,
  CreditCard,
  House,
  ClipboardText,
  MapPin,
  Receipt,
  ScanSmiley,
  ShoppingCart,
  SignOut,
  Target,
  Users,
  Wallet,
} from 'phosphor-react-native'
import { useFamily } from '@/hooks/useFamily'
import { useAuthStore } from '@/stores/auth'
import { kidTheme as t, shadow } from '@/theme/tokens'

type PhosphorIcon = React.ComponentType<{ size?: number; color?: string; weight?: 'duotone' | 'fill' | 'bold' }>
type Row = { key: string; label: string; sub: string; icon: PhosphorIcon; route: string; tint: string }

const KID_ROWS: Row[] = [
  { key: 'dashboard', label: 'Dashboard', sub: 'Your home base', icon: House, route: '/(app)/dashboard', tint: t.color.primary },
  { key: 'card', label: 'My card', sub: 'Balance & history', icon: CreditCard, route: '/(app)/transactions', tint: t.color.blue },
  { key: 'missions', label: 'Missions', sub: 'Earn Brain Points', icon: ClipboardText, route: '/(app)/chores', tint: t.color.purple },
  { key: 'goals', label: 'Goals', sub: 'Save toward something', icon: Target, route: '/(app)/goals', tint: t.color.accent },
  { key: 'scan', label: 'Scan', sub: 'Smart-buy check', icon: ScanSmiley, route: '/(app)/camera', tint: t.color.orange },
  { key: 'family', label: 'Find family', sub: 'See everyone', icon: MapPin, route: '/(app)/family-safety', tint: t.color.pink },
  { key: 'cart', label: 'Cart', sub: 'Items to check out', icon: ShoppingCart, route: '/(app)/cart', tint: t.color.blue },
]

const PARENT_ROWS: Row[] = [
  { key: 'dashboard', label: 'Dashboard', sub: 'Kids & wallets', icon: House, route: '/(app)/dashboard', tint: t.color.primary },
  { key: 'kids', label: 'Add a kid', sub: 'Invite to the family', icon: Users, route: '/(app)/add-kid', tint: t.color.blue },
  { key: 'wallet', label: 'Top up', sub: 'Add money', icon: Wallet, route: '/(app)/topup', tint: t.color.accent },
  { key: 'transactions', label: 'Transactions', sub: 'Full history', icon: Receipt, route: '/(app)/transactions', tint: t.color.purple },
  { key: 'chores', label: 'Chores', sub: 'Review & approve', icon: ClipboardText, route: '/(app)/parent-chores', tint: t.color.orange },
  { key: 'goals', label: 'Goals', sub: 'Savings targets', icon: Target, route: '/(app)/goals', tint: t.color.accent },
  { key: 'safety', label: 'Safety', sub: 'Map & members', icon: MapPin, route: '/(app)/family-safety', tint: t.color.pink },
]

/**
 * Surfaces drawer — the swipe-left navigator into every existing screen.
 * Role-aware: parents get approval/management surfaces, kids get their
 * missions/goals/scan. `RevealHome` owns the slide-in animation.
 */
export function SurfacesDrawer({ onNavigate, onClose }: { onNavigate: (route: string) => void; onClose: () => void }) {
  const router = useRouter()
  const accountType = useAuthStore((s) => s.accountType)
  const accountId = useAuthStore((s) => s.accountId)
  const signOut = useAuthStore((s) => s.signOut)
  const role = accountType === 'kid' ? 'kid' : 'parent'
  const { data: famData } = useFamily()

  const me = famData?.members.find((m) => m.accountId === accountId)
  const persona = (me?.persona ?? {}) as { name?: string; avatar?: string }
  const rows = role === 'kid' ? KID_ROWS : PARENT_ROWS

  const onSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          onClose()
          await signOut()
          router.replace('/(auth)/welcome')
        },
      },
    ])
  }

  return (
    <View style={s.drawer}>
      <View style={s.profile}>
        <View style={s.avatar}>
          <Text style={s.avatarEmoji}>{persona.avatar ?? (role === 'kid' ? '🧒' : '🧑')}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{persona.name ?? (role === 'kid' ? 'You' : 'Parent')}</Text>
          <Text style={s.roleTag}>{role === 'kid' ? 'Kid account' : 'Parent account'}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        {rows.map((row) => (
          <Pressable
            key={row.key}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
            onPress={() => onNavigate(row.route)}
          >
            <View style={[s.rowIcon, { backgroundColor: row.tint + '1A' }]}>
              <row.icon size={20} color={row.tint} weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{row.label}</Text>
              <Text style={s.rowSub}>{row.sub}</Text>
            </View>
            <CaretRight size={18} color={t.color.textMuted} weight="bold" />
          </Pressable>
        ))}

        <Pressable style={({ pressed }) => [s.signOut, pressed && { opacity: 0.85 }]} onPress={onSignOut}>
          <SignOut size={18} color={t.color.danger} weight="bold" />
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  drawer: { flex: 1, paddingHorizontal: t.spacing[4] },
  profile: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], paddingVertical: t.spacing[4] },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.color.primary + '18', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 26 },
  name: { color: t.color.text, fontSize: t.fontSize.lg, fontWeight: '900' },
  roleTag: { color: t.color.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },

  list: { paddingBottom: t.spacing[6], gap: t.spacing[2] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: t.spacing[3],
    backgroundColor: t.color.surface, borderRadius: t.radius.lg, padding: t.spacing[3], ...shadow.sm,
  },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: t.color.text, fontSize: t.fontSize.md, fontWeight: '800' },
  rowSub: { color: t.color.textMuted, fontSize: 12, marginTop: 1 },

  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: t.spacing[3], paddingVertical: t.spacing[4], borderRadius: t.radius.lg,
    backgroundColor: t.color.danger + '12',
  },
  signOutText: { color: t.color.danger, fontSize: t.fontSize.md, fontWeight: '800' },
})
