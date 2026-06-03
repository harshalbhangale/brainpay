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
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Plus,
  ShieldCheck,
  ShieldX,
  Star,
  XCircle,
} from 'lucide-react-native'
import { api } from '@/lib/api'
import { useChores, type Chore } from '@/hooks/useChores'
import { useFamily } from '@/hooks/useFamily'
import { kidTheme as tokens } from '@/theme/tokens'

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
  const [newRewardNote, setNewRewardNote] = useState('')
  const [newKidId, setNewKidId] = useState<string | undefined>(filterKidId)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const kids = famData?.members.filter((m) => m.role === 'kid') ?? []
  const allChores = data?.chores ?? []
  const filtered = filterKidId ? allChores.filter((c) => c.assignedTo === filterKidId) : allChores

  const openAddModal = () => {
    // Auto-select first kid if only one
    if (kids.length === 1 && !newKidId) {
      setNewKidId(kids[0].accountId)
    }
    setAddOpen(true)
    setTimeout(() => inputRef.current?.focus(), 300)
  }

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
        body: JSON.stringify({
          assignedTo: newKidId,
          title: newTitle.trim(),
          rewardBrains: newReward,
          rewardNote: newRewardNote.trim() || undefined,
        }),
      })
      setAddOpen(false)
      setNewTitle('')
      setNewReward(50)
      setNewRewardNote('')
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
        <ActivityIndicator color={tokens.color.purple} />
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
        <Text style={s.headerTitle}>Chores</Text>
        <Pressable style={s.addBtn} hitSlop={8} onPress={openAddModal}>
          <Plus size={18} color="#fff" strokeWidth={2.5} />
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
                  <LinearGradient
                    colors={['#F59E0B12', 'transparent']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
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
                      <XCircle size={15} color={tokens.color.danger} strokeWidth={2} />
                      <Text style={s.rejectBtnText}>Reject</Text>
                    </Pressable>
                    <Pressable style={s.approveBtn} onPress={() => approveChore(c)}>
                      <LinearGradient
                        colors={['#3DDC84', '#22C55E']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                      <CheckCircle2 size={15} color="#000" strokeWidth={2.5} />
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
              const rewardNote = (c.metadata as { rewardNote?: string } | null)?.rewardNote
              return (
                <View key={c.id} style={s.simpleCard}>
                  <View style={s.simpleIconWrap}>
                    <Clock size={16} color={tokens.color.textMuted} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreMeta}>{kid?.persona?.name ?? 'Kid'}</Text>
                    {rewardNote ? (
                      <View style={s.rewardNoteTag}>
                        <Text style={s.rewardNoteTagText}>🎁 {rewardNote}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={s.rewardPill}>
                    <Star size={10} color={tokens.color.coin} strokeWidth={2.5} fill={tokens.color.coin} />
                    <Text style={s.rewardPillText}>{c.rewardBrains} pts</Text>
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
              const rewardNote = (c.metadata as { rewardNote?: string } | null)?.rewardNote
              return (
                <View key={c.id} style={[s.simpleCard, { opacity: 0.75 }]}>
                  <View style={[s.simpleIconWrap, { backgroundColor: tokens.color.accent + '18' }]}>
                    <CheckCircle2 size={16} color={tokens.color.accent} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.choreTitle}>{c.title}</Text>
                    <Text style={s.choreMeta}>{kid?.persona?.name ?? 'Kid'} · paid</Text>
                    {rewardNote ? (
                      <View style={[s.rewardNoteTag, { backgroundColor: tokens.color.accent + '15' }]}>
                        <Text style={[s.rewardNoteTagText, { color: tokens.color.accent }]}>🎁 {rewardNote}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={[s.rewardPill, { backgroundColor: tokens.color.accent + '15' }]}>
                    <Star size={10} color={tokens.color.accent} strokeWidth={2.5} fill={tokens.color.accent} />
                    <Text style={[s.rewardPillText, { color: tokens.color.accent }]}>{c.rewardBrains} pts</Text>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {filtered.length === 0 && (
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <CheckCircle2 size={40} color={tokens.color.textMuted} strokeWidth={1.2} />
            </View>
            <Text style={s.emptyTitle}>No chores yet</Text>
            <Text style={s.emptySub}>Tap + to create one for your kid.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add chore bottom sheet */}
      {addOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.sheetOverlay}
        >
          <Pressable style={s.sheetBackdrop} onPress={() => setAddOpen(false)} />
          <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, tokens.spacing[4]) }]}>
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: tokens.spacing[4] }}
                  contentContainerStyle={{ gap: tokens.spacing[2] }}
                >
                  {kids.map((k) => {
                    const accent = k.persona?.color ?? tokens.color.purple
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
                        <Text style={s.kidPillEmoji}>{k.persona?.avatar ?? '🧒'}</Text>
                        <Text style={[s.kidPillText, selected && { color: accent }]}>
                          {k.persona?.name ?? 'Kid'}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </>
            )}

            {/* Reward — Brain points */}
            <Text style={s.sheetLabel}>REWARD (BRAIN POINTS)</Text>
            <View style={s.rewardRow}>
              {[10, 20, 30, 50, 100, 200].map((amt) => (
                <Pressable
                  key={amt}
                  style={[s.rewardPillBtn, newReward === amt && s.rewardPillBtnActive]}
                  onPress={() => setNewReward(amt)}
                >
                  {newReward === amt && (
                    <LinearGradient
                      colors={['#A855F7', '#7C3AED']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    />
                  )}
                  <Star
                    size={10}
                    color={newReward === amt ? '#fff' : tokens.color.coin}
                    strokeWidth={2.5}
                    fill={newReward === amt ? '#fff' : tokens.color.coin}
                  />
                  <Text style={[s.rewardPillBtnText, newReward === amt && { color: '#fff' }]}>
                    {amt}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Reward — Real-world bonus */}
            <Text style={s.sheetLabel}>BONUS REWARD (OPTIONAL)</Text>
            <View style={s.bonusRow}>
              {['Ice cream 🍦', 'Screen time 📱', 'Movie night 🎬', 'Their choice 🎁'].map((preset) => {
                const active = newRewardNote === preset
                return (
                  <Pressable
                    key={preset}
                    style={[s.bonusChip, active && s.bonusChipActive]}
                    onPress={() => setNewRewardNote(active ? '' : preset)}
                  >
                    <Text style={[s.bonusChipText, active && s.bonusChipTextActive]}>{preset}</Text>
                  </Pressable>
                )
              })}
            </View>
            <TextInput
              style={s.bonusInput}
              value={newRewardNote}
              onChangeText={setNewRewardNote}
              placeholder="Or type your own… e.g. Extra 30 min outside"
              placeholderTextColor={tokens.color.textMuted}
              maxLength={60}
              returnKeyType="done"
            />

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
                {!creating && (
                  <LinearGradient
                    colors={['#A855F7', '#7C3AED']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                )}
                {creating
                  ? <ActivityIndicator color="#fff" size="small" />
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
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: tokens.spacing[5], marginBottom: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[5],
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { color: tokens.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
})

function AiBadge({ chore }: { chore: Chore }) {
  if (chore.status === 'ai_approved') {
    return (
      <View style={[ab.badge, { backgroundColor: tokens.color.accent + '20' }]}>
        <ShieldCheck size={11} color={tokens.color.accent} strokeWidth={2} />
        <Text style={[ab.text, { color: tokens.color.accent }]}>AI verified</Text>
      </View>
    )
  }
  if (chore.status === 'ai_rejected') {
    return (
      <View style={[ab.badge, { backgroundColor: tokens.color.danger + '20' }]}>
        <ShieldX size={11} color={tokens.color.danger} strokeWidth={2} />
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
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  text: { fontSize: 11, fontWeight: '700' },
})

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
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.purple,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },

  // Approval card
  approvalCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[3],
    borderWidth: 1,
    borderColor: '#F59E0B33',
    overflow: 'hidden',
  },
  approvalTop: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[2] },
  choreTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  choreMeta: { color: tokens.color.textMuted, fontSize: 12, marginTop: 3 },

  aiReasonBox: {
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[3],
    marginTop: tokens.spacing[3],
  },
  aiReasonText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic', lineHeight: 18 },

  approvalActions: { flexDirection: 'row', gap: tokens.spacing[2], marginTop: tokens.spacing[3] },
  rejectBtn: {
    flex: 1, height: 42, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  rejectBtnText: { color: tokens.color.danger, fontWeight: '700', fontSize: tokens.fontSize.sm },
  approveBtn: {
    flex: 2, height: 42, borderRadius: tokens.radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    overflow: 'hidden',
  },
  approveBtnText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.sm },

  // Simple card
  simpleCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
    marginHorizontal: tokens.spacing[5],
    marginBottom: tokens.spacing[2],
  },
  simpleIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  rewardPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: tokens.color.coin + '15',
    paddingHorizontal: tokens.spacing[3], paddingVertical: 5,
    borderRadius: tokens.radius.pill,
  },
  rewardPillText: { color: tokens.color.coin, fontSize: 12, fontWeight: '800' },

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

  // Bottom sheet
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: tokens.color.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[3],
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface2,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: tokens.color.surface2,
    alignSelf: 'center', marginBottom: tokens.spacing[4],
  },
  sheetTitle: {
    color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800',
    marginBottom: tokens.spacing[4],
  },
  sheetInput: {
    backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.md,
    marginBottom: tokens.spacing[4],
    borderWidth: 1, borderColor: tokens.color.surface2,
  },
  sheetLabel: {
    color: tokens.color.textMuted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.5, marginBottom: tokens.spacing[3],
  },
  kidPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  kidPillEmoji: { fontSize: 16 },
  kidPillText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  rewardRow: {
    flexDirection: 'row', gap: tokens.spacing[2], flexWrap: 'wrap',
    marginBottom: tokens.spacing[4],
  },
  rewardPillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill,
    overflow: 'hidden',
  },
  rewardPillBtnActive: { overflow: 'hidden' },
  rewardPillBtnText: { color: tokens.color.coin, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  // Reward note tag shown on chore cards
  rewardNoteTag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tokens.color.coin + '18',
    paddingHorizontal: tokens.spacing[2], paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  rewardNoteTagText: { color: tokens.color.coin, fontSize: 11, fontWeight: '700' },

  // Bonus reward section in sheet
  bonusRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2],
    marginBottom: tokens.spacing[3],
  },
  bonusChip: {
    paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  bonusChipActive: {
    borderColor: tokens.color.coin,
    backgroundColor: tokens.color.coin + '18',
  },
  bonusChipText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  bonusChipTextActive: { color: tokens.color.coin },
  bonusInput: {
    backgroundColor: tokens.color.surface,
    height: 48, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text, fontSize: tokens.fontSize.sm,
    marginBottom: tokens.spacing[4],
    borderWidth: 1, borderColor: tokens.color.surface2,
  },

  sheetActions: { flexDirection: 'row', gap: tokens.spacing[3] },
  cancelBtn: {
    flex: 1, height: 54, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md },
  saveBtn: {
    flex: 2, height: 54, borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: tokens.color.purple,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: tokens.fontSize.md },
})
