import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Camera, CircleCheck, CircleX, RotateCcw, UserCheck } from 'lucide-react-native'
import { api } from '@/lib/api'
import { useChores } from '@/hooks/useChores'
import { Confetti } from '@/components'
import { tokens } from '@/theme/tokens'

/**
 * Camera chore verification screen.
 *
 * Flow:
 *   1. Open camera
 *   2. Tap capture → take photo
 *   3. Show preview while AI analyses
 *   4. Show verdict: approved / rejected / uncertain
 *   5. Approved → confetti + back to chores
 *      Rejected → retry / escalate to parent
 *      Uncertain → already sent to parent for review
 */
export default function ChoreVerify() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { id: choreId } = useLocalSearchParams<{ id?: string }>()
  const { data } = useChores()
  const chore = data?.chores.find((c) => c.id === choreId)

  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  const [phase, setPhase] = useState<'camera' | 'analyzing' | 'result'>('camera')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<'approved' | 'rejected' | 'uncertain' | null>(null)
  const [reason, setReason] = useState<string>('')

  if (!chore) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <Text style={s.errorText}>Chore not found</Text>
      </View>
    )
  }

  if (!permission) {
    return <View style={s.root} />
  }

  if (!permission.granted) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Camera size={tokens.iconSize.hero} color={tokens.color.textMuted} strokeWidth={1.0} />
        <Text style={s.title}>Camera permission needed</Text>
        <Text style={s.subtitle}>To verify your chore, PAL needs to see it.</Text>
        <Pressable style={s.cta} onPress={requestPermission}>
          <Text style={s.ctaText}>Grant access</Text>
        </Pressable>
      </View>
    )
  }

  const capture = async () => {
    if (!cameraRef.current) return
    setPhase('analyzing')

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true })
      if (!photo) throw new Error('No photo')

      // Downsize for upload.
      const small = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      )
      setPhotoUri(small.uri)

      const result = await api<{ verdict: 'approved' | 'rejected' | 'uncertain'; reason: string }>(
        `/chores/${choreId}/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ photoBase64: small.base64, mimeType: 'image/jpeg' }),
        },
      )

      setVerdict(result.verdict)
      setReason(result.reason)
      setPhase('result')

      // Refresh chore list.
      queryClient.invalidateQueries({ queryKey: ['chores'] })
    } catch (err) {
      Alert.alert('Could not verify', 'Please try again.')
      setPhase('camera')
    }
  }

  const retry = () => {
    setPhase('camera')
    setPhotoUri(null)
    setVerdict(null)
    setReason('')
  }

  const escalate = () => {
    // Already sent to parent if verdict is uncertain or rejected.
    Alert.alert('Sent to mum/dad', 'They will review and approve manually.', [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  // ─── Result phase ───────────────────────────────────────────────────
  if (phase === 'result') {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {verdict === 'approved' && <Confetti show />}

        <View style={s.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
          </Pressable>
        </View>

        {photoUri && (
          <Image source={{ uri: photoUri }} style={s.photoPreview} />
        )}

        <View style={s.resultCard}>
          {verdict === 'approved' && (
            <>
              <CircleCheck size={56} color={tokens.color.accent} strokeWidth={1.5} />
              <Text style={[s.resultTitle, { color: tokens.color.accent }]}>Looks done!</Text>
              <Text style={s.resultReason}>"{reason}"</Text>
              <Text style={s.resultPending}>+{chore.rewardBrains} 🧠 incoming · waiting for parent</Text>
            </>
          )}
          {verdict === 'rejected' && (
            <>
              <CircleX size={56} color={tokens.color.danger} strokeWidth={1.5} />
              <Text style={[s.resultTitle, { color: tokens.color.danger }]}>Hmm, not quite</Text>
              <Text style={s.resultReason}>"{reason}"</Text>
            </>
          )}
          {verdict === 'uncertain' && (
            <>
              <UserCheck size={56} color={tokens.color.orange} strokeWidth={1.5} />
              <Text style={[s.resultTitle, { color: tokens.color.orange }]}>Sent to parent</Text>
              <Text style={s.resultReason}>"{reason}"</Text>
              <Text style={s.resultPending}>They'll review and approve.</Text>
            </>
          )}
        </View>

        <View style={s.resultActions}>
          {verdict === 'approved' && (
            <Pressable style={s.cta} onPress={() => router.back()}>
              <Text style={s.ctaText}>Done</Text>
            </Pressable>
          )}
          {verdict === 'rejected' && (
            <>
              <Pressable style={[s.cta, { backgroundColor: tokens.color.surface }]} onPress={retry}>
                <RotateCcw size={tokens.iconSize.md} color={tokens.color.text} strokeWidth={1.5} />
                <Text style={[s.ctaText, { color: tokens.color.text }]}>Try again</Text>
              </Pressable>
              <Pressable style={[s.cta, { backgroundColor: tokens.color.orange }]} onPress={escalate}>
                <Text style={s.ctaText}>Ask parent</Text>
              </Pressable>
            </>
          )}
          {verdict === 'uncertain' && (
            <Pressable style={s.cta} onPress={() => router.back()}>
              <Text style={s.ctaText}>OK</Text>
            </Pressable>
          )}
        </View>
      </View>
    )
  }

  // ─── Analyzing phase ────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {photoUri && <Image source={{ uri: photoUri }} style={s.photoPreview} />}
        <View style={s.analyzing}>
          <ActivityIndicator color={tokens.color.accent} size="large" />
          <Text style={s.analyzingText}>PAL is checking...</Text>
        </View>
      </View>
    )
  }

  // ─── Camera phase ───────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.title}>{chore.title}</Text>
          <Text style={s.subtitleSmall}>+{chore.rewardBrains} 🧠 reward</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.cameraWrap}>
        <CameraView ref={cameraRef} style={s.camera} facing="back" />
        <View style={s.cameraOverlay}>
          <Text style={s.cameraHint}>Point at your completed chore</Text>
        </View>
      </View>

      <Pressable style={s.captureBtn} onPress={capture}>
        <View style={s.captureInner} />
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: tokens.spacing[5] },

  errorText: { color: tokens.color.text, fontSize: tokens.fontSize.md },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  subtitle: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, textAlign: 'center', marginVertical: tokens.spacing[3] },
  subtitleSmall: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs },

  cameraWrap: { flex: 1, marginHorizontal: tokens.spacing[5], borderRadius: tokens.radius.lg, overflow: 'hidden' },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraHint: {
    color: '#fff', fontSize: tokens.fontSize.md, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.pill,
  },

  captureBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#fff',
    alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    marginVertical: tokens.spacing[5],
    borderWidth: 4, borderColor: tokens.color.surface,
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: tokens.color.accent },

  photoPreview: { flex: 1, marginHorizontal: tokens.spacing[5], borderRadius: tokens.radius.lg },

  analyzing: {
    paddingVertical: tokens.spacing[6],
    alignItems: 'center', gap: tokens.spacing[3],
  },
  analyzingText: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '600' },

  resultCard: {
    margin: tokens.spacing[5],
    padding: tokens.spacing[5],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    alignItems: 'center', gap: tokens.spacing[3],
  },
  resultTitle: { fontSize: tokens.fontSize.xl, fontWeight: '800' },
  resultReason: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontStyle: 'italic', textAlign: 'center' },
  resultPending: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, textAlign: 'center' },

  resultActions: {
    paddingHorizontal: tokens.spacing[5],
    gap: tokens.spacing[3],
    marginBottom: tokens.spacing[3],
  },

  cta: {
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: tokens.spacing[2],
  },
  ctaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
