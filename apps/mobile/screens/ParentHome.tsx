import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bell, Gear, Plus } from 'phosphor-react-native'
import { api } from '@/lib/api'
import { useFamily } from '@/hooks/useFamily'
import { useFamilyStore } from '@/stores/family'
import { useAuthStore } from '@/stores/auth'
import { FadeIn } from '@/components/ui'
import { PayCard, heroColors } from '@/components/dashboard'
import { KidSpotlight, type SpotlightKid } from '@/components/KidSpotlight'
import { KidProfileSheet, type KidProfile } from '@/components/KidProfileSheet'
import { TAB_BAR_TOTAL_HEIGHT } from '@/components/TabBar'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Parent home — kid spotlight model (no "family" concept exposed).
 *
 * Top: greeting + bell/settings. A spotlight row of kid avatars; the
 * selected kid is large, others shrink to the side. Selecting a kid slides
 * up their full profile. With no kid selected, the parent's own wallet shows.
 * An "Add" tile in the spotlight adds a child directly.
 */
export default function ParentHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useFamily()
  const setFamily = useFamilyStore((s) => s.setFamily)
  const setMembers = useFamilyStore((s) => s.setMembers)
  const signOut = useAuthStore((s) => s.signOut)
  const accountId = useAuthStore((s) => s.accountId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: pendingData } = useQuery({
    queryKey: ['pending-kids'],
    queryFn: () => api<{ requests: { id: string; name: string | null; phone: string }[] }>('/join-requests/outgoing'),
    staleTime: 10_000,
    refetchInterval: 20_000,
  })
  const pending = pendingData?.requests ?? []

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

  const members = data?.members ?? []
  const kids = members.filter((m) => m.role === 'kid')
  const others = members.filter((m) => m.role !== 'kid' && m.accountId !== accountId)
  const meMember = members.find((m) => m.accountId === accountId)
  const parentName = meMember?.persona?.name ?? 'You'

  // Spotlight: You + kids + co-parents/guardians.
  const spotlightKids: SpotlightKid[] = [
    ...(meMember ? [{ id: accountId as string, name: 'You', avatar: meMember.persona?.avatar, color: meMember.persona?.color }] : []),
    ...kids.map((k) => ({ id: k.accountId, name: k.persona?.name ?? 'Kid', avatar: k.persona?.avatar, color: k.persona?.color })),
    ...others.map((o) => ({ id: o.accountId, name: o.persona?.name ?? 'Parent', avatar: o.persona?.avatar ?? '🧑', color: o.persona?.color })),
  ]

  // Wallet view target: the selected non-kid member, or me by default.
  const walletMember = members.find((m) => m.accountId === (selectedId ?? accountId)) ?? meMember
  const isMe = !selectedId || selectedId === accountId
  const walletName = isMe ? 'Your Wallet' : `${walletMember?.persona?.name ?? 'Member'}'s Wallet`
  const parentBalance = (walletMember?.cachedBalance ?? 0) / 100

  const selectedKid = kids.find((k) => k.accountId === selectedId)
  const profile: KidProfile | null = selectedKid
    ? {
        id: selectedKid.accountId,
        name: selectedKid.persona?.name ?? 'Kid',
        avatar: selectedKid.persona?.avatar,
        color: selectedKid.persona?.color,
        balanceCents: selectedKid.cachedBalance ?? 0,
        eventsToday: selectedKid.todayEventCount ?? 0,
      }
    : null

  const onSettings = () =>
    Alert.alert('Settings', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/(auth)/welcome') } },
    ])

  const toggleSelect = (id: string) => setSelectedId((cur) => (cur === id ? null : id))

  return (
    <View style={[s.root, { paddingTop: insets.top + tokens.spacing[2] }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_TOTAL_HEIGHT + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.hello}>Hi 👋</Text>
            <Text style={s.name}>{parentName}</Text>
          </View>
          <Pressable style={s.iconBtn} onPress={() => {}}>
            <Bell size={20} color={tokens.color.text} weight="duotone" />
          </Pressable>
          <Pressable style={s.iconBtn} onPress={onSettings}>
            <Gear size={20} color={tokens.color.text} weight="duotone" />
          </Pressable>
        </View>

        {/* Kid spotlight */}
        <KidSpotlight
          kids={spotlightKids}
          selectedId={selectedId}
          onSelect={toggleSelect}
          onAddKid={() => router.push('/(app)/add-kid')}
        />

        {/* Selected kid profile OR parent wallet */}
        {profile ? (
          <KidProfileSheet
            kid={profile}
            visible={!!profile}
            onOpenCard={() => router.push({ pathname: '/(app)/kid-detail', params: { id: profile.id } })}
            onSpending={() => router.push({ pathname: '/(app)/kid-detail', params: { id: profile.id } })}
            onSaving={() => router.push('/(app)/goals')}
            onChores={() => router.push('/(app)/parent-chores')}
            onTransactions={() => router.push('/(app)/transactions')}
          />
        ) : (
          <FadeIn>
            {/* Parent's own hero card */}
            <PayCard
              name={isMe ? (parentName === 'You' ? 'Parent' : parentName) : (walletMember?.persona?.name ?? 'Member')}
              last4={(walletMember?.accountId ?? '').replace(/\D/g, '').slice(-4) || '0001'}
              balance={parentBalance}
              colors={heroColors(walletMember?.persona?.color ?? tokens.color.primary)}
              brand="BRAINPAL"
              tier={isMe ? 'Parent' : 'Co-parent'}
              onPress={() => router.push('/(app)/topup')}
            />

            {/* Add money + autofunding */}
            <View style={s.walletCard}>
              <Pressable style={s.addBtnFull} onPress={() => router.push('/(app)/topup')}>
                <Plus size={18} color="#fff" weight="bold" />
                <Text style={s.addBtnText}>Add money</Text>
              </Pressable>

              <View style={s.divider} />

              <Pressable style={s.autofundRow} onPress={() => router.push('/(app)/topup')}>
                <View style={{ flex: 1 }}>
                  <Text style={s.autofundTitle}>Set up autofunding</Text>
                  <Text style={s.autofundSub}>Always have money ready to send to your kids.</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </Pressable>
            </View>

            {kids.length === 0 && (
              <Pressable style={s.addFirstKid} onPress={() => router.push('/(app)/add-kid')}>
                <Text style={s.addFirstKidText}>+  Add your first kid</Text>
              </Pressable>
            )}

            {kids.length > 0 && (
              <Text style={s.hint}>Tap a kid above to see their profile</Text>
            )}
          </FadeIn>
        )}

        {pending.length > 0 && (
          <FadeIn delay={80}>
            <Text style={s.section}>PENDING INVITES</Text>
            {pending.map((p) => (
              <View key={p.id} style={s.pendingRow}>
                <Text style={s.pendingEmoji}>⏳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pendingName}>{p.name ?? 'Kid'}</Text>
                  <Text style={s.pendingSub}>Waiting for {p.phone} to accept</Text>
                </View>
              </View>
            ))}
          </FadeIn>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], marginBottom: tokens.spacing[2] },
  hello: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  name: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#103A33', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },

  walletCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    padding: tokens.spacing[5],
    shadowColor: '#103A33', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5,
  },
  addBtnFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.spacing[4],
    borderRadius: tokens.radius.pill,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: tokens.fontSize.md },

  divider: { height: 1, backgroundColor: tokens.color.surface2, marginVertical: tokens.spacing[4] },

  autofundRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3] },
  autofundTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  autofundSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: 4, lineHeight: 18 },
  chevron: { color: tokens.color.textMuted, fontSize: 26, fontWeight: '300' },

  addFirstKid: {
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4], alignItems: 'center', marginTop: tokens.spacing[4],
  },
  addFirstKidText: { color: tokens.color.primary, fontWeight: '800', fontSize: tokens.fontSize.md },

  hint: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, textAlign: 'center', marginTop: tokens.spacing[5], fontStyle: 'italic' },

  section: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3] },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4], marginBottom: tokens.spacing[2],
    shadowColor: '#103A33', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  pendingEmoji: { fontSize: 22 },
  pendingName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  pendingSub: { color: tokens.color.textMuted, fontSize: 13, marginTop: 2 },
})
