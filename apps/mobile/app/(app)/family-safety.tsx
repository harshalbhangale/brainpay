import { useRouter } from 'expo-router'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  Bell,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Siren,
} from 'lucide-react-native'

// Native-only: react-native-maps isn't supported on web, so guard the require.
const Maps = Platform.OS === 'web' ? null : require('react-native-maps')
const BASE = { latitude: -33.8688, longitude: 151.2093 }
function coordFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 1000
  return { latitude: BASE.latitude + (h / 1000 - 0.5) * 0.04, longitude: BASE.longitude + ((h % 100) / 100 - 0.5) * 0.04 }
}
import { useAuthStore } from '@/stores/auth'
import { useFamily } from '@/hooks/useFamily'
import type { FamilyMember } from '@/stores/family'
import { kidTheme as tokens } from '@/theme/tokens'

export default function FamilySafety() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const accountId = useAuthStore((s) => s.accountId)
  const { data } = useFamily()

  const members = data?.members ?? []
  const me = members.find((m) => m.accountId === accountId)
  const people = members.filter((m) => m.accountId !== accountId)

  const confirmSOS = () =>
    Alert.alert('Send SOS?', 'Your family will get an alert with your location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send SOS',
        style: 'destructive',
        onPress: () => Alert.alert('SOS sent', 'Your family has been alerted.'),
      },
    ])

  const sendSafe = () => Alert.alert("You're marked safe", 'Your family knows you’re okay. 💚')

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={s.iconBtn}>
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.title}>Family</Text>
        <View style={s.iconBtn}>
          <Bell size={18} color={tokens.color.text} strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + tokens.spacing[8] }}
        showsVerticalScrollIndicator={false}
      >
        {/* People */}
        <Text style={s.section}>PEOPLE</Text>
        <View style={s.card}>
          {people.length === 0 ? (
            <Text style={s.emptyText}>No family members yet.</Text>
          ) : (
            people.map((m, i) => (
              <PersonRow key={m.accountId} member={m} last={i === people.length - 1} />
            ))
          )}
        </View>

        {/* Live location */}
        <Text style={s.section}>LIVE LOCATION</Text>
        <View style={s.mapCard}>
          {Maps ? (
            <Maps.default provider={Maps.PROVIDER_GOOGLE} style={StyleSheet.absoluteFill} initialRegion={{ ...coordFor(accountId ?? 'me'), latitudeDelta: 0.06, longitudeDelta: 0.06 }}>
              {members.map((m) => (
                <Maps.Marker
                  key={m.accountId}
                  coordinate={coordFor(m.accountId)}
                  title={m.persona?.name ?? 'Member'}
                  pinColor={m.persona?.color ?? tokens.color.primary}
                />
              ))}
            </Maps.default>
          ) : (
            <>
              <LinearGradient
                colors={[tokens.color.blue + '22', tokens.color.purple + '22']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={s.mapPinWrap}>
                <View style={s.mapPin}>
                  <MapPin size={18} color="#fff" strokeWidth={2} fill={tokens.color.purple} />
                </View>
                <Text style={s.mapLabel}>{me?.persona?.name ?? 'You'} · At School</Text>
              </View>
            </>
          )}
        </View>

        {/* Safety tools */}
        <Text style={s.section}>SAFETY TOOLS</Text>
        <View style={s.safetyRow}>
          <Pressable
            style={({ pressed }) => [s.safeBtn, pressed && { opacity: 0.85 }]}
            onPress={sendSafe}
          >
            <ShieldCheck size={20} color="#fff" strokeWidth={2.2} />
            <Text style={s.safeText}>I'm Safe</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.sosBtn, pressed && { opacity: 0.85 }]}
            onPress={confirmSOS}
          >
            <Siren size={20} color="#fff" strokeWidth={2.2} />
            <Text style={s.safeText}>SOS</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

function PersonRow({ member, last }: { member: FamilyMember; last: boolean }) {
  const color = member.persona?.color ?? tokens.color.purple
  const isParent = member.accountType === 'parent' || member.role !== 'kid'
  return (
    <View style={[s.personRow, !last && s.personDivider]}>
      <View style={[s.personAvatar, { backgroundColor: color + '22' }]}>
        <Text style={s.personEmoji}>{member.persona?.avatar ?? (isParent ? '🧑' : '🧒')}</Text>
        <View style={s.onlineDot} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.personName}>{member.persona?.name ?? 'Member'}</Text>
        <Text style={s.personStatus}>Online</Text>
      </View>
      <View style={s.personActions}>
        <View style={s.personActionBtn}>
          <Phone size={16} color={tokens.color.blue} strokeWidth={2} />
        </View>
        <View style={s.personActionBtn}>
          <MessageCircle size={16} color={tokens.color.purple} strokeWidth={2} />
        </View>
      </View>
    </View>
  )
}

const card = {
  shadowColor: '#3B2E8C',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    ...card,
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '900' },

  section: {
    color: tokens.color.textMuted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.5, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
  },

  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, ...card },
  emptyText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, padding: tokens.spacing[4] },

  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    padding: tokens.spacing[4],
  },
  personDivider: { borderBottomWidth: 1, borderBottomColor: tokens.color.surface2 },
  personAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  personEmoji: { fontSize: 22 },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: tokens.color.trafficGreen,
    borderWidth: 2, borderColor: tokens.color.surface,
  },
  personName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  personStatus: { color: tokens.color.trafficGreen, fontSize: 12, fontWeight: '600', marginTop: 2 },
  personActions: { flexDirection: 'row', gap: tokens.spacing[2] },
  personActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },

  mapCard: {
    height: 160, borderRadius: tokens.radius.lg, overflow: 'hidden',
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    ...card,
  },
  mapPinWrap: { alignItems: 'center', gap: tokens.spacing[2] },
  mapPin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.purple,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  mapLabel: {
    color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700',
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[3], paddingVertical: 5,
    borderRadius: tokens.radius.pill, overflow: 'hidden',
  },

  safetyRow: { flexDirection: 'row', gap: tokens.spacing[3] },
  safeBtn: {
    flex: 1, height: 56, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.trafficGreen,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  sosBtn: {
    flex: 1, height: 56, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.danger,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  safeText: { color: '#fff', fontSize: tokens.fontSize.md, fontWeight: '800' },
})
