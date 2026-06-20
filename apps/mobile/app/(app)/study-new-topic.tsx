import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
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
import { ArrowLeft, Camera, File, Notebook, Upload } from 'phosphor-react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

const EMOJIS = ['📚', '🧪', '🔬', '📐', '🌍', '📖', '🎨', '💻', '🧮', '🏛️', '🎵', '⚽']

export default function StudyNewTopic() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const { topicId } = useLocalSearchParams<{ topicId?: string }>()

  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('📚')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: async (opts: { topicId: string; title: string; content?: string; fileUrl?: string; fileType: string }) =>
      api(`/study/topics/${opts.topicId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: opts.title, fileUrl: opts.fileUrl ?? 'text://inline', fileType: opts.fileType, content: opts.content }),
      }),
  })

  const handleCreate = async () => {
    if (!title.trim() && !topicId) return
    setCreating(true)

    try {
      let tid = topicId
      if (!tid) {
        const res = await api<{ topic: { id: string } }>('/study/topics', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), emoji }),
        })
        tid = res.topic.id
      }

      // Upload notes as text document if provided
      if (notes.trim()) {
        await uploadMutation.mutateAsync({
          topicId: tid!,
          title: title.trim() || 'Notes',
          content: notes.trim(),
          fileType: 'text',
        })
      }

      qc.invalidateQueries({ queryKey: ['study-topics'] })
      qc.invalidateQueries({ queryKey: ['study-topic', tid] })
      router.back()
    } catch (err) {
      Alert.alert('Error', 'Failed to create. Try again.')
    } finally {
      setCreating(false)
    }
  }

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'] })
    if (result.canceled || !result.assets?.[0]) return
    const file = result.assets[0]
    // For now, alert that PDF upload via storage is coming
    Alert.alert('PDF Selected', `${file.name} — PDF processing will upload to storage and generate cards automatically.`)
  }

  const pickImage = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) return
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (result.canceled || !result.assets?.[0]) return
    Alert.alert('Photo Captured', 'Image processing will extract text and generate cards automatically.')
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={tokens.color.text} />
          </Pressable>
          <Text style={s.headerTitle}>{topicId ? 'Add Material' : 'New Topic'}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {/* Topic name (only for new topics) */}
          {!topicId && (
            <>
              <Text style={s.label}>Topic Name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Year 8 Science, Chapter 5..."
                placeholderTextColor={tokens.color.textMuted}
                value={title}
                onChangeText={setTitle}
                autoFocus
              />

              <Text style={s.label}>Icon</Text>
              <View style={s.emojiRow}>
                {EMOJIS.map((e) => (
                  <Pressable key={e} style={[s.emojiBtn, emoji === e && s.emojiBtnActive]} onPress={() => setEmoji(e)}>
                    <Text style={s.emojiText}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* Upload options */}
          <Text style={s.label}>Add Material</Text>
          <View style={s.uploadRow}>
            <Pressable style={s.uploadBtn} onPress={pickDocument}>
              <File size={24} color={tokens.color.primary} weight="duotone" />
              <Text style={s.uploadText}>PDF</Text>
            </Pressable>
            <Pressable style={s.uploadBtn} onPress={pickImage}>
              <Camera size={24} color={tokens.color.primary} weight="duotone" />
              <Text style={s.uploadText}>Camera</Text>
            </Pressable>
            <View style={[s.uploadBtn, s.uploadBtnActive]}>
              <Notebook size={24} color={tokens.color.primary} weight="duotone" />
              <Text style={s.uploadText}>Notes</Text>
            </View>
          </View>

          {/* Notes input */}
          <TextInput
            style={s.notesInput}
            placeholder="Paste or type your study notes here...&#10;&#10;The AI will generate flashcards from this text."
            placeholderTextColor={tokens.color.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>

        {/* Bottom CTA */}
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
            style={[s.cta, (!title.trim() && !topicId && !notes.trim()) && s.ctaDisabled]}
            onPress={handleCreate}
            disabled={creating || (!title.trim() && !topicId && !notes.trim())}
          >
            {creating ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.ctaText}>{topicId ? 'Upload & Generate Cards' : 'Create Topic'}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: tokens.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: tokens.color.text, textAlign: 'center' },
  content: { padding: 20, paddingBottom: 100 },

  label: { fontSize: 13, fontWeight: '700', color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 20 },
  input: { backgroundColor: tokens.color.surface, borderRadius: 14, padding: 16, fontSize: 16, color: tokens.color.text },

  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: tokens.color.surface, alignItems: 'center', justifyContent: 'center' },
  emojiBtnActive: { backgroundColor: tokens.color.primary + '20', borderWidth: 2, borderColor: tokens.color.primary },
  emojiText: { fontSize: 22 },

  uploadRow: { flexDirection: 'row', gap: 12 },
  uploadBtn: { flex: 1, backgroundColor: tokens.color.surface, borderRadius: 16, padding: 18, alignItems: 'center', gap: 8 },
  uploadBtnActive: { borderWidth: 2, borderColor: tokens.color.primary + '40' },
  uploadText: { fontSize: 13, fontWeight: '600', color: tokens.color.text },

  notesInput: {
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: tokens.color.text,
    minHeight: 160,
    marginTop: 16,
    lineHeight: 22,
  },

  bottom: { paddingHorizontal: 20, paddingTop: 12 },
  cta: { height: 56, borderRadius: 16, backgroundColor: tokens.color.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
