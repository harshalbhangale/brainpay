import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Buffer } from 'buffer'
import { tokens } from '@/theme/tokens'
import { connectLive, type LiveSocket } from '@/lib/ws'

/**
 * BrainPal — Live camera prototype.
 * No auth. Targets api.zapfan.com by default.
 */

const FRAME_INTERVAL_MS = 4500 // ~13 RPM — fits the Gemini free tier (15 RPM cap)
const FRAME_MAX_WIDTH = 384

type Detection = {
  detectionId: string
  brand: string
  product: string
  coinDelta: number
  emoji: string
  anchor: [number, number]
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets()
  const [perm, requestPerm] = useCameraPermissions()
  const cameraRef = useRef<CameraView | null>(null)
  const sockRef = useRef<LiveSocket | null>(null)
  const captureRef = useRef<{ inFlight: boolean; cancelled: boolean }>({
    inFlight: false,
    cancelled: false,
  })
  const audioBufRef = useRef<Map<string, Uint8Array[]>>(new Map())
  const playingDetectionIdRef = useRef<string | null>(null)
  const playerRef = useRef<AudioPlayer | null>(null)

  const [connected, setConnected] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [detection, setDetection] = useState<Detection | null>(null)
  const [lastLine, setLastLine] = useState<string>('')
  const [framesSent, setFramesSent] = useState(0)
  const [lastError, setLastError] = useState<string>('')

  useEffect(() => {
    if (!perm) return
    if (!perm.granted && perm.canAskAgain) requestPerm()
  }, [perm, requestPerm])

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!perm?.granted) return

    const sock = connectLive({
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onError: () => setConnected(false),
      onJson: (msg) => handleJson(msg),
      onAudioChunk: (_seq, mp3) => {
        const id = playingDetectionIdRef.current
        if (!id) return
        const chunks = audioBufRef.current.get(id) ?? []
        chunks.push(mp3)
        audioBufRef.current.set(id, chunks)
      },
    })
    sockRef.current = sock
    return () => {
      captureRef.current.cancelled = true
      sock.close()
      sockRef.current = null
    }
  }, [perm?.granted])

  // Capture loop — gated on cameraReady so we don't fire takePictureAsync
  // before the native CameraView has finished initialising.
  useEffect(() => {
    if (!perm?.granted || !cameraReady) return
    captureRef.current.cancelled = false

    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (captureRef.current.cancelled) return
      if (!captureRef.current.inFlight && cameraRef.current && sockRef.current?.isOpen()) {
        captureRef.current.inFlight = true
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.5,
            shutterSound: false,
            exif: false,
          })
          if (!photo?.uri) {
            throw new Error('takePictureAsync returned no uri')
          }
          const shrunk = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: FRAME_MAX_WIDTH } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
          )
          const b64 = await FileSystem.readAsStringAsync(shrunk.uri, {
            encoding: FileSystem.EncodingType.Base64,
          })
          const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
          sockRef.current?.sendFrame(bytes)
          setFramesSent((n) => n + 1)
          setLastError('')
          FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => undefined)
          FileSystem.deleteAsync(shrunk.uri, { idempotent: true }).catch(() => undefined)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          // surface in Metro AND in HUD
          // eslint-disable-next-line no-console
          console.warn('frame capture failed:', msg)
          setLastError(msg.slice(0, 80))
        } finally {
          captureRef.current.inFlight = false
        }
      }
      timer = setTimeout(tick, FRAME_INTERVAL_MS)
    }

    timer = setTimeout(tick, 400)
    return () => {
      captureRef.current.cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [perm?.granted, cameraReady])

  function handleJson(msg: any) {
    switch (msg?.type) {
      case 'session.started':
        // eslint-disable-next-line no-console
        console.log('[PAL] session started:', msg.sessionId)
        break
      case 'detection.appeared':
        setDetection({
          detectionId: msg.detectionId,
          brand: msg.brand ?? '',
          product: msg.product ?? '',
          coinDelta: msg.coinDelta ?? 0,
          emoji: msg.emoji ?? '🛒',
          anchor: msg.anchor ?? [0.5, 0.5],
        })
        break
      case 'detection.updated':
        setDetection((d) => (d && d.detectionId === msg.detectionId ? { ...d, anchor: msg.anchor } : d))
        break
      case 'detection.cleared':
        setDetection((d) => (d?.detectionId === msg.detectionId ? null : d))
        break
      case 'speech.started':
        playingDetectionIdRef.current = msg.detectionId
        audioBufRef.current.set(msg.detectionId, [])
        break
      case 'speech.ended':
        setLastLine(msg.text ?? '')
        playSpeech(msg.detectionId).catch(() => undefined)
        break
    }
  }

  async function playSpeech(detectionId: string) {
    const chunks = audioBufRef.current.get(detectionId)
    if (!chunks || chunks.length === 0) return
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(total)
    let off = 0
    for (const c of chunks) {
      buf.set(c, off)
      off += c.length
    }
    audioBufRef.current.delete(detectionId)
    if (playingDetectionIdRef.current === detectionId) playingDetectionIdRef.current = null

    const path = `${FileSystem.cacheDirectory}pal-${detectionId}.mp3`
    await FileSystem.writeAsStringAsync(path, Buffer.from(buf).toString('base64'), {
      encoding: FileSystem.EncodingType.Base64,
    })

    if (playerRef.current) {
      try { playerRef.current.remove() } catch { /* ignore */ }
      playerRef.current = null
    }

    const player = createAudioPlayer({ uri: path })
    playerRef.current = player
    player.play()

    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status?.didJustFinish) {
        sub.remove()
        try { player.remove() } catch { /* ignore */ }
        if (playerRef.current === player) playerRef.current = null
        FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)
      }
    })
  }

  const overlayPos = useMemo(() => {
    if (!detection) return null
    const [cx, cy] = detection.anchor
    return {
      left: `${Math.round(cx * 100)}%`,
      top: `${Math.round(cy * 100)}%`,
    } as { left: `${number}%`; top: `${number}%` }
  }, [detection])

  if (!perm) return <View style={styles.bg} />
  if (!perm.granted) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.title}>Camera permission needed</Text>
        <Pressable style={styles.btn} onPress={requestPerm}>
          <Text style={styles.btnText}>Grant access</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.bg}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
      />

      {/* HUD top bar */}
      <View style={[styles.hud, { top: insets.top + tokens.spacing[3] }]}>
        <View style={[styles.pill, { backgroundColor: connected ? tokens.color.accent : tokens.color.danger }]}>
          <Text style={styles.pillText}>{connected ? 'live' : 'offline'}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: cameraReady ? tokens.color.accent : tokens.color.surface2 }]}>
          <Text style={styles.pillText}>{cameraReady ? 'cam ok' : 'cam wait'}</Text>
        </View>
        <Text style={styles.framesText}>{framesSent} frames</Text>
      </View>

      {!!lastError && (
        <View style={[styles.errBanner, { top: insets.top + tokens.spacing[3] + 36 }]}>
          <Text style={styles.errText} numberOfLines={2}>err: {lastError}</Text>
        </View>
      )}

      {detection && overlayPos && (
        <Pressable
          onPress={() => sockRef.current?.sendInterrupt('tap')}
          style={[
            styles.coin,
            {
              left: overlayPos.left,
              top: overlayPos.top,
              backgroundColor:
                detection.coinDelta > 0
                  ? tokens.color.accent
                  : detection.coinDelta < 0
                  ? tokens.color.danger
                  : tokens.color.surface2,
            },
          ]}
        >
          <Text style={styles.coinDelta}>
            {detection.coinDelta > 0 ? '+' : ''}
            {detection.coinDelta}
          </Text>
          <Text style={styles.coinEmoji}>{detection.emoji}</Text>
        </Pressable>
      )}

      <View style={[styles.caption, { bottom: insets.bottom + tokens.spacing[5] }]}>
        {detection ? (
          <Text style={styles.itemText}>
            {detection.emoji} {detection.brand} {detection.product}
          </Text>
        ) : (
          <Text style={styles.hintText}>point at anything…</Text>
        )}
        {!!lastLine && <Text style={styles.lineText}>“{lastLine}”</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: tokens.spacing[5] },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, marginBottom: tokens.spacing[4] },

  hud: {
    position: 'absolute',
    left: tokens.spacing[5],
    right: tokens.spacing[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.pill,
  },
  pillText: { color: '#000', fontWeight: '700', fontSize: tokens.fontSize.xs, textTransform: 'uppercase' },
  framesText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs },

  errBanner: {
    position: 'absolute',
    left: tokens.spacing[5],
    right: tokens.spacing[5],
    backgroundColor: 'rgba(255, 92, 92, 0.85)',
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.md,
  },
  errText: { color: '#000', fontSize: tokens.fontSize.xs, fontWeight: '600' },

  coin: {
    position: 'absolute',
    width: 84,
    height: 84,
    marginLeft: -42,
    marginTop: -42,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
  coinDelta: { color: '#000', fontSize: 22, fontWeight: '800' },
  coinEmoji: { fontSize: 18, marginTop: -2 },

  caption: {
    position: 'absolute',
    left: tokens.spacing[5],
    right: tokens.spacing[5],
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
  },
  itemText: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  hintText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md },
  lineText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, marginTop: 6, fontStyle: 'italic' },

  btn: {
    backgroundColor: tokens.color.accent,
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.pill,
  },
  btnText: { color: '#000', fontWeight: '700' },
})
