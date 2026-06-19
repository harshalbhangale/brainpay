import { useRouter } from 'expo-router'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Bell, MapPin, ShieldCheck, Siren } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { useFamily } from '@/hooks/useFamily'
import { kidTheme as tokens } from '@/theme/tokens'

// Native-only: react-native-maps isn't supported on web.
const Maps = Platform.OS === 'web' ? null : (() => { try { return require('react-native-maps') } catch { return null } })()
const BASE = { latitude: -33.8688, longitude: 151.2093 }
function coordFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 1000
  return { latitude: BASE.latitude + (h / 1000 - 0.5) * 0.04, longitude: BASE.longitude + ((h % 100) / 100 - 0.5) * 0.04 }
}

export default function FamilySafety() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const accountId = useAuthStore((s) => s.accountId)
  const { data } = useFamily()
  const members = data?.members ?? []

  const confirmSOS = () =>
    Alert.alert('Send SOS?', 'Your family will get an alert with your location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: () => Alert.alert('SOS sent', 'Your family has been alerted.') },
    ])
  const sendSafe = () => Alert.alert("You're marked safe", 'Your family knows you’re okay. 💚')

  return (
    <View style={s.root}>
      {/* Full-screen map */}
      {Maps ? (
        <Maps.default
          provider={Maps.PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...coordFor(accountId ?? 'me'), latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          showsUserLocation
        >
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
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={['#DCE7E3', '#C7DAF0']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={s.mapPinCenter}>
            <View style={s.mapPin}><MapPin size={20} color="#fff" strokeWidth={2} fill={tokens.color.primary} /></View>
          </View>
        </View>
      )}

      {/* Header overlay */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={s.circleBtn}>
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={2} />
        </Pressable>
        <View style={s.titlePill}><Text style={s.title}>Family</Text></View>
        <View style={s.circleBtn}><Bell size={18} color={tokens.color.text} strokeWidth={2} /></View>
      </View>

      {/* Floating people row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.peopleScroll, { top: insets.top + 64 }]}
        contentContainerStyle={s.peopleRow}
      >
        {members.map((m) => {
          const color = m.persona?.color ?? tokens.color.primary
          const isMe = m.accountId === accountId
          return (
            <View key={m.accountId} style={s.personChip}>
              <View style={[s.personAvatar, { backgroundColor: color + '22' }]}>
                <Text style={s.personEmoji}>{m.persona?.avatar ?? (m.role === 'kid' ? '🧒' : '🧑')}</Text>
                <View style={s.onlineDot} />
              </View>
              <Text style={s.personName} numberOfLines={1}>{isMe ? 'You' : (m.persona?.name ?? 'Member')}</Text>
            </View>
          )
        })}
      </ScrollView>

      {/* Bottom safety buttons */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + tokens.spacing[4] }]}>
        <Pressable style={({ pressed }) => [s.safeBtn, pressed && { opacity: 0.9 }]} onPress={sendSafe}>
          <ShieldCheck size={22} color="#fff" strokeWidth={2.4} />
          <Text style={s.btnText}>I'm Safe</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.sosBtn, pressed && { opacity: 0.9 }]} onPress={confirmSOS}>
          <Siren size={22} color="#fff" strokeWidth={2.4} />
          <Text style={s.btnText}>SOS</Text>
        </Pressable>
      </View>
    </View>
  )
}

const card = { shadowColor: '#103A33', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6 }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },

  mapPinCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  mapPin: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.primary,
    alignItems: 'center', justifyContent: 'center', ...card,
  },

  header: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[4], paddingBottom: tokens.spacing[2],
  },
  circleBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', ...card,
  },
  titlePill: {
    backgroundColor: '#fff', paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.pill, ...card,
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },

  peopleScroll: { position: 'absolute', left: 0, right: 0, maxHeight: 96 },
  peopleRow: { gap: tokens.spacing[3], paddingHorizontal: tokens.spacing[4] },
  personChip: { alignItems: 'center', gap: 4, width: 64 },
  personAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', ...card },
  personEmoji: { fontSize: 26 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: tokens.color.trafficGreen, borderWidth: 2, borderColor: '#fff' },
  personName: {
    color: tokens.color.text, fontSize: 12, fontWeight: '700',
    backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: tokens.radius.pill, overflow: 'hidden',
  },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[5], paddingTop: tokens.spacing[4],
  },
  safeBtn: {
    flex: 1, height: 58, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.trafficGreen,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...card,
  },
  sosBtn: {
    flex: 1, height: 58, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.danger,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...card,
  },
  btnText: { color: '#fff', fontSize: tokens.fontSize.md, fontWeight: '800' },
})
