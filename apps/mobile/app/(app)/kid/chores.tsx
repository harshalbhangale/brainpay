import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Camera, Clock, CircleCheck, ShieldCheck, Upload } from 'lucide-react-native'
import { useChores, type Chore } from '@/hooks/useChores'
import { tokens } from '@/theme/tokens'

/**
 * Kid's chore list — shows pending / submitted / paid chores.
 * Tap a pending chore → opens camera verify screen.
 */
export default function KidChores() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading, refetch } = useChores()

  const allChores = data?.chores ?? []
  const pending = allChores.filter((c) => c.status === 'pending')
  const submitted = allChores.filter((c) =>
    ['submitted', 'ai_approved', 'ai_uncertain', 'ai_rejected'].includes(c.status),
  )
  const paid = allChores.filter((c) => c.status === 'paid')

  if (isLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.title}>Chores</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        {pending.length > 0 && (
          <>
            <Text style={s.section}>TO DO</Text>
            {pending.map((c) => (
              <Pressable
                key={c.id}
                style={s.choreCard}
                onPress={() => router.push({ pathname: '/(app)/kid/chore-verify', params: { id: c.id } })}
              >
                <Clock size={tokens.iconSize.lg} color={tokens.color.orange} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={s.choreTitle}>{c.title}</Text>
                  <Text style={s.choreSub}>Tap to verify with camera</Text>
                </View>
                <View style={s.rewardBadge}>
                  <Text style={s.rewardText}>+{c.rewardBrains} 🧠</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {submitted.length > 0 && (
          <>
            <Text style={s.section}>WAITING</Text>
            {submitted.map((c) => <SubmittedRow key={c.id} chore={c} />)}
          </>
        )}

        {paid.length > 0 && (
          <>
            <Text style={s.section}>PAID</Text>
            {paid.map((c) => (
              <View key={c.id} style={s.choreCard}>
                <CircleCheck size={tokens.iconSize.lg} color={tokens.color.accent} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={s.choreTitle}>{c.title}</Text>
                  <Text style={s.choreSub}>Paid</Text>
                </View>
                <Text style={[s.rewardText, { color: tokens.color.accent }]}>+{c.rewardBrains} 🧠</Text>
              </View>
            ))}
          </>
        )}

        {allChores.length === 0 && (
          <View style={s.empty}>
            <Clock size={tokens.iconSize.hero} color={tokens.color.textMuted} strokeWidth={1.0} />
            <Text style={s.emptyTitle}>No chores yet</Text>
            <Text style={s.emptySub}>Your parent will add some soon.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function SubmittedRow({ chore }: { chore: Chore }) {
  let icon = <Upload size={tokens.iconSize.lg} color={tokens.color.orange} strokeWidth={1.5} />
  let label = 'Waiting for parent'
  if (chore.status === 'ai_approved') {
    icon = <ShieldCheck size={tokens.iconSize.lg} color={tokens.color.accent} strokeWidth={1.5} />
    label = `AI approved — ${chore.aiReason ?? ''}`
  } else if (chore.status === 'ai_uncertain') {
    icon = <Upload size={tokens.iconSize.lg} color={tokens.color.orange} strokeWidth={1.5} />
    label = 'Sent to parent'
  } else if (chore.status === 'ai_rejected') {
    icon = <Upload size={tokens.iconSize.lg} color={tokens.color.danger} strokeWidth={1.5} />
    label = chore.aiReason ?? 'AI rejected'
  }

  return (
    <View style={s.choreCard}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={s.choreTitle}>{chore.title}</Text>
        <Text style={s.choreSub} numberOfLines={2}>{label}</Text>
      </View>
      <Text style={s.rewardText}>+{chore.rewardBrains} 🧠</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },

  section: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
  },

  choreCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[2],
  },
  choreTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choreSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },

  rewardBadge: {
    backgroundColor: tokens.color.accent + '22',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
    borderRadius: tokens.radius.pill,
  },
  rewardText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: tokens.spacing[8], gap: tokens.spacing[3] },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },
})
