import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Buffer } from 'buffer'
import { Bot, ShoppingCart } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { tokens } from '@/theme/tokens'
import { Lottie } from '@/components/Lottie'
import { connectLive, type LiveSocket } from '@/lib/ws'
import { api } from '@/lib/api'
import { useCartStore } from '@/stores/cart'

const FRAME_INTERVAL_MS = 700
const FRAME_MAX_WIDTH = 384
const { width: SW, height: SH } = Dimensions.get('window')

// ─── Traffic light colours ────────────────────────────────────────────
const TL = {
  green: { ring: '#3DDC84', bg: '#0d2e1a', text: '#3DDC84', label: '🟢 Good choice' },
  amber: { ring: '#FFB627', bg: '#2e2200', text: '#FFB627', label: '🟡 Okay' },
  red:   { ring: '#FF5C5C', bg: '#2e0d0d', text: '#FF5C5C', label: '🔴 Think twice' },
} as const
type TrafficLight = keyof typeof TL

type Verdict = {
  trafficLight: TrafficLight
  ingredientsSummary: string
  whyBad?: string
  whyGood?: string
  healthContext: string
  estimatedPrice?: string
}

type Detection = {
  detectionId: string
  brand: string
  product: string
  coinDelta: number
  emoji: string
  anchor: [number, number]
  verdict?: Verdict
}

// ─── Fog wake animation ───────────────────────────────────────────────
function FogWake({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current
  const scale   = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 900, delay: 200, useNativeDriver: true }),
      Animated.timing(scale,   { toValue: 1.08, duration: 900, delay: 200, useNativeDriver: true }),
    ]).start(() => onDone())
  }, [])

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity, transform: [{ scale }], zIndex: 50 }]}
    >
      <View style={fog.outer} />
      <View style={fog.mid} />
      <View style={fog.inner} />
      <View style={fog.center} />
      <View style={fog.scanLine} />
    </Animated.View>
  )
}

const fog = StyleSheet.create({
  outer:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,15,0.92)' },
  mid:      { position: 'absolute', top: SH * 0.15, left: SW * 0.1, right: SW * 0.1, bottom: SH * 0.15,
               backgroundColor: 'rgba(61,220,132,0.06)', borderRadius: 999 },
  inner:    { position: 'absolute', top: SH * 0.3, left: SW * 0.2, right: SW * 0.2, bottom: SH * 0.3,
               backgroundColor: 'rgba(61,220,132,0.10)', borderRadius: 999 },
  center:   { position: 'absolute', top: SH * 0.42, left: SW * 0.35, right: SW * 0.35, bottom: SH * 0.42,
               backgroundColor: 'rgba(61,220,132,0.18)', borderRadius: 999 },
  scanLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 2,
               backgroundColor: 'rgba(61,220,132,0.5)' },
})

