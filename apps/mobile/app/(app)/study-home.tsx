import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BookOpen, Flame, Lightning, Plus, Target } from 'phosphor-react-native'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

type Topic = {
  id: string
  title: string
  emoji: string
  cardsDue: number
  totalCards: number
  status: string
  createdAt: string
}

type Stats = {
  streak: number
  longestStreak: number
  cardsDue: number
  topicsActive: number
  cardsMastered: number
}

export default function StudyHome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['study-stats'],
    queryFn: () => api<Stats>('/study/stats'),
    staleTime: 30_000,
  })

  const { data: topicsData, isLoading: topicsLoading } = useQuery({
    queryKey: ['study-topics'],
    queryFn: () => api<{ topics: Topic[] }>('/study/topics'),
    staleTime: 30_000,
  })

  const topics = topicsData?.topics ?? []
  const loading = statsLoading || topicsLoading

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Study</Text>
          <Text style={s.subtitle}>Master your subjects</Text>
        </View>
        <Pressable style={s.addBtn} onPress={() => router.push('/(app)/study-new-topic')}>
          <Plus size={20} color="#fff" weight="bold" />
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={tokens.color.primary} />
        </View>
      ) : (
        <FlatList
          data={topics}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Stats Row */}
              <View style={s.statsRow}>
                <StatCard
                  icon={<Flame size={18} color="#FB923C" weight="fill" />}
                  value={`${stats?.streak ?? 0}`}
                  label="day streak"
                />
                <StatCard
                  icon={<Lightning size={18} color={tokens.color.primary} weight="fill" />}
                  value={`${stats?.cardsDue ?? 0}`}
                  label="cards due"
                />
                <StatCard
                  icon={<Target size={18} color="#A855F7" weight="fill" />}
                  value={`${stats?.cardsMastered ?? 0}`}
                  label="mastered"
                />
              </View>

              {/* Review CTA */}
              {(stats?.cardsDue ?? 0) > 0 && (
                <Pressable
                  style={s.reviewCta}
                  onPress={() => router.push('/(app)/study-review')}
                >
                  <BookOpen size={20} color="#fff" weight="bold" />
                  <Text style={s.reviewCtaText}>Review {stats!.cardsDue} cards now</Text>
                </Pressable>
              )}

              {/* Topics header */}
              <Text style={s.sectionTitle}>Your Topics</Text>
            </>
          }
          renderItem={({ item }) => (
            <Pressable
              style={s.topicCard}
              onPress={() => router.push({ pathname: '/(app)/study-topic', params: { id: item.id } })}
            >
              <Text style={s.topicEmoji}>{item.emoji}</Text>
              <View style={s.topicInfo}>
                <Text style={s.topicTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={s.topicMeta}>
                  {item.totalCards} cards · {item.cardsDue} due
                </Text>
              </View>
              <View style={s.topicProgress}>
                <Text style={s.topicProgressText}>
                  {item.totalCards > 0
                    ? `${Math.round(((item.totalCards - item.cardsDue) / item.totalCards) * 100)}%`
                    : '—'}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <BookOpen size={48} color={tokens.color.textMuted} weight="thin" />
              <Text style={s.emptyTitle}>No topics yet</Text>
              <Text style={s.emptyText}>
                Tap + to create your first study topic{'\n'}and upload some material.
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={s.statCard}>
      {icon}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: { fontSize: 28, fontWeight: '800', color: tokens.color.text },
  subtitle: { fontSize: 14, color: tokens.color.textMuted, marginTop: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: { paddingHorizontal: 24, paddingBottom: 100 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: tokens.color.text },
  statLabel: { fontSize: 11, color: tokens.color.textMuted, fontWeight: '500' },

  // Review CTA
  reviewCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: tokens.color.primary,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  reviewCtaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Section
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Topic cards
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  topicEmoji: { fontSize: 32 },
  topicInfo: { flex: 1 },
  topicTitle: { fontSize: 16, fontWeight: '700', color: tokens.color.text },
  topicMeta: { fontSize: 13, color: tokens.color.textMuted, marginTop: 2 },
  topicProgress: {
    backgroundColor: tokens.color.surface2,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topicProgressText: { fontSize: 13, fontWeight: '700', color: tokens.color.primary },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: tokens.color.text },
  emptyText: { fontSize: 14, color: tokens.color.textMuted, textAlign: 'center', lineHeight: 20 },
})
