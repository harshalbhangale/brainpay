import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader,
  ShieldCheck,
  ShieldX,
} from 'lucide-react-native'
import { useChores, type Chore } from '@/hooks/useChores'
import { tokens } from '@/theme/tokens'

export default function KidChores() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useChores()

  const allChores = data?.chores ?? []
  const todo = allChores.filter((c) => c.status === 'pending')
  const inReview = allChores.filter((c) =>
    ['submitted', 'ai_approved', 'ai_uncertain', 'ai_rejected'].includes(c.status),
  )
  const done = allChores.filter((c) => c.status === 'paid')

  if (isLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.headerTitle}>My Chores</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tokens.spacing[8] }}
        showsVerticalScrollIndicator={false}
      >
        {/* To do */}
        {todo.length > 0 && (
          <>
            <SectionLabel text="TO DO" color={tokens.color.orange} />
            {todo.map((c) => (
              <Pressable
                key={c.id}
                style={s.todoCard}
                onPress={() => router.push({ pathname: '/(app)/kid/chore-verify', params: { id: c.id } })}
              >
                <View style={s.todoLeft}>
                  <View style={s.todoIconWrap}>
                    <Clock size={18} color={tokens.color.orange} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreHint}>Tap to verify with camera</Text>
                  </View>
                </View>
                <View style={s.rewardTag}>
                  <Text style={s.rewardTagText}>+{c.rewardBrains}</Text>
                </View>
                <ChevronRight size={tokens.iconSize.sm} color={tokens.color.textMuted} strokeWidth={1.5} />
              </Pressable>
            ))}
          </>
        )}

        {/* In review */}
        {inReview.length > 0 && (
          <>
            <SectionLabel text="IN REVIEW" color="#F59E0B" />
            {inReview.map((c) => <ReviewRow key={c.id} chore={c} />)}
          </>
        )}

        {/* Done */}
        {done.length > 0 && (
          <>
            <SectionLabel text="PAID" color={tokens.color.accent} />
            {done.map((c) => (
              <View key={c.id} style={s.doneCard}>
                <CheckCircle2 size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
                <Text style={[s.choreTitle, { flex: 1 }]}>{c.title}</Text>
                <Text style={s.doneReward}>+{c.rewardBrains}</Text>
              </View>
            ))}
          </>
        )}

        {allChores.length === 0 && (
          <View style={s.empty}>
            <CheckCircle2 size={tokens.iconSize.hero} color={tokens.color.surface2} strokeWidth={1.0} />
            <Text style={s.emptyTitle}>All clear</Text>
            <Text style={s.emptySub}>Your parent hasn't added any chores yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function SectionLabel({ text, color }: { text: string; color: string }) {
  return (
    <View style={sl.row}>
      <View style={[sl.dot, { backgroundColor: color }]} />
      <Text style={sl.text}>{text}</Text>
    </View>
  )
}
const sl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3], paddingHorizontal: tokens.spacing[5] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700', letterSpacing: 1.2 },
})

function ReviewRow({ chore }: { chore: Chore }) {
  let Icon = <Loader size={tokens.iconSize.md} color={tokens.color.textMuted as string} strokeWidth={1.5} />
  let statusText = 'Waiting for parent'
  let statusColor: string = tokens.color.textMuted

  if (chore.status === 'ai_approved') {
    Icon = <ShieldCheck size={tokens.iconSize.md} color={tokens.color.accent as string} strokeWidth={1.5} />
    statusText = 'AI verified — waiting for parent'
    statusColor = tokens.color.accent as string
  } else if (chore.status === 'ai_rejected') {
    Icon = <ShieldX size={tokens.iconSize.md} color={tokens.color.danger as string} strokeWidth={1.5} />
    statusText = chore.aiReason ?? 'AI rejected'
    statusColor = tokens.color.danger as string
  } else if (chore.status === 'ai_uncertain') {
    Icon = <Loader size={tokens.iconSize.md} color={tokens.color.orange as string} strokeWidth={1.5} />
    statusText = 'Sent to parent for review'
    statusColor = tokens.color.orange as string
  }

  return (
    <View style={s.reviewCard}>
      {Icon}
      <View style={{ flex: 1 }}>
        <Text style={s.choreTitle}>{chore.title}</Text>
        <Text style={[s.choreHint, { color: statusColor }]} numberOfLines={1}>{statusText}</Text>
      </View>
      <Text style={s.reviewReward}>+{chore.rewardBrains}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3],
  },
  headerTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },

  todoCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
    borderWidth: 1,
    borderColor: tokens.color.orange + '33',
  },
  todoLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3] },
  todoIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: tokens.color.orange + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  choreTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choreHint: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  rewardTag: {
    backgroundColor: tokens.color.accent + '20',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  rewardTagText: { color: tokens.color.accent, fontSize: tokens.fontSize.xs, fontWeight: '800' },

  reviewCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
  },
  reviewReward: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  doneCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[3],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
    opacity: 0.7,
  },
  doneReward: { color: tokens.color.accent, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  empty: {
    alignItems: 'center', paddingVertical: tokens.spacing[8],
    gap: tokens.spacing[3], paddingHorizontal: tokens.spacing[5],
  },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, textAlign: 'center' },
})