// ─── Ripple ring entrance ─────────────────────────────────────────────
function RippleRing({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(0.4)).current
  const opacity = useRef(new Animated.Value(0.8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 700, delay: 300, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 120, height: 120,
        marginLeft: -60, marginTop: -60,
        borderRadius: 60,
        borderWidth: 2.5,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  )
}

// ─── Coin badge ───────────────────────────────────────────────────────
function CoinBadge({
  detection,
  pos,
  onPress,
}: {
  detection: Detection
  pos: { left: string; top: string }
  onPress: () => void
}) {
  const scale   = useRef(new Animated.Value(0)).current
  const tl      = detection.verdict?.trafficLight ?? (detection.coinDelta >= 5 ? 'green' : detection.coinDelta <= -5 ? 'red' : 'amber')
  const colors  = TL[tl]
  const [rippleKey, setRippleKey] = useState(0)

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1, friction: 4, tension: 100, useNativeDriver: true,
    }).start()
    setRippleKey(k => k + 1)
  }, [detection.detectionId])

  return (
    <View style={{ position: 'absolute', left: pos.left as any, top: pos.top as any }}>
      <RippleRing key={rippleKey} color={colors.ring} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable onPress={onPress} style={[coin.wrap, { borderColor: colors.ring }]}>
          <View style={[coin.ring, { borderColor: colors.ring }]} />
          <Text style={[coin.delta, { color: colors.text }]}>
            {detection.coinDelta > 0 ? '+' : ''}{detection.coinDelta}
          </Text>
          <Text style={coin.unit}>🧠</Text>
          <Text style={coin.emoji}>{detection.emoji}</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const coin = StyleSheet.create({
  wrap: {
    width: 88, height: 88, marginLeft: -44, marginTop: -44,
    borderRadius: 44, borderWidth: 3,
    backgroundColor: 'rgba(11,11,15,0.88)',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  ring: {
    position: 'absolute', inset: 4, borderRadius: 40, borderWidth: 1.5,
    borderColor: 'transparent', opacity: 0.4,
  },
  delta: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  unit:  { fontSize: 13, lineHeight: 14 },
  emoji: { fontSize: 14, lineHeight: 16, marginTop: 1 },
})

// ─── Detail sheet ─────────────────────────────────────────────────────
function DetailSheet({
  detection,
  palLine,
  onClose,
  onBuy,
  onSkip,
}: {
  detection: Detection
  palLine: string
  onClose: () => void
  onBuy: () => void
  onSkip: () => void
}) {
  const insets  = useSafeAreaInsets()
  const slideY  = useRef(new Animated.Value(400)).current
  const tl      = detection.verdict?.trafficLight ?? 'amber'
  const colors  = TL[tl]
  const v       = detection.verdict

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }).start()
  }, [])

  const dismiss = () => {
    Animated.timing(slideY, { toValue: 500, duration: 220, useNativeDriver: true }).start(onClose)
  }

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <Pressable style={sheet.backdrop} onPress={dismiss} />
      <Animated.View style={[sheet.container, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideY }] }]}>
        <View style={sheet.handle} />
        <View style={[sheet.header, { backgroundColor: colors.bg }]}>
          <Text style={sheet.headerEmoji}>{detection.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[sheet.trafficLabel, { color: colors.text }]}>{colors.label}</Text>
            <Text style={sheet.itemName} numberOfLines={2}>
              {detection.brand} {detection.product}
            </Text>
          </View>
          <View style={[sheet.brainsBadge, { borderColor: colors.ring }]}>
            <Text style={[sheet.brainsNum, { color: colors.text }]}>
              {detection.coinDelta > 0 ? '+' : ''}{detection.coinDelta}
            </Text>
            <Text style={[sheet.brainsLabel, { color: colors.text }]}>Brains</Text>
          </View>
        </View>

        <ScrollView style={{ maxHeight: SH * 0.45 }} showsVerticalScrollIndicator={false}>
          {!!palLine && (
            <View style={sheet.palRow}>
              <Bot size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
              <Text style={sheet.palText}>"{palLine}"</Text>
            </View>
          )}
          {v?.estimatedPrice && (
            <View style={sheet.row}>
              <Text style={sheet.rowIcon}>💰</Text>
              <View>
                <Text style={sheet.rowLabel}>Estimated price</Text>
                <Text style={sheet.rowValue}>{v.estimatedPrice}</Text>
              </View>
            </View>
          )}
          {v?.ingredientsSummary ? (
            <View style={sheet.row}>
              <Text style={sheet.rowIcon}>🔬</Text>
              <View>
                <Text style={sheet.rowLabel}>What's in it</Text>
                <Text style={sheet.rowValue}>{v.ingredientsSummary}</Text>
              </View>
            </View>
          ) : null}
          {v?.whyBad && (
            <View style={[sheet.row, sheet.rowBad]}>
              <Text style={sheet.rowIcon}>⚠️</Text>
              <View>
                <Text style={[sheet.rowLabel, { color: TL.red.text }]}>Why it's not great</Text>
                <Text style={sheet.rowValue}>{v.whyBad}</Text>
              </View>
            </View>
          )}
          {v?.whyGood && (
            <View style={[sheet.row, sheet.rowGood]}>
              <Text style={sheet.rowIcon}>✅</Text>
              <View>
                <Text style={[sheet.rowLabel, { color: TL.green.text }]}>Why it's a good pick</Text>
                <Text style={sheet.rowValue}>{v.whyGood}</Text>
              </View>
            </View>
          )}
          {v?.healthContext && (
            <View style={sheet.row}>
              <Text style={sheet.rowIcon}>🧬</Text>
              <View>
                <Text style={sheet.rowLabel}>For you specifically</Text>
                <Text style={sheet.rowValue}>{v.healthContext}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={sheet.actions}>
          <Pressable style={[sheet.btn, sheet.skipBtn]} onPress={() => { dismiss(); onSkip() }}>
            <Text style={sheet.skipText}>Skip it  +2 🧠</Text>
          </Pressable>
          <Pressable style={[sheet.btn, sheet.buyBtn, { backgroundColor: colors.ring }]} onPress={() => { dismiss(); onBuy() }}>
            <Text style={sheet.buyText}>Add to cart  {detection.coinDelta > 0 ? '+' : ''}{detection.coinDelta} 🧠</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  )
}

