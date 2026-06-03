import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader,
  ShieldCheck,
  ShieldX,
  Star,
} from 'lucide-react-native'
import { useChores, type Chore } from '@/hooks/useChores'
import { kidTheme as tokens } from '@/theme/tokens'

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
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color={tokens.color.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={s.headerTitle}>My Chores</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tokens.spacing[8] }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary bar */}
        {allChores.length > 0 && (
          <View style={s.summaryBar}>
            <SummaryPill label="To Do" count={todo.length} color={tokens.color.orange} />
            <SummaryPill label="In Review" count={inReview.length} color="#F59E0B" />
            <SummaryPill label="Paid" count={done.length} color={tokens.color.accent} />
          </View>
        )}

        {/* To do */}
        {todo.length > 0 && (
          <>
            <SectionLabel text="TO DO" color={tokens.color.orange} />
            {todo.map((c) => (
              <Pressable
                key={c.id}
                style={({ pressed }) => [s.todoCard, pressed && { opacity: 0.85 }]}
                onPress={() => router.push({ pathname: '/(app)/chore-verify', params: { id: c.id } })}
              >
                <LinearGradient
                  colors={[tokens.color.orange + '12', 'transparent']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
                <View style={s.todoIconWrap}>
                  <Clock size={18} color={tokens.color.orange} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.choreTitle}>{c.title}</Text>
                  <Text style={s.choreHint}>Tap to verify with camera</Text>
                </View>
                <View style={s.rewardTag}>
                  <Star size={10} color={tokens.color.coin} strokeWidth={2.5} fill={tokens.color.coin} />
                  <Text style={s.rewardTagText}>+{c.rewardBrains} pts</Text>
                </View>
                <ChevronRight size={16} color={tokens.color.textMuted} strokeWidth={1.5} />
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
            <SectionLabel text="PAID OUT" color={tokens.color.accent} />
            {done.map((c) => (
              <View key={c.id} style={s.doneCard}>
                <View style={s.doneIconWrap}>
                  <CheckCircle2 size={16} color={tokens.color.accent} strokeWidth={2} />
                </View>
                <Text style={[s.choreTitle, { flex: 1, opacity: 0.7 }]}>{c.title}</Text>
                <View style={[s.rewardTag, { backgroundColor: tokens.color.accent + '15' }]}>
                  <Star size={10} color={tokens.color.accent} strokeWidth={2.5} fill={tokens.color.accent} />
                  <Text style={[s.rewardTagText, { color: tokens.color.accent }]}>+{c.rewardBrains} pts</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {allChores.length === 0 && (
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <CheckCircle2 size={40} color={tokens.color.textMuted} strokeWidth={1.2} />
            </View>
            <Text style={s.emptyTitle}>All clear!</Text>
            <Text style={s.emptySub}>Your parent hasn't added any chores yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function SummaryPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={[sp.pill, { backgroundColor: color + '15', borderColor: color + '33' }]}>
      <Text style={[sp.count, { color }]}>{count}</Text>
      <Text style={sp.label}>{label}</Text>
    </View>
  )
}
const sp = StyleSheet.create({
  pill: {
    flex: 1, alignItems: 'center', paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.md, borderWidth: 1,
  },
  count: { fontSize: tokens.fontSize.xl, fontWeight: '900' },
  label: { color: tokens.color.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
})

function SectionLabel({ text, color }: { text: string; color: string }) {
  return (
    <View style={sl.row}>
      <View style={[sl.dot, { backgroundColor: color }]} />
      <Text style={sl.text}>{text}</Text>
    </View>
  )
}
const sl = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[5],
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
})

function ReviewRow({ chore }: { chore: Chore }) {
  let Icon = <Loader size={18} color={tokens.color.textMuted as string} strokeWidth={1.5} />
  let statusText = 'Waiting for parent'
  let statusColor: string = tokens.color.textMuted
  let borderColor = tokens.color.surface2

  if (chore.status === 'ai_approved') {
    Icon = <ShieldCheck size={18} color={tokens.color.accent as string} strokeWidth={1.8} />
    statusText = 'AI verified — waiting for parent'
    statusColor = tokens.color.accent as string
    borderColor = tokens.color.accent + '33'
  } else if (chore.status === 'ai_rejected') {
    Icon = <ShieldX size={18} color={tokens.color.danger as string} strokeWidth={1.8} />
    statusText = chore.aiReason ?? 'AI rejected'
    statusColor = tokens.color.danger as string
    borderColor = tokens.color.danger + '33'
  } else if (chore.status === 'ai_uncertain') {
    Icon = <Loader size={18} color={tokens.color.orange as string} strokeWidth={1.5} />
    statusText = 'Sent to parent for review'
    statusColor = tokens.color.orange as string
    borderColor = tokens.color.orange + '33'
  }

  return (
    <View style={[s.reviewCard, { borderColor }]}>
      {Icon}
      <View style={{ flex: 1 }}>
        <Text style={s.choreTitle}>{chore.title}</Text>
        <Text style={[s.choreHint, { color: statusColor }]} numberOfLines={1}>{statusText}</Text>
      </View>
      <View style={[s.rewardTag, { backgroundColor: tokens.color.coin + '15' }]}>
        <Star size={10} color={tokens.color.coin} strokeWidth={2.5} fill={tokens.color.coin} />
        <Text style={[s.rewardTagText, { color: tokens.color.coin }]}>+{chore.rewardBrains}</Text>
      </View>
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
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },

  summaryBar: {
    flexDirection: 'row', gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
  },

  todoCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
    borderWidth: 1,
    borderColor: tokens.color.orange + '33',
    overflow: 'hidden',
  },
  todoIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.color.orange + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  choreTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choreHint: { color: tokens.color.textMuted, fontSize: 12, marginTop: 2 },
  rewardTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: tokens.color.coin + '15',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
  },
  rewardTagText: { color: tokens.color.coin, fontSize: 12, fontWeight: '800' },

  reviewCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
    borderWidth: 1,
  },

  doneCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[3],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
    opacity: 0.75,
  },
  doneIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: tokens.color.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },

  empty: {
    alignItems: 'center', paddingVertical: tokens.spacing[8],
    gap: tokens.spacing[3], paddingHorizontal: tokens.spacing[5],
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[2],
  },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, textAlign: 'center' },
})
