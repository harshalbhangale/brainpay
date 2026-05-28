import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { ArrowLeft, CircleCheck, CircleX, Plus, ShieldCheck, ShieldX, Upload } from 'lucide-react-native'
import { api } from '@/lib/api'
import { useChores, type Chore } from '@/hooks/useChores'
import { useFamily } from '@/hooks/useFamily'
import { tokens } from '@/theme/tokens'

/**
 * Parent chores screen.
 *   - List awaiting approval (with AI verdict + photo)
 *   - List pending kid action
 *   - List recently paid
 *   - "+ Add chore" button → modal to create new chore
 */
export default function ParentChores() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { kidId: filterKidId } = useLocalSearchParams<{ kidId?: string }>()
  const { data: famData } = useFamily()
  const { data, isLoading } = useChores()

  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newReward, setNewReward] = useState(50)
  const [newKidId, setNewKidId] = useState<string | undefined>(filterKidId)
  const [creating, setCreating] = useState(false)

  const kids = famData?.members.filter((m) => m.role === 'kid') ?? []
  const allChores = data?.chores ?? []
  const filtered = filterKidId ? allChores.filter((c) => c.assignedTo === filterKidId) : allChores

  const awaitingApproval = filtered.filter((c) =>
    ['submitted', 'ai_approved', 'ai_uncertain', 'ai_rejected'].includes(c.status),
  )
  const pending = filtered.filter((c) => c.status === 'pending')
  const completed = filtered.filter((c) => ['paid', 'parent_approved', 'parent_rejected'].includes(c.status)).slice(0, 5)

  const createChore = async () => {
    if (!newTitle.trim() || !newKidId) return
    setCreating(true)
    try {
      await api('/chores', {
        method: 'POST',
        body: JSON.stringify({
          assignedTo: newKidId,
          title: newTitle.trim(),
          rewardBrains: newReward,
        }),
      })
      setAddOpen(false)
      setNewTitle('')
      setNewReward(50)
      queryClient.invalidateQueries({ queryKey: ['chores'] })
    } catch {
      Alert.alert('Could not create chore', 'Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const approveChore = async (chore: Chore) => {
    try {
      await api(`/chores/${chore.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'parent_approved' }),
      })
      queryClient.invalidateQueries({ queryKey: ['chores'] })
      queryClient.invalidateQueries({ queryKey: ['family'] })
    } catch {
      Alert.alert('Could not approve', 'Please try again.')
    }
  }

  const rejectChore = (chore: Chore) => {
    Alert.prompt(
      'Reject chore',
      'Tell them what went wrong (optional)',
      async (note) => {
        try {
          await api(`/chores/${chore.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'parent_rejected', parentNote: note ?? '' }),
          })
          queryClient.invalidateQueries({ queryKey: ['chores'] })
        } catch {
          Alert.alert('Could not reject', 'Please try again.')
        }
      },
    )
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
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.title}>Chores</Text>
        <Pressable hitSlop={12} onPress={() => setAddOpen(true)}>
          <Plus size={tokens.iconSize.xl} color={tokens.color.accent} strokeWidth={1.5} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }} showsVerticalScrollIndicator={false}>
        {awaitingApproval.length > 0 && (
          <>
            <Text style={s.section}>AWAITING APPROVAL</Text>
            {awaitingApproval.map((c) => {
              const kid = kids.find((k) => k.accountId === c.assignedTo)
              return (
                <View key={c.id} style={s.choreCard}>
                  <View style={s.choreHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.choreTitle}>{c.title}</Text>
                      <Text style={s.choreSub}>
                        {kid?.persona?.name ?? 'Kid'} · +{c.rewardBrains} 🧠
                      </Text>
                    </View>
                    <AiVerdictBadge chore={c} />
                  </View>
                  {c.aiReason && (
                    <Text style={s.aiReason}>"{c.aiReason}"</Text>
                  )}
                  <View style={s.choreActions}>
                    <Pressable style={[s.actionBtn, s.rejectBtn]} onPress={() => rejectChore(c)}>
                      <CircleX size={tokens.iconSize.md} color={tokens.color.danger} strokeWidth={1.5} />
                      <Text style={[s.actionBtnText, { color: tokens.color.danger }]}>Reject</Text>
                    </Pressable>
                    <Pressable style={[s.actionBtn, s.approveBtn]} onPress={() => approveChore(c)}>
                      <CircleCheck size={tokens.iconSize.md} color="#000" strokeWidth={2} />
                      <Text style={[s.actionBtnText, { color: '#000' }]}>Approve & Pay</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {pending.length > 0 && (
          <>
            <Text style={s.section}>PENDING</Text>
            {pending.map((c) => {
              const kid = kids.find((k) => k.accountId === c.assignedTo)
              return (
                <View key={c.id} style={s.choreCardSmall}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreSub}>
                      {kid?.persona?.name ?? 'Kid'} · +{c.rewardBrains} 🧠 · waiting for kid
                    </Text>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {completed.length > 0 && (
          <>
            <Text style={s.section}>RECENTLY DONE</Text>
            {completed.map((c) => {
              const kid = kids.find((k) => k.accountId === c.assignedTo)
              return (
                <View key={c.id} style={s.choreCardSmall}>
                  <CircleCheck size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreSub}>
                      {kid?.persona?.name ?? 'Kid'} · +{c.rewardBrains} 🧠 · paid
                    </Text>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {filtered.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No chores yet</Text>
            <Text style={s.emptySub}>Tap + to add one.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add chore modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>New chore</Text>

            <Text style={s.modalLabel}>Title</Text>
            <TextInput
              style={s.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Take out the bins"
              placeholderTextColor={tokens.color.textMuted}
              autoFocus
            />

            <Text style={s.modalLabel}>Assign to</Text>
            <View style={s.kidPicker}>
              {kids.map((k) => (
                <Pressable
                  key={k.accountId}
                  style={[
                    s.kidChip,
                    newKidId === k.accountId && {
                      backgroundColor: (k.persona?.color ?? tokens.color.accent) + '33',
                      borderColor: k.persona?.color ?? tokens.color.accent,
                    },
                  ]}
                  onPress={() => setNewKidId(k.accountId)}
                >
                  <Text style={s.kidChipText}>{k.persona?.avatar ?? '🧒'} {k.persona?.name ?? 'Kid'}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.modalLabel}>Reward</Text>
            <View style={s.rewardPicker}>
              {[10, 20, 30, 50, 100].map((amt) => (
                <Pressable
                  key={amt}
                  style={[s.rewardChip, newReward === amt && { backgroundColor: tokens.color.accent }]}
                  onPress={() => setNewReward(amt)}
                >
                  <Text style={[s.rewardChipText, newReward === amt && { color: '#000' }]}>
                    +{amt} 🧠
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={s.modalActions}>
              <Pressable style={[s.cta, { backgroundColor: tokens.color.surface }]} onPress={() => setAddOpen(false)}>
                <Text style={[s.ctaText, { color: tokens.color.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.cta, !newTitle.trim() || !newKidId ? s.ctaDisabled : null]}
                onPress={createChore}
                disabled={!newTitle.trim() || !newKidId || creating}
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

function AiVerdictBadge({ chore }: { chore: Chore }) {
  if (chore.status === 'submitted') {
    return (
      <View style={[s.badge, { backgroundColor: tokens.color.surface2 }]}>
        <Upload size={14} color={tokens.color.textMuted} strokeWidth={1.5} />
        <Text style={[s.badgeText, { color: tokens.color.textMuted }]}>Pending AI</Text>
      </View>
    )
  }
  if (chore.status === 'ai_approved') {
    return (
      <View style={[s.badge, { backgroundColor: tokens.color.accent + '22' }]}>
        <ShieldCheck size={14} color={tokens.color.accent} strokeWidth={2} />
        <Text style={[s.badgeText, { color: tokens.color.accent }]}>AI ✓</Text>
      </View>
    )
  }
  if (chore.status === 'ai_rejected') {
    return (
      <View style={[s.badge, { backgroundColor: tokens.color.danger + '22' }]}>
        <ShieldX size={14} color={tokens.color.danger} strokeWidth={2} />
        <Text style={[s.badgeText, { color: tokens.color.danger }]}>AI ✗</Text>
      </View>
    )
  }
  return (
    <View style={[s.badge, { backgroundColor: tokens.color.orange + '22' }]}>
      <Text style={[s.badgeText, { color: tokens.color.orange }]}>Review needed</Text>
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
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[3],
  },
  choreHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  choreTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choreSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },
  choreCardSmall: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing[2],
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: tokens.spacing[2],
    paddingVertical: tokens.spacing[1],
    borderRadius: tokens.radius.pill,
  },
  badgeText: { fontSize: tokens.fontSize.xs, fontWeight: '700' },

  aiReason: {
    color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic',
    marginVertical: tokens.spacing[3],
  },

  choreActions: { flexDirection: 'row', gap: tokens.spacing[2] },
  actionBtn: {
    flex: 1, height: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: tokens.radius.pill,
  },
  approveBtn: { backgroundColor: tokens.color.accent },
  rejectBtn: { backgroundColor: tokens.color.surface2 },
  actionBtnText: { fontSize: tokens.fontSize.sm, fontWeight: '800' },

  empty: { paddingVertical: tokens.spacing[8], alignItems: 'center', gap: tokens.spacing[2] },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: tokens.color.bg,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    padding: tokens.spacing[5],
    paddingBottom: tokens.spacing[8],
  },
  modalTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginBottom: tokens.spacing[4] },
  modalLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700', letterSpacing: 1.2, marginTop: tokens.spacing[3], marginBottom: tokens.spacing[2] },

  input: {
    backgroundColor: tokens.color.surface,
    height: 56,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },

  kidPicker: { flexDirection: 'row', gap: tokens.spacing[2], flexWrap: 'wrap' },
  kidChip: {
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 1, borderColor: 'transparent',
  },
  kidChipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  rewardPicker: { flexDirection: 'row', gap: tokens.spacing[2], flexWrap: 'wrap' },
  rewardChip: {
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
  },
  rewardChipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  modalActions: { flexDirection: 'row', gap: tokens.spacing[3], marginTop: tokens.spacing[5] },
  cta: {
    flex: 1, height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: tokens.color.surface2 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
