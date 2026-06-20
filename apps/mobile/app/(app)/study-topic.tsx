import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, BookOpen, Brain, File, Lightning, Microphone, Plus, Target } from 'phosphor-react-native'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

type Topic = { id: string; title: string; emoji: string; totalCards: number; cardsDue: number }
type Doc = { id: string; title: string; fileType: string; processingStatus: string; chunkCount: number; createdAt: string }

export default function StudyTopic() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { data, isLoading } = useQuery({
    queryKey: ['study-topic', id],
    queryFn: () => api<{ topic: Topic; documents: Doc[]; cardsDue: number }>(`/study/topics/${id}`),
    enabled: !!id,
  })

  if (isLoading) return <View style={[s.root, s.center, { paddingTop: insets.top }]}><ActivityIndicator color={tokens.color.primary} /></View>

  const topic = data?.topic
  const docs = data?.documents ?? []
  const cardsDue = data?.cardsDue ?? 0

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={tokens.color.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{topic?.emoji} {topic?.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{topic?.totalCards ?? 0}</Text>
            <Text style={s.statLabel}>Total Cards</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statValue, cardsDue > 0 && { color: '#F59E0B' }]}>{cardsDue}</Text>
            <Text style={s.statLabel}>Due Now</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{docs.length}</Text>
            <Text style={s.statLabel}>Documents</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={s.actions}>
          {cardsDue > 0 && (
            <Pressable style={[s.actionBtn, s.actionPrimary]} onPress={() => router.push('/(app)/study-review')}>
              <BookOpen size={20} color="#fff" weight="bold" />
              <Text style={s.actionPrimaryText}>Review {cardsDue} Cards</Text>
            </Pressable>
          )}
          <View style={s.actionRow}>
            <Pressable style={s.actionSecondary} onPress={() => router.push({ pathname: '/(app)/study-quiz', params: { topicId: id } })}>
              <Target size={20} color={tokens.color.primary} weight="bold" />
              <Text style={s.actionSecondaryText}>Quiz</Text>
            </Pressable>
            <Pressable style={s.actionSecondary} onPress={() => router.push({ pathname: '/(app)/study-interview', params: { topicId: id } })}>
              <Microphone size={20} color={tokens.color.primary} weight="bold" />
              <Text style={s.actionSecondaryText}>Interview</Text>
            </Pressable>
          </View>
        </View>

        {/* Documents */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Materials</Text>
            <Pressable onPress={() => router.push({ pathname: '/(app)/study-new-topic', params: { topicId: id } })}>
              <Plus size={20} color={tokens.color.primary} weight="bold" />
            </Pressable>
          </View>
          {docs.length === 0 ? (
            <Pressable style={s.emptyDoc} onPress={() => router.push({ pathname: '/(app)/study-new-topic', params: { topicId: id } })}>
              <File size={24} color={tokens.color.textMuted} weight="thin" />
              <Text style={s.emptyDocText}>Upload PDFs, images, or notes</Text>
            </Pressable>
          ) : (
            docs.map((doc) => (
              <View key={doc.id} style={s.docCard}>
                <File size={20} color={tokens.color.primary} />
                <View style={s.docInfo}>
                  <Text style={s.docTitle} numberOfLines={1}>{doc.title}</Text>
                  <Text style={s.docMeta}>
                    {doc.fileType} · {doc.processingStatus === 'ready' ? `${doc.chunkCount} chunks` : doc.processingStatus}
                  </Text>
                </View>
                {doc.processingStatus === 'processing' && <ActivityIndicator size="small" color={tokens.color.primary} />}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: tokens.color.text, textAlign: 'center' },
  content: { padding: 20, paddingBottom: 100 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: tokens.color.surface, borderRadius: 16, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: tokens.color.text },
  statLabel: { fontSize: 12, color: tokens.color.textMuted, marginTop: 4 },

  actions: { gap: 12, marginBottom: 28 },
  actionBtn: { height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actionPrimary: { backgroundColor: tokens.color.primary },
  actionPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionSecondary: { flex: 1, height: 56, borderRadius: 16, backgroundColor: tokens.color.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionSecondaryText: { color: tokens.color.primary, fontSize: 15, fontWeight: '700' },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyDoc: { backgroundColor: tokens.color.surface, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: tokens.color.surface2, borderStyle: 'dashed' },
  emptyDocText: { fontSize: 14, color: tokens.color.textMuted },

  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: tokens.color.surface, borderRadius: 14, padding: 14, gap: 12 },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 15, fontWeight: '600', color: tokens.color.text },
  docMeta: { fontSize: 12, color: tokens.color.textMuted, marginTop: 2 },
})
