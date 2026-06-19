import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Buffer } from 'buffer'
import { Mic, MicOff, Sparkles, Volume2, VolumeX, X } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { tokens } from '@/theme/tokens'
import { useGeminiLive, type LiveDetection } from '@/hooks/useGeminiLive'
import { useAuthStore } from '@/stores/auth'

const FRAME_INTERVAL_MS = 1000
const FRAME_MAX_WIDTH = 480
const ORB_GRADIENT: [string, string] = ['#3DDC84', '#16A07F']

function coinColor(delta: number): string {
  if (delta >= 5) return '#3DDC84'
  if (delta <= -5) return '#FF5C5C'
  return '#FFB627'
}

function CoinChip({ det }: { det: LiveDetection }) {
  const scale = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start()
  }, [det.detectionId])
  const color = coinColor(det.coinDelta)
  return (
    <Animated.View style={[live.coin, { borderColor: color, transform: [{ scale }] }]}>
      <Text style={live.coinEmoji}>{det.emoji}</Text>
      <Text style={[live.coinDelta, { color }]}>
        {det.coinDelta > 0 ? '+' : ''}{det.coinDelta} 🧠
      </Text>
      <Text style={live.coinName} numberOfLines={1}>{det.name}</Text>
    </Animated.View>
  )
}

