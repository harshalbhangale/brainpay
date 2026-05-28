import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Bot,
  CircleArrowUp,
  ClipboardList,
  Home,
  ScanLine,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react-native'
import { useFamily } from '@/hooks/useFamily'
import { useFamilyStore, type FamilyMember } from '@/stores/family'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Parent home — three states:
 *   1. Loading                                → spinner
 *   2. No family yet                          → empty state with "Set up family" CTA
 *   3. Family exists (kids may be 0 or more)  → family header + kid cards + actions
 */

const ACCENT_FALLBACK = ['#A855F7', '#3DDC84', '#3B82F6', '#FB923C', '#EC4899', '#FACC15']

export default function ParentHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useFamily()
  const setFamily = useFamilyStore((s) => s.setFamily)
  const setMembers = useFamilyStore((s) => s.setMembers)
  const signOut = useAuthStore((s) => s.signOut)
  const me = useAuthStore((s) => s.accountId)

  useEffect(() => {
    if (data?.family) setFamily(data.family)
    if (data?.members) setMembers(data.members)
  }, [data, setFamily, setMembers])

  if (isLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  // ─── Empty state: no family ──────────────────────────────────────
  if (!data?.family) {
    return (
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[5], paddingBottom: insets.bottom }]}>
        <Empty
          onSetup={() => router.push('/(auth)/family-create')}
          onSignOut={async () => {
            await signOut()
            router.replace('/(auth)/welcome')
          }}
        />
      </View>
    )
  }

  const family = data.family
  const kids = data.members.filter((m) => m.role === 'kid')
  const parents = data.members.filter((m) => m.role !== 'kid')
  const myMember = data.members.find((m) => m.accountId === me)
  const myName = myMember?.persona?.name ?? 'You'
  const myAvatar = myMember?.persona?.avatar ?? '👤'

  const onProfilePress = () => {
    Alert.alert(
      myName,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut()
            router.replace('/(auth)/welcome')
          },
        },
      ],
      { cancelable: true },
    )
  }

  // Total topped-up this month — derive from member balances for now.
  const totalBalance = kids.reduce((sum, k) => sum + (k.cachedBalance ?? 0), 0)

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        {/* Top bar — quick scan + profile */}
        <View style={s.topBar}>
          <Pressable style={s.scanBtn} onPress={() => router.push('/(app)/camera')}>
            <ScanLine size={tokens.iconSize.lg} color={tokens.color.text} strokeWidth={1.5} />
            <Text style={s.scanText}>scan</Text>
          </Pressable>
          <View style={s.meBubble}>
            <Pressable hitSlop={8} onPress={onProfilePress}>
              <Text style={s.meEmoji}>{myAvatar}</Text>
            </Pressable>
          </View>
        </View>

        {/* Family hero */}
        <View style={s.hero}>
          <Text style={s.heroAvatar}>{family.avatar ?? '🏡'}</Text>
          <Text style={s.heroName}>{family.name}</Text>
          <Text style={s.heroBalance}>${(totalBalance / 100).toFixed(2)}</Text>
          <Text style={s.heroSub}>{totalBalance} pts across {kids.length} kid{kids.length === 1 ? '' : 's'}</Text>
        </View>

        {/* Action row */}
        <View style={s.actionRow}>
          <ActionBtn icon={CircleArrowUp} label="Top up"   color="#A855F7" onPress={() => router.push('/(app)/parent/topup')} />
          <ActionBtn icon={ClipboardList} label="Chores"   color="#3DDC84" onPress={() => router.push('/(app)/parent/chores')} />
          <ActionBtn icon={Sparkles}      label="PAL Chat" color="#3B82F6" onPress={() => router.push('/(app)/parent/chat')} />
          <ActionBtn icon={UserPlus}      label="Invite"   color="#FB923C" onPress={() => router.push('/(app)/parent/add-kid')} />
        </View>

        {/* Kids */}
        <Text style={s.section}>YOUR KIDS</Text>
        {kids.length === 0 ? (
          <Pressable
            style={s.addFirstKid}
            onPress={() => router.push('/(app)/parent/add-kid')}
          >
            <View style={s.addFirstKidIcon}>
              <Users size={tokens.iconSize.lg} color={tokens.color.accent} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.addFirstKidTitle}>Add your first kid</Text>
              <Text style={s.addFirstKidSub}>Enter their phone number to get started.</Text>
            </View>
            <UserPlus size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
          </Pressable>
        ) : (
          <>
            {kids.map((kid, i) => (
              <KidCard
                key={kid.accountId}
                kid={kid}
                accent={kid.persona?.color ?? ACCENT_FALLBACK[i % ACCENT_FALLBACK.length]}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/parent/kid-detail',
                    params: { id: kid.accountId },
                  })
                }
              />
            ))}
            <Pressable
              style={s.addAnother}
              onPress={() => router.push('/(app)/parent/add-kid')}
            >
              <Text style={s.addAnotherText}>＋  Add another kid</Text>
            </Pressable>
          </>
        )}

        {/* PAL daily */}
        <Text style={s.section}>PAL'S DAILY</Text>
        <View style={s.palCard}>
          <Bot size={tokens.iconSize.xl} color={tokens.color.accent} strokeWidth={1.5} />
          <Text style={s.palLine}>
            {kids.length === 0
              ? "Add a kid and I'll start roasting their snacks. Promise."
              : kids.length === 1
                ? `Just ${kids[0].persona?.name ?? 'one kid'} for now. Easier to keep tabs.`
                : `You've got ${kids.length} kids saving. Don't ruin it.`}
          </Text>
        </View>

        {parents.length > 1 && (
          <>
            <Text style={s.section}>CO-PARENTS</Text>
            {parents
              .filter((p) => p.accountId !== me)
              .map((p) => (
                <View key={p.accountId} style={s.coparent}>
                  <Text style={s.coparentEmoji}>{p.persona?.avatar ?? '👤'}</Text>
                  <Text style={s.coparentName}>{p.persona?.name ?? 'Co-parent'}</Text>
                  <Text style={s.coparentRole}>{p.role.replace('_', ' ')}</Text>
                </View>
              ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────
function Empty({ onSetup, onSignOut }: { onSetup: () => void; onSignOut: () => void }) {
  return (
    <View style={s.empty}>
      <Home size={tokens.iconSize.hero} color={tokens.color.textMuted} strokeWidth={1.0} />
      <Text style={s.emptyTitle}>Welcome to BrainPay</Text>
      <Text style={s.emptySub}>Set up your family to get started.</Text>
      <Pressable style={s.emptyCta} onPress={onSetup}>
        <Text style={s.emptyCtaText}>Set up family</Text>
      </Pressable>
      <Pressable hitSlop={12} onPress={onSignOut} style={s.emptySignOut}>
        <Text style={s.emptySignOutText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────
type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

function ActionBtn({ icon: Icon, label, color, onPress }: {
  icon: LucideIcon; label: string; color: string; onPress: () => void
}) {
  return (
    <Pressable style={s.actionBtn} onPress={onPress}>
      <View style={[s.actionDot, { backgroundColor: color + '22', borderWidth: 1, borderColor: color + '55' }]}>
        <Icon size={tokens.iconSize.lg} color={color} strokeWidth={1.5} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  )
}

function KidCard({ kid, accent, onPress }: { kid: FamilyMember; accent: string; onPress: () => void }) {
  const name = kid.persona?.name ?? 'Kid'
  const avatar = kid.persona?.avatar ?? '🧒'
  const age = kid.persona?.age
  const events = kid.todayEventCount ?? 0
  return (
    <Pressable style={[s.kidCard, { borderLeftColor: accent }]} onPress={onPress}>
      <View style={[s.kidAvatar, { backgroundColor: accent + '33' }]}>
        <Text style={s.kidAvatarEmoji}>{avatar}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.kidName}>{name}</Text>
        <Text style={s.kidMeta}>
          {age ? `${age}yo` : ''}{age ? ' · ' : ''}{events} event{events === 1 ? '' : 's'} today
        </Text>
      </View>
      <View style={s.kidBalance}>
        <Text style={[s.kidBalanceNum, { color: accent }]}>{kid.cachedBalance}</Text>
        <Text style={s.kidBalanceUnit}>🧠</Text>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  // empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[3] },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  emptySub: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md, textAlign: 'center',
    marginBottom: tokens.spacing[5],
  },
  emptyCta: {
    height: 56, paddingHorizontal: tokens.spacing[6], borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent, alignItems: 'center', justifyContent: 'center',
  },
  emptyCtaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  emptySignOut: { marginTop: tokens.spacing[4], paddingVertical: tokens.spacing[2] },
  emptySignOutText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  // top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: tokens.spacing[3],
  },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill,
  },
  scanText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  meBubble: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  meEmoji: { fontSize: 22 },

  // hero
  hero: { alignItems: 'center', paddingVertical: tokens.spacing[5] },
  heroAvatar: { fontSize: 56 },
  heroName: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700', marginTop: tokens.spacing[2] },
  heroBalance: {
    color: tokens.color.text, fontSize: 56, fontWeight: '900', marginTop: tokens.spacing[3],
    letterSpacing: -2,
  },
  heroSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: tokens.spacing[1] },

  // action row
  actionRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: tokens.spacing[5], paddingHorizontal: tokens.spacing[2],
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionDot: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { color: tokens.color.text, fontSize: tokens.fontSize.xs, fontWeight: '700' },

  section: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
  },

  // kid cards
  kidCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg, borderLeftWidth: 4, marginBottom: tokens.spacing[2],
  },
  kidAvatar: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
  },
  kidAvatarEmoji: { fontSize: 24 },
  kidName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  kidMeta: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  kidBalance: { alignItems: 'flex-end' },
  kidBalanceNum: { fontSize: tokens.fontSize.lg, fontWeight: '900' },
  kidBalanceUnit: { fontSize: tokens.fontSize.xs, color: tokens.color.textMuted },

  // add first / another kid
  addFirstKid: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg, borderWidth: 1.5, borderColor: tokens.color.accent + '44',
  },
  addFirstKidIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tokens.color.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  addFirstKidTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  addFirstKidSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  addAnother: {
    paddingVertical: tokens.spacing[3], alignItems: 'center',
    marginTop: tokens.spacing[2],
  },
  addAnotherText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  // PAL card
  palCard: {
    flexDirection: 'row', gap: tokens.spacing[3], alignItems: 'flex-start',
    backgroundColor: tokens.color.surface, padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
  },
  palLine: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic', lineHeight: 20 },

  // co-parents
  coparent: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[3],
    borderRadius: tokens.radius.md, marginBottom: tokens.spacing[2],
  },
  coparentEmoji: { fontSize: 24 },
  coparentName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  coparentRole: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs },
})
