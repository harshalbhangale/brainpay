import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ChevronRight, Receipt, ShieldCheck, Snowflake } from 'lucide-react-native'
import { useFamily } from '@/hooks/useFamily'
import { PayCard } from '@/components/dashboard'
import { kidTheme as tokens, shadow } from '@/theme/tokens'

export default function CardDetail() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { data } = useFamily()
  const [frozen, setFrozen] = useState(false)

  const member = data?.members.find((m) => m.accountId === id)
  const name = member?.persona?.name ?? 'Card'
  const balance = (member?.cachedBalance ?? 0) / 100
  const last4 = (id ?? '').replace(/\D/g, '').slice(-4) || '2734'

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.title}>{name}'s card</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: tokens.spacing[5], paddingBottom: insets.bottom + tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        <PayCard name={name} last4={last4} balance={balance} colors={frozen ? ['#5B6B66', '#7C8B86'] : ['#0E7C66', '#16A07F']} />

        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.icon, { backgroundColor: tokens.color.blue + '1F' }]}><Snowflake size={16} color={tokens.color.blue} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Freeze card</Text>
              <Text style={s.rowSub}>{frozen ? 'Card is frozen' : 'Card is active'}</Text>
            </View>
            <Switch value={frozen} onValueChange={setFrozen} trackColor={{ true: tokens.color.primary, false: tokens.color.surface2 }} />
          </View>
          <View style={[s.row, s.rowBorder]}>
            <View style={[s.icon, { backgroundColor: tokens.color.accent + '1F' }]}><ShieldCheck size={16} color={tokens.color.accent} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Spending limit</Text>
              <Text style={s.rowSub}>$50.00 / week</Text>
            </View>
            <ChevronRight size={18} color={tokens.color.textMuted} strokeWidth={2} />
          </View>
        </View>

        <Pressable style={s.histBtn} onPress={() => router.push('/(app)/transactions')}>
          <View style={[s.icon, { backgroundColor: tokens.color.primary + '1F' }]}><Receipt size={16} color={tokens.color.primary} strokeWidth={2.2} /></View>
          <Text style={s.histText}>View transaction history</Text>
          <ChevronRight size={18} color={tokens.color.textMuted} strokeWidth={2} />
        </Pressable>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3] },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, marginTop: tokens.spacing[4], ...shadow.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], padding: tokens.spacing[4] },
  rowBorder: { borderTopWidth: 1, borderTopColor: tokens.color.surface2 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  rowSub: { color: tokens.color.textMuted, fontSize: 13, marginTop: 2 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing[4], marginTop: tokens.spacing[3], ...shadow.md },
  histText: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
})