/** Pulsing gradient orb shown in voice-only mode (no camera). */
function VoiceOrb({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!active) {
      pulse.stopAnimation()
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active])

  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] })
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.06] })

  return (
    <View style={live.orbWrap} pointerEvents="none">
      <Animated.View style={[live.orbHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
      <Animated.View style={[live.orbCore, { transform: [{ scale: coreScale }] }]}>
        <LinearGradient colors={ORB_GRADIENT} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Sparkles size={48} color="#fff" strokeWidth={1.75} />
      </Animated.View>
    </View>
  )
}

/**
 * LiveScreen — real-time camera + voice via Gemini Live.
 *
 * Route params:
 *   mode  : 'shop' (default) — the shopping coin-scorer
 *           'assist'         — general "point at anything and ask" assistant
 *   voice : '1'              — voice-only (no camera; shows a pulsing orb)
 */
export default function LiveScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string; voice?: string }>()
  const mode: 'shop' | 'assist' = params.mode === 'assist' ? 'assist' : 'shop'
  const voiceOnly = params.voice === '1'
  const needsCamera = !voiceOnly

  const account = useAuthStore((s) => s.accountType)
  const role = account === 'parent' ? 'parent' : 'kid'

  const [perm, requestPerm] = useCameraPermissions()
  const cameraRef = useRef<CameraView | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const captureRef = useRef({ inFlight: false, cancelled: false })

  const {
    phase, detections, palLine, userLine, micOn, speakerOn,
    connect, stop, sendFrame, toggleMic, toggleSpeaker,
  } = useGeminiLive({ role, mode })

  // Camera permission — only needed when the camera is in use.
  useEffect(() => {
    if (!needsCamera) return
    if (!perm) return
    if (!perm.granted && perm.canAskAgain) requestPerm()
  }, [perm, requestPerm, needsCamera])

  // Open the live session. Camera modes wait for permission; voice-only starts now.
  useEffect(() => {
    if (needsCamera && !perm?.granted) return
    void connect()
    return () => { void stop() }
  }, [needsCamera, perm?.granted])

  // Frame capture loop → stream JPEG frames to the live session (camera modes only).
  useEffect(() => {
    if (!needsCamera || !perm?.granted || !cameraReady) return
    captureRef.current.cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (captureRef.current.cancelled) return
      if (!captureRef.current.inFlight && cameraRef.current && phase === 'live') {
        captureRef.current.inFlight = true
        try {
          const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, shutterSound: false, exif: false })
          if (photo?.uri) {
            const shrunk = await ImageManipulator.manipulateAsync(
              photo.uri, [{ resize: { width: FRAME_MAX_WIDTH } }],
              { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
            )
            const b64 = await FileSystem.readAsStringAsync(shrunk.uri, { encoding: FileSystem.EncodingType.Base64 })
            sendFrame(Uint8Array.from(Buffer.from(b64, 'base64')))
            FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => undefined)
            FileSystem.deleteAsync(shrunk.uri, { idempotent: true }).catch(() => undefined)
          }
        } catch { /* silent */ } finally { captureRef.current.inFlight = false }
      }
      timer = setTimeout(tick, FRAME_INTERVAL_MS)
    }
    timer = setTimeout(tick, 600)
    return () => { captureRef.current.cancelled = true; if (timer) clearTimeout(timer) }
  }, [needsCamera, perm?.granted, cameraReady, phase, sendFrame])

  const handleClose = async () => {
    await stop()
    router.back()
  }

  // Camera permission gate (camera modes only).
  if (needsCamera && !perm) return <View style={live.bg} />
  if (needsCamera && !perm?.granted) {
    return (
      <View style={[live.bg, live.center]}>
        <Text style={live.permTitle}>Camera permission needed</Text>
        <Pressable style={live.permBtn} onPress={requestPerm}>
          <Text style={live.permBtnText}>Grant access</Text>
        </Pressable>
      </View>
    )
  }

  const statusLabel =
    phase === 'live' ? 'LIVE' :
    phase === 'connecting' ? 'CONNECTING…' :
    phase === 'error' ? 'ERROR' : 'OFFLINE'

  const title = voiceOnly ? 'PAL Voice' : mode === 'assist' ? 'Point & Ask' : 'Scan'
  const hint = voiceOnly
    ? 'talk to PAL — ask anything…'
    : mode === 'assist'
      ? 'point at anything and ask PAL…'
      : 'point at something and talk to PAL…'

  return (
    <View style={live.bg}>
      {needsCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
      ) : (
        <>
          <LinearGradient colors={['#06100D', '#0B0B0F']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
          <VoiceOrb active={phase === 'live'} />
        </>
      )}

      {/* Top HUD */}
      <View style={[live.hud, { top: insets.top + tokens.spacing[3] }]}>
        <View style={[live.pill, { backgroundColor: phase === 'live' ? tokens.color.accent : tokens.color.danger }]}>
          {phase === 'live' && <View style={live.liveDot} />}
          <Text style={live.pillText}>{statusLabel}</Text>
        </View>
        <Text style={live.hudTitle} numberOfLines={1}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Pressable style={live.iconBtn} onPress={handleClose} accessibilityLabel="Close">
          <X size={20} color={tokens.color.text} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Detected item coins — shopping mode only */}
      {mode === 'shop' && (
        <View style={[live.coinTray, { top: insets.top + 72 }]}>
          {detections.map((det) => <CoinChip key={det.detectionId} det={det} />)}
        </View>
      )}

      {/* Captions: what you said + what PAL says */}
      <View style={[live.captions, { bottom: insets.bottom + 140 }]}>
        {!!userLine && (
          <View style={live.userBubble}>
            <Text style={live.userText} numberOfLines={2}>{userLine}</Text>
          </View>
        )}
        {!!palLine && (
          <View style={live.palBubble}>
            <Text style={live.palText}>{palLine}</Text>
          </View>
        )}
        {!userLine && !palLine && phase === 'live' && (
          <Text style={live.hint}>{hint}</Text>
        )}
      </View>

      {/* Mute controls */}
      <View style={[live.controls, { bottom: insets.bottom + tokens.spacing[6] }]}>
        <Pressable
          style={[live.ctrlBtn, !micOn && live.ctrlBtnOff]}
          onPress={toggleMic}
        >
          {micOn
            ? <Mic size={26} color="#000" strokeWidth={2} />
            : <MicOff size={26} color={tokens.color.text} strokeWidth={2} />}
          <Text style={[live.ctrlLabel, micOn ? live.ctrlLabelOn : undefined]}>
            {micOn ? 'Mic on' : 'Muted'}
          </Text>
        </Pressable>

        <Pressable
          style={[live.ctrlBtn, !speakerOn && live.ctrlBtnOff]}
          onPress={toggleSpeaker}
        >
          {speakerOn
            ? <Volume2 size={26} color="#000" strokeWidth={2} />
            : <VolumeX size={26} color={tokens.color.text} strokeWidth={2} />}
          <Text style={[live.ctrlLabel, speakerOn ? live.ctrlLabelOn : undefined]}>
            {speakerOn ? 'Sound on' : 'Silent'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const live = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: tokens.spacing[5] },
  permTitle: { color: tokens.color.text, fontSize: tokens.fontSize.lg, marginBottom: tokens.spacing[4] },
  permBtn: { backgroundColor: tokens.color.accent, paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3], borderRadius: tokens.radius.pill },
  permBtnText: { color: '#000', fontWeight: '700' },

  hud: {
    position: 'absolute', left: tokens.spacing[5], right: tokens.spacing[5],
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: tokens.radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#000' },
  pillText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.xs, letterSpacing: 0.8 },
  hudTitle: { color: tokens.color.text, fontWeight: '800', fontSize: tokens.fontSize.sm },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(11,11,15,0.75)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },

  // Voice-only orb
  orbWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  orbHalo: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: tokens.color.accent },
  orbCore: {
    width: 156, height: 156, borderRadius: 78,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: tokens.color.accent, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 16,
  },

  coinTray: {
    position: 'absolute', right: tokens.spacing[5], gap: tokens.spacing[3], alignItems: 'flex-end',
  },
  coin: {
    backgroundColor: 'rgba(11,11,15,0.85)',
    borderWidth: 2, borderRadius: tokens.radius.lg,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: 200, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  coinEmoji: { fontSize: 26 },
  coinDelta: { fontSize: tokens.fontSize.lg, fontWeight: '800', marginTop: 2 },
  coinName: { color: tokens.color.text, fontSize: tokens.fontSize.xs, marginTop: 2 },

  captions: {
    position: 'absolute', left: tokens.spacing[5], right: tokens.spacing[5], gap: tokens.spacing[2],
  },
  userBubble: {
    alignSelf: 'flex-end', backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: tokens.radius.lg, maxWidth: '85%',
  },
  userText: { color: tokens.color.text, fontSize: tokens.fontSize.sm },
  palBubble: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(11,11,15,0.82)',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: tokens.radius.lg, maxWidth: '90%',
    borderWidth: 1, borderColor: tokens.color.accent,
  },
  palText: { color: tokens.color.text, fontSize: tokens.fontSize.md, lineHeight: 22, fontStyle: 'italic' },
  hint: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, textAlign: 'center' },

  controls: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing[5],
  },
  ctrlBtn: {
    width: 96, paddingVertical: tokens.spacing[3], borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.accent, alignItems: 'center', gap: 4,
  },
  ctrlBtnOff: { backgroundColor: 'rgba(11,11,15,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ctrlLabel: { fontSize: tokens.fontSize.xs, fontWeight: '700', color: tokens.color.text },
  ctrlLabelOn: { color: '#000' },
})
