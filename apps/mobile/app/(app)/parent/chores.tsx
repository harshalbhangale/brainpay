import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Plus,
  ShieldCheck,
  ShieldX,
  XCircle,
} from 'lucide-react-native'
import { api } from '@/lib/api'
import { useChores, type Chore } from '@/hooks/useChores'
import { useFamily } from '@/hooks/useFamily'
import { tokens } from '@/theme/tokens'

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
  const inputRef = useRef<TextInput>(null)

  const kids = famData?.members.filter((m) => m.role === 'kid') ?? []
  const allChores = data?.chores ?? []
  const filtered = filterKidId ? allChores.filter((c) => c.assignedTo === filterKidId) : allChores

  const awaitingApproval = filtered.filter((c) =>
    ['submitted', 'ai_approved', 'ai_uncertain', 'ai_rejected'].includes(c.status),
  )
  const pending = filtered.filter((c) => c.status === 'pending')
  const completed = filtered.filter((c) =>
    ['paid', 'parent_approved', 'parent_rejected'].includes(c.status),
  ).slice(0, 5)

  const createChore = async () => {
    if (!newTitle.trim() || !newKidId) return
    setCreating(true)
    try {
      await api('/chores', {
        method: 'POST',
        body: JSON.stringify({ assignedTo: newKidId, title: newTitle.trim(), rewardBrains: newReward }),
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
    Alert.prompt('Reject chore', 'Tell them what went wrong (optional)', async (note) => {
      try {
        await api(`/chores/${chore.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'parent_rejected', parentNote: note ?? '' }),
        })
        queryClient.invalidateQueries({ queryKey: ['chores'] })
      } catch {
        Alert.alert('Could not reject', 'Please try again.')
      }
    })
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
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.headerTitle}>Chores</Text>
        <Pressable
          style={s.addBtn}
          hitSlop={8}
          onPress={() => {
            setAddOpen(true)
            setTimeout(() => inputRef.current?.focus(), 300)
          }}
        >
          <Plus size={tokens.iconSize.md} color="#000" strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tokens.spacing[8] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Awaiting approval */}
        {awaitingApproval.length > 0 && (
          <>
            <SectionLabel text="NEEDS YOUR APPROVAL" dot="#F59E0B" />
            {awaitingApproval.map((c) => {
              const kid = kids.find((k) => k.accountId === c.assignedTo)
              return (
                <View key={c.id} style={s.approvalCard}>
                  <View style={s.approvalTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.choreTitle}>{c.title}</Text>
                      <Text style={s.choreMeta}>
                        {kid?.persona?.name ?? 'Kid'} · {c.rewardBrains} pts
                      </Text>
                    </View>
                    <AiBadge chore={c} />
                  </View>
                  {c.aiReason ? (
                    <View style={s.aiReasonBox}>
                      <Text style={s.aiReasonText}>"{c.aiReason}"</Text>
                    </View>
                  ) : null}
                  <View style={s.approvalActions}>
                    <Pressable style={s.rejectBtn} onPress={() => rejectChore(c)}>
                      <XCircle size={16} color={tokens.color.danger} strokeWidth={2} />
                      <Text style={s.rejectBtnText}>Reject</Text>
                    </Pressable>
                    <Pressable style={s.approveBtn} onPress={() => approveChore(c)}>
                      <CheckCircle2 size={16} color="#000" strokeWidth={2} />
                      <Text style={s.approveBtnText}>Approve & Pay</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <SectionLabel text="WAITING FOR KID" dot={tokens.color.textMuted} />
            {pending.map((c) => {
              const kid = kids.find((k) => k.accountId === c.assignedTo)
              return (
                <View key={c.id} style={s.simpleCard}>
                  <Clock size={tokens.iconSize.md} color={tokens.color.textMuted} strokeWidth={1.5} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreMeta}>{kid?.persona?.name ?? 'Kid'} · {c.rewardBrains} pts</Text>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <>
            <SectionLabel text="RECENTLY DONE" dot={tokens.color.accent} />
            {completed.map((c) => {
              const kid = kids.find((k) => k.accountId === c.assignedTo)
              return (
                <View key={c.id} style={s.simpleCard}>
                  <CheckCircle2 size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreMeta}>{kid?.persona?.name ?? 'Kid'} · {c.rewardBrains} pts · paid</Text>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {filtered.length === 0 && (
          <View style={s.empty}>
            <CheckCircle2 size={tokens.iconSize.hero} color={tokens.color.surface2} strokeWidth={1.0} />
            <Text style={s.emptyTitle}>No chores yet</Text>
            <Text style={s.emptySub}>Tap + to create one for your kid.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add chore bottom sheet — keyboard-aware */}
      {addOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.sheetOverlay}
        >
          <Pressable style={s.sheetBackdrop} onPress={() => setAddOpen(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + tokens.spacing[4] }]}>
            {/* Drag handle */}
            <View style={s.handle} />

            <Text style={s.sheetTitle}>New chore</Text>

            {/* Title input */}
            <TextInput
              ref={inputRef}
              style={s.sheetInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Take out the bins"
              placeholderTextColor={tokens.color.textMuted}
              returnKeyType="done"
              maxLength={80}
            />

            {/* Assign to */}
            {kids.length > 0 && (
              <>
                <Text style={s.sheetLabel}>ASSIGN TO</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: tokens.spacing[3] }}>
                  <View style={s.kidRow}>
                    {kids.map((k) => {
                      const accent = k.persona?.color ?? tokens.color.accent
                      const selected = newKidId === k.accountId
                      return (
                        <Pressable
                          key={k.accountId}
                          style={[
                            s.kidPill,
                            selected && { backgroundColor: accent + '22', borderColor: accent },
                          ]}
                          onPress={() => setNewKidId(k.accountId)}
                        >
                          <Text style={s.kidPillText}>{k.persona?.name ?? 'Kid'}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Reward */}
            <Text style={s.sheetLabel}>REWARD</Text>
            <View style={s.rewardRow}>
              {[10, 20, 30, 50, 100, 200].map((amt) => (
                <Pressable
                  key={amt}
                  style={[s.rewardPill, newReward === amt && { backgroundColor: tokens.color.accent }]}
                  onPress={() => setNewReward(amt)}
                >
                  <Text style={[s.rewardPillText, newReward === amt && { color: '#000' }]}>
                    {amt}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Actions */}
            <View style={s.sheetActions}>
              <Pressable style={s.cancelBtn} onPress={() => setAddOpen(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.saveBtn, (!newTitle.trim() || !newKidId) && s.saveBtnDisabled]}
                onPress={createChore}
                disabled={!newTitle.trim() || !newKidId || creating}
              >
                {creating
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={s.saveBtnText}>Save chore</Text>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

function SectionLabel({ text, dot }: { text: string; dot: string }) {
  return (
    <View style={sl.row}>
      <View style={[sl.dot, { backgroundColor: dot }]} />
      <Text style={sl.text}>{text}</Text>
    </View>
  )
}
const sl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700', letterSpacing: 1.2 },
})

function AiBadge({ chore }: { chore: Chore }) {
  if (chore.status === 'ai_approved') {
    return (
      <View style={[ab.badge, { backgroundColor: tokens.color.accent + '20' }]}>
        <ShieldCheck size={12} color={tokens.color.accent} strokeWidth={2} />
        <Text style={[ab.text, { color: tokens.color.accent }]}>AI verified</Text>
      </View>
    )
  }
  if (chore.status === 'ai_rejected') {
    return (
      <View style={[ab.badge, { backgroundColor: tokens.color.danger + '20' }]}>
        <ShieldX size={12} color={tokens.color.danger} strokeWidth={2} />
        <Text style={[ab.text, { color: tokens.color.danger }]}>AI rejected</Text>
      </View>
    )
  }
  return (
    <View style={[ab.badge, { backgroundColor: tokens.color.surface2 }]}>
      <Text style={[ab.text, { color: tokens.color.textMuted }]}>Pending review</Text>
    </View>
  )
}
const ab = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 11, fontWeight: '700' },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3],
  },
  headerTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  // Cards
  approvalCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[3],
    borderWidth: 1,
    borderColor: '#F59E0B33',
  },
  approvalTop: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[2] },
  choreTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choreMeta: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 3 },

  aiReasonBox: {
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[3],
    marginTop: tokens.spacing[3],
  },
  aiReasonText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic', lineHeight: 18 },

  approvalActions: { flexDirection: 'row', gap: tokens.spacing[2], marginTop: tokens.spacing[3] },
  rejectBtn: {
    flex: 1, height: 40, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  rejectBtnText: { color: tokens.color.danger, fontWeight: '700', fontSize: tokens.fontSize.sm },
  approveBtn: {
    flex: 2, height: 40, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  approveBtnText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.sm },

  simpleCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
  },

  empty: {
    alignItems: 'center', paddingVertical: tokens.spacing[8],
    gap: tokens.spacing[3], paddingHorizontal: tokens.spacing[5],
  },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, textAlign: 'center' },

  // Bottom sheet
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: tokens.color.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[3],
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: tokens.color.surface2,
    alignSelf: 'center', marginBottom: tokens.spacing[4],
  },
  sheetTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginBottom: tokens.spacing[4] },
  sheetInput: {
    backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.md,
    marginBottom: tokens.spacing[4],
  },
  sheetLabel: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: tokens.spacing[2],
  },
  kidRow: { flexDirection: 'row', gap: tokens.spacing[2] },
  kidPill: {
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  kidPillText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  rewardRow: { flexDirection: 'row', gap: tokens.spacing[2], flexWrap: 'wrap', marginBottom: tokens.spacing[4] },
  rewardPill: {
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill,
  },
  rewardPillText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', gap: tokens.spacing[3] },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md },
  saveBtn: {
    flex: 2, height: 52, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
