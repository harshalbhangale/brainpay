import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Plus, Target, Trophy } from 'phosphor-react-native'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

type Goal = {
  id: string
  name: string
  targetBrains: number
  currentBrains: number
  emoji: string
  status: 'active' | 'completed' | 'abandoned'
}

const GOAL_TEMPLATES = [
  { name: 'AirPods Pro', targetBrains: 5000, emoji: '🎧' },
  { name: 'New Game', targetBrains: 10000, emoji: '🎮' },
  { name: 'Sneakers', targetBrains: 8000, emoji: '👟' },
  { name: 'Phone Case', targetBrains: 2000, emoji: '📱' },
  { name: 'Art Supplies', targetBrains: 3000, emoji: '🎨' },
]

export default function KidGoals() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customTarget, setCustomTarget] = useState('500')
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api<{ goals: Goal[] }>('/goals'),
    staleTime: 10_000,
  })

  const goals = data?.goals ?? []
  const activeGoal = goals.find((g) => g.status === 'active')
  const completedGoals = goals.filter((g) => g.status === 'completed')

  const createGoal = async (name: string, targetBrains: number) => {
    setCreating(true)
    try {
      await api('/goals', {
        method: 'POST',
        body: JSON.stringify({ name, targetBrains, emoji: '🎯' }),
      })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      setAddOpen(false)
      setCustomName('')
      setCustomTarget('500')
    } catch {
      Alert.alert('Could not create goal', 'Please try again.')
    } finally {
      setCreating(false)
    }
  }

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
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} weight="bold" />
        </Pressable>
        <Text style={s.title}>My Goals</Text>
        <Pressable hitSlop={12} onPress={() => setAddOpen(true)}>
          <Plus size={tokens.iconSize.xl} color={tokens.color.accent} weight="bold" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }}>
        {activeGoal ? (
          <>
            <Text style={s.section}>ACTIVE GOAL</Text>
            <View style={[s.goalCard, { borderColor: tokens.color.accent + '44' }]}>
              <Text style={s.goalEmoji}>{activeGoal.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.goalName}>{activeGoal.name}</Text>
                <View style={s.progressBar}>
                  <View
                    style={[
                      s.progressFill,
                      {
                        width: `${Math.min(100, (activeGoal.currentBrains / activeGoal.targetBrains) * 100)}%`,
                        backgroundColor: tokens.color.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={s.progressText}>
                  {activeGoal.currentBrains.toLocaleString()} / {activeGoal.targetBrains.toLocaleString()} 🧠
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={s.empty}>
            <Target size={tokens.iconSize.hero} color={tokens.color.textMuted} weight="duotone" />
            <Text style={s.emptyTitle}>No active goal</Text>
            <Text style={s.emptySub}>Set a goal to start saving towards something.</Text>
            <Pressable style={s.cta} onPress={() => setAddOpen(true)}>
              <Text style={s.ctaText}>Set a goal</Text>
            </Pressable>
          </View>
        )}

        {completedGoals.length > 0 && (
          <>
            <Text style={s.section}>COMPLETED</Text>
            {completedGoals.map((g) => (
              <View key={g.id} style={s.completedRow}>
                <Trophy size={tokens.iconSize.md} color={tokens.color.coin} weight="fill" />
                <Text style={s.completedName}>{g.name}</Text>
                <Text style={s.completedBrains}>{g.targetBrains.toLocaleString()} 🧠</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Add goal modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom + tokens.spacing[4], tokens.spacing[8]) }]}>
            <Text style={s.modalTitle}>New Goal</Text>

            <Text style={s.modalLabel}>TEMPLATES</Text>
            <View style={s.templateGrid}>
              {GOAL_TEMPLATES.map((t) => (
                <Pressable
                  key={t.name}
                  style={s.templateChip}
                  onPress={() => createGoal(t.name, t.targetBrains)}
                >
                  <Text style={s.templateEmoji}>{t.emoji}</Text>
                  <Text style={s.templateName}>{t.name}</Text>
                  <Text style={s.templateBrains}>{t.targetBrains.toLocaleString()} 🧠</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.modalLabel}>OR CUSTOM</Text>
            <TextInput
              style={s.input}
              value={customName}
              onChangeText={setCustomName}
              placeholder="What are you saving for?"
              placeholderTextColor={tokens.color.textMuted}
            />
            <TextInput
              style={s.input}
              value={customTarget}
              onChangeText={setCustomTarget}
              placeholder="Target Brains"
              placeholderTextColor={tokens.color.textMuted}
              keyboardType="numeric"
            />

            <View style={s.modalActions}>
              <Pressable style={[s.cta, { backgroundColor: tokens.color.surface2 }]} onPress={() => setAddOpen(false)}>
                <Text style={[s.ctaText, { color: tokens.color.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.cta, !customName.trim() && { opacity: 0.5 }]}
                onPress={() => createGoal(customName.trim(), parseInt(customTarget, 10) || 500)}
                disabled={!customName.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  section: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
  },
  goalCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg, borderWidth: 1,
  },
  goalEmoji: { fontSize: 36 },
  goalName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700', marginBottom: tokens.spacing[2] },
  progressBar: {
    height: 8, backgroundColor: tokens.color.surface2, borderRadius: 4, overflow: 'hidden',
    marginBottom: tokens.spacing[2],
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs },
  completedRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[3],
    borderRadius: tokens.radius.md, marginBottom: tokens.spacing[2],
  },
  completedName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  completedBrains: { color: tokens.color.coin, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: tokens.spacing[8], gap: tokens.spacing[3] },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, textAlign: 'center' },
  cta: {
    flex: 1, height: 56, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent, alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: tokens.color.bg, borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg, padding: tokens.spacing[5], paddingBottom: 48,
  },
  modalTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginBottom: tokens.spacing[4] },
  modalLabel: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginTop: tokens.spacing[3], marginBottom: tokens.spacing[2],
  },
  templateGrid: { gap: tokens.spacing[2] },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[3], borderRadius: tokens.radius.md,
  },
  templateEmoji: { fontSize: 24 },
  templateName: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  templateBrains: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs },
  input: {
    backgroundColor: tokens.color.surface, height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4], color: tokens.color.text, fontSize: tokens.fontSize.md,
    marginBottom: tokens.spacing[2],
  },
  modalActions: { flexDirection: 'row', gap: tokens.spacing[3], marginTop: tokens.spacing[4] },
})