const sheet = StyleSheet.create({
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  container:    { position: 'absolute', bottom: 0, left: 0, right: 0,
                   backgroundColor: tokens.color.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                   paddingHorizontal: 20, paddingTop: 12 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: tokens.color.surface2,
                   alignSelf: 'center', marginBottom: 16 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
                   borderRadius: tokens.radius.lg, marginBottom: 12 },
  headerEmoji:  { fontSize: 36 },
  trafficLabel: { fontSize: tokens.fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  itemName:     { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700', marginTop: 2 },
  brainsBadge:  { alignItems: 'center', borderWidth: 2, borderRadius: tokens.radius.md,
                   paddingHorizontal: 10, paddingVertical: 6, minWidth: 60 },
  brainsNum:    { fontSize: tokens.fontSize.lg, fontWeight: '800' },
  brainsLabel:  { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  palRow:       { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12,
                   backgroundColor: tokens.color.surface2, padding: 14, borderRadius: tokens.radius.md },
  palText:      { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic', lineHeight: 20 },
  row:          { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10,
                   backgroundColor: tokens.color.surface2, padding: 14, borderRadius: tokens.radius.md },
  rowBad:       { backgroundColor: 'rgba(255,92,92,0.08)' },
  rowGood:      { backgroundColor: 'rgba(61,220,132,0.08)' },
  rowIcon:      { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel:     { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '600',
                   textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  rowValue:     { color: tokens.color.text, fontSize: tokens.fontSize.sm, lineHeight: 20 },
  actions:      { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn:          { flex: 1, paddingVertical: 16, borderRadius: tokens.radius.pill, alignItems: 'center' },
  skipBtn:      { backgroundColor: tokens.color.surface2 },
  skipText:     { color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm },
  buyBtn:       {},
  buyText:      { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.sm },
})

// ─── Main screen ──────────────────────────────────────────────────────
export default function CameraScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const cartIncrement = useCartStore((s) => s.increment)
  const cartCount = useCartStore((s) => s.itemCount)

  const [perm, requestPerm] = useCameraPermissions()
  const cameraRef   = useRef<CameraView | null>(null)
  const sockRef     = useRef<LiveSocket | null>(null)
  const captureRef  = useRef<{ inFlight: boolean; cancelled: boolean }>({ inFlight: false, cancelled: false })
  const audioBufRef = useRef<Map<string, Uint8Array[]>>(new Map())
  const playingRef  = useRef<string | null>(null)
  const playerRef   = useRef<AudioPlayer | null>(null)

  const [connected,    setConnected]    = useState(false)
  const [cameraReady,  setCameraReady]  = useState(false)
  const [fogDone,      setFogDone]      = useState(false)
  // Multi-detection: map of detectionId → Detection
  const [detections,   setDetections]   = useState<Map<string, Detection>>(new Map())
  const [activeSheet,  setActiveSheet]  = useState<Detection | null>(null)
  const [palLines,     setPalLines]     = useState<Map<string, string>>(new Map())
  const [framesSent,   setFramesSent]   = useState(0)
  const [addedToast,   setAddedToast]   = useState<string | null>(null)

  useEffect(() => {
    if (!perm) return
    if (!perm.granted && perm.canAskAgain) requestPerm()
  }, [perm, requestPerm])

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false,
      interruptionMode: 'duckOthers', interruptionModeAndroid: 'duckOthers' }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!perm?.granted) return
    const sock = connectLive({
      onOpen:  () => setConnected(true),
      onClose: () => setConnected(false),
      onError: () => setConnected(false),
      onJson:  (msg) => handleJson(msg),
      onAudioChunk: (_seq, mp3) => {
        const id = playingRef.current
        if (!id) return
        const chunks = audioBufRef.current.get(id) ?? []
        chunks.push(mp3)
        audioBufRef.current.set(id, chunks)
      },
    })
    sockRef.current = sock
    return () => { captureRef.current.cancelled = true; sock.close(); sockRef.current = null }
  }, [perm?.granted])

  useEffect(() => {
    if (!perm?.granted || !cameraReady) return
    captureRef.current.cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (captureRef.current.cancelled) return
      if (!captureRef.current.inFlight && cameraRef.current && sockRef.current?.isOpen()) {
        captureRef.current.inFlight = true
        try {
          const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, shutterSound: false, exif: false })
          if (!photo?.uri) throw new Error('no uri')
          const shrunk = await ImageManipulator.manipulateAsync(
            photo.uri, [{ resize: { width: FRAME_MAX_WIDTH } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
          )
          const b64   = await FileSystem.readAsStringAsync(shrunk.uri, { encoding: FileSystem.EncodingType.Base64 })
          const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
          sockRef.current?.sendFrame(bytes)
          setFramesSent(n => n + 1)
          FileSystem.deleteAsync(photo.uri,  { idempotent: true }).catch(() => undefined)
          FileSystem.deleteAsync(shrunk.uri, { idempotent: true }).catch(() => undefined)
        } catch { /* silent */ } finally { captureRef.current.inFlight = false }
      }
      timer = setTimeout(tick, FRAME_INTERVAL_MS)
    }
    timer = setTimeout(tick, 400)
    return () => { captureRef.current.cancelled = true; if (timer) clearTimeout(timer) }
  }, [perm?.granted, cameraReady])

  function handleJson(msg: any) {
    switch (msg?.type) {
      case 'detection.appeared':
        setDetections(prev => {
          const next = new Map(prev)
          next.set(msg.detectionId, {
            detectionId: msg.detectionId,
            brand:       msg.brand ?? '',
            product:     msg.product ?? '',
            coinDelta:   msg.coinDelta ?? 0,
            emoji:       msg.emoji ?? '🛒',
            anchor:      msg.anchor ?? [0.5, 0.5],
            verdict:     msg.verdict,
          })
          return next
        })
        break
      case 'detection.updated':
        setDetections(prev => {
          const det = prev.get(msg.detectionId)
          if (!det) return prev
          const next = new Map(prev)
          next.set(msg.detectionId, { ...det, anchor: msg.anchor })
          return next
        })
        break
      case 'detection.cleared':
        setDetections(prev => {
          const next = new Map(prev)
          next.delete(msg.detectionId)
          return next
        })
        setActiveSheet(s => (s?.detectionId === msg.detectionId ? null : s))
        break
      case 'speech.started':
        playingRef.current = msg.detectionId
        audioBufRef.current.set(msg.detectionId, [])
        break
      case 'speech.ended':
        setPalLines(prev => {
          const next = new Map(prev)
          next.set(msg.detectionId, msg.text ?? '')
          return next
        })
        playSpeech(msg.detectionId).catch(() => undefined)
        break
    }
  }

  async function playSpeech(detectionId: string) {
    const chunks = audioBufRef.current.get(detectionId)
    if (!chunks?.length) return
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    audioBufRef.current.delete(detectionId)
    if (playingRef.current === detectionId) playingRef.current = null
    const path = `${FileSystem.cacheDirectory}pal-${detectionId}.mp3`
    await FileSystem.writeAsStringAsync(path, Buffer.from(buf).toString('base64'), { encoding: FileSystem.EncodingType.Base64 })
    if (playerRef.current) { try { playerRef.current.remove() } catch {} playerRef.current = null }
    const player = createAudioPlayer({ uri: path })
    playerRef.current = player
    player.play()
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s?.didJustFinish) {
        sub.remove()
        try { player.remove() } catch {}
        if (playerRef.current === player) playerRef.current = null
        FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)
      }
    })
  }

  const handleAddToCart = async (detection: Detection) => {
    sockRef.current?.sendInterrupt('tap')
    // Optimistically update badge
    cartIncrement()
    // Show toast
    setAddedToast(`${detection.emoji} ${detection.brand} ${detection.product}`)
    setTimeout(() => setAddedToast(null), 2500)
    // Invalidate cart query so cart screen refreshes
    queryClient.invalidateQueries({ queryKey: ['cart'] })
  }

  const detectionList = useMemo(() => Array.from(detections.values()), [detections])

  if (!perm) return <View style={s.bg} />
  if (!perm.granted) {
    return (
      <View style={[s.bg, s.center]}>
        <Text style={s.title}>Camera permission needed</Text>
        <Pressable style={s.btn} onPress={requestPerm}><Text style={s.btnText}>Grant access</Text></Pressable>
      </View>
    )
  }

  return (
    <View style={s.bg}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} />

      {/* fog wake — only until dismissed */}
      {!fogDone && <FogWake onDone={() => setFogDone(true)} />}

      {/* HUD */}
      <View style={[s.hud, { top: insets.top + tokens.spacing[3] }]}>
        <View style={[s.pill, { backgroundColor: connected ? tokens.color.accent : tokens.color.danger }]}>
          <Text style={s.pillText}>{connected ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {/* Cart button */}
        <Pressable style={s.cartBtn} onPress={() => router.push('/(app)/cart')}>
          <ShoppingCart size={20} color={tokens.color.text} strokeWidth={1.8} />
          {cartCount > 0 && (
            <View style={s.cartBadge}>
              <Text style={s.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Multi-item coin badges */}
      {detectionList.map((det) => {
        const [cx, cy] = det.anchor
        const pos = { left: `${Math.round(cx * 100)}%`, top: `${Math.round(cy * 100)}%` }
        return (
          <CoinBadge
            key={det.detectionId}
            detection={det}
            pos={pos}
            onPress={() => setActiveSheet(det)}
          />
        )
      })}

      {/* Scanning hint when nothing detected */}
      {detectionList.length === 0 && fogDone && (
        <View style={[s.scanFrame, { top: SH * 0.3, left: SW * 0.15, right: SW * 0.15, bottom: SH * 0.3 }]}>
          <View style={[s.scanCorner, s.scanTL]} />
          <View style={[s.scanCorner, s.scanTR]} />
          <View style={[s.scanCorner, s.scanBL]} />
          <View style={[s.scanCorner, s.scanBR]} />
        </View>
      )}

      {/* Bottom caption — shows all detected items */}
      <View style={[s.caption, { bottom: insets.bottom + tokens.spacing[5] }]}>
        {detectionList.length === 0 ? (
          <Text style={s.hint}>point at anything…</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 60 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {detectionList.map((det) => (
                <Pressable key={det.detectionId} style={s.captionChip} onPress={() => setActiveSheet(det)}>
                  <Text style={s.captionChipText}>{det.emoji} {det.brand} {det.product}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Added to cart toast */}
      {addedToast && (
        <View style={[s.toast, { top: insets.top + 64 }]}>
          <Text style={s.toastText}>✓ Added: {addedToast}</Text>
        </View>
      )}
      {addedToast && (
        <View pointerEvents="none" style={s.coinBurst}>
          <Lottie name="coinBurst" size={200} loop={false} />
        </View>
      )}

      {/* Detail sheet for selected item */}
      {activeSheet && (
        <DetailSheet
          detection={activeSheet}
          palLine={palLines.get(activeSheet.detectionId) ?? ''}
          onClose={() => setActiveSheet(null)}
          onBuy={() => { handleAddToCart(activeSheet); setActiveSheet(null) }}
          onSkip={() => setActiveSheet(null)}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: '#000' },
  center:   { justifyContent: 'center', alignItems: 'center', padding: tokens.spacing[5] },
  title:    { color: tokens.color.text, fontSize: tokens.fontSize.lg, marginBottom: tokens.spacing[4] },

  hud: {
    position: 'absolute', left: tokens.spacing[5], right: tokens.spacing[5],
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
  },
  pill:     { paddingVertical: 4, paddingHorizontal: 10, borderRadius: tokens.radius.pill },
  pillText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.xs, letterSpacing: 0.8 },

  cartBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(11,11,15,0.75)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  cartBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: '#000', fontSize: 10, fontWeight: '900' },

  // Scanning frame corners
  scanFrame: { position: 'absolute', borderRadius: 4 },
  scanCorner: {
    position: 'absolute', width: 24, height: 24,
    borderColor: 'rgba(61,220,132,0.7)', borderWidth: 0,
  },
  scanTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  scanTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  scanBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  scanBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },

  caption: {
    position: 'absolute', left: tokens.spacing[5], right: tokens.spacing[5],
    backgroundColor: 'rgba(0,0,0,0.6)', padding: tokens.spacing[3],
    borderRadius: tokens.radius.lg,
  },
  hint:     { color: tokens.color.textMuted, fontSize: tokens.fontSize.md },
  captionChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  captionChipText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },

  toast: {
    position: 'absolute', left: tokens.spacing[5], right: tokens.spacing[5],
    backgroundColor: tokens.color.accent,
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
  },
  toastText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.sm },

  coinBurst: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },

  btn:      { backgroundColor: tokens.color.accent, paddingHorizontal: tokens.spacing[5],
               paddingVertical: tokens.spacing[3], borderRadius: tokens.radius.pill },
  btnText:  { color: '#000', fontWeight: '700' },
})
