import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarBlank, CreditCard, ListChecks, PiggyBank, QrCode, PaperPlaneTilt, User } from 'phosphor-react-native'
import { useFamily } from '@/hooks/useFamily'
import { useFamilyStore } from '@/stores/family'
import { useAuthStore } from '@/stores/auth'
import { FadeIn } from '@/components/ui'
import {
  FamilySwitcher,
  QuickActionButton,
  ManageCardRow,
  StatTile,
  PayCard,
  type SwitcherItem,
} from '@/components/dashboard'
import { TAB_BAR_TOTAL_HEIGHT } from '@/components/TabBar'
import { kidTheme as tokens } from '@/theme/tokens'

export default function ParentHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useFamily()
  const setFamily = useFamilyStore((s) => s.setFamily)
  const setMembers = useFamilyStore((s) => s.setMembers)
  const signOut = useAuthStore((s) => s.signOut)
  const [selected, setSelected] = useState('family')

  useEffect(() => {
    if (data?.family) setFamily(data.family)
    if (data?.members) setMembers(data.members)
  }, [data, setFamily, setMembers])

  if (isLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.primary} />
      </View>
    )
  }

  const family = data?.family
  const kids = (data?.members ?? []).filter((m) => m.role === 'kid')

  const onProfile = () =>
    Alert.alert('Profile', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/(auth)/welcome') } },
    ])

  const items: SwitcherItem[] = [
    { id: 'family', label: 'Family' },
    ...kids.map((k) => ({ id: k.accountId, label: k.persona?.name ?? 'Kid', avatar: k.persona?.avatar })),
  ]

  const kid = kids.find((k) => k.accountId === selected)
  const familyTotal = kids.reduce((sum, k) => sum + (k.cachedBalance ?? 0), 0) / 100
  const last4 = (id: string) => (id.replace(/\D/g, '').slice(-4) || '2734')

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_TOTAL_HEIGHT + 20 }} showsVerticalScrollIndicator={false}>
        <FamilySwitcher items={items} selectedId={selected} onSelect={setSelected} />

        {/* Quick actions */}
        <View style={s.qaRow}>
          <QuickActionButton icon={PaperPlaneTilt} label="Send money" variant="filled" onPress={() => router.push('/(app)/topup')} />
          <QuickActionButton icon={QrCode} label="Share to get paid" onPress={() => router.push('/(app)/invite-send')} />
          <QuickActionButton icon={User} label="Profile" onPress={onProfile} />
        </View>

        {kid ? (
          <FadeIn>
            <PayCard
              name={kid.persona?.name ?? 'Kid'}
              last4={last4(kid.accountId)}
              balance={(kid.cachedBalance ?? 0) / 100}
              onPress={() => router.push('/(app)/transactions')}
            />
            <View style={{ height: tokens.spacing[4] }} />
            <ManageCardRow
              name={kid.persona?.name ?? 'Kid'}
              last4={last4(kid.accountId)}
              onPress={() => router.push({ pathname: '/(app)/card-detail', params: { id: kid.accountId } })}
            />
            <View style={s.grid}>
              <View style={s.gridRow}>
                <StatTile icon={CreditCard} label="Spending" value={`$${((kid.cachedBalance ?? 0) / 100).toFixed(2)}`} subtitle="Manage controls" onPress={() => router.push({ pathname: '/(app)/kid-detail', params: { id: kid.accountId } })} />
                <StatTile icon={PiggyBank} label="Saving" value="$0.00" subtitle="Add goal" onPress={() => router.push('/(app)/goals')} />
              </View>
              <View style={s.gridRow}>
                <StatTile icon={ListChecks} label="Chores" value={`${kid.todayEventCount ?? 0}`} subtitle="Due today" onPress={() => router.push('/(app)/parent-chores')} />
                <StatTile icon={CalendarBlank} label="Allowance" value="$0.00" subtitle="Set up" onPress={() => router.push('/(app)/parent-chores')} />
              </View>
            </View>
          </FadeIn>
        ) : (
          <FadeIn>
            <PayCard name={family?.name ?? 'Family'} last4="2734" balance={familyTotal} />
            <Text style={s.section}>YOUR KIDS</Text>
            {kids.length === 0 ? (
              <Pressable style={s.addKid} onPress={() => router.push('/(app)/add-kid')}>
                <Text style={s.addKidText}>+  Add your first kid</Text>
              </Pressable>
            ) : (
              kids.map((k) => (
                <Pressable key={k.accountId} style={s.kidRow} onPress={() => setSelected(k.accountId)}>
                  <Text style={s.kidEmoji}>{k.persona?.avatar ?? '🧒'}</Text>
                  <Text style={s.kidName}>{k.persona?.name ?? 'Kid'}</Text>
                  <Text style={s.kidBal}>${((k.cachedBalance ?? 0) / 100).toFixed(2)}</Text>
                </Pressable>
              ))
            )}
          </FadeIn>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },
  qaRow: { flexDirection: 'row', gap: tokens.spacing[3], marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5] },
  grid: { gap: tokens.spacing[3], marginTop: tokens.spacing[4] },
  gridRow: { flexDirection: 'row', gap: tokens.spacing[3] },
  section: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3] },
  addKid: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[4], alignItems: 'center' },
  addKidText: { color: tokens.color.primary, fontWeight: '800', fontSize: tokens.fontSize.md },
  kidRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[4], marginBottom: tokens.spacing[2] },
  kidEmoji: { fontSize: 24 },
  kidName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  kidBal: { color: tokens.color.primary, fontSize: tokens.fontSize.lg, fontWeight: '900' },
})
