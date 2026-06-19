import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { CaretDown } from 'phosphor-react-native'
import { ChatSurface } from './ChatSurface'
import { MoneyPanel } from './MoneyPanel'
import { SurfacesDrawer } from './SurfacesDrawer'
import { haptic } from '@/lib/haptics'
import { kidTheme as t, shadow } from '@/theme/tokens'

const GRABBER_H = 30
const SPRING = { damping: 18, stiffness: 190, mass: 0.6 } as const
const TIMING = { duration: 240 } as const

/**
 * RevealHome — the chat-first home. The Pals chat fills the screen; two
 * surfaces are revealed by gesture:
 *   • swipe down from the top grabber → Money panel (top sheet)
 *   • swipe left from the right edge  → Surfaces drawer (right drawer)
 * Tap affordances (grabber tap, header menu button, scrim) mirror every
 * gesture so the model stays discoverable and works on web.
 *
 * Reanimated drives all motion on the UI thread; React state only tracks
 * which panel is open so the scrim can toggle hit-testing.
 */
export function RevealHome() {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const DRAWER_W = Math.min(width * 0.84, 380)
  const PANEL_H = Math.min(height * 0.74, 640)

  const money = useSharedValue(0)
  const drawer = useSharedValue(0)
  const moneyStart = useSharedValue(0)
  const drawerStart = useSharedValue(0)

  const [open, setOpen] = useState<'money' | 'drawer' | 'none'>('none')
  const scrimActive = open !== 'none'

  // ── JS-thread controls (buttons, navigation) ──────────────────────
  const syncState = useCallback((target: 'money' | 'drawer' | 'none') => {
    setOpen(target)
    if (target !== 'none') haptic.select()
  }, [])

  const openMoney = useCallback(() => {
    money.value = withSpring(1, SPRING)
    drawer.value = withTiming(0, TIMING)
    syncState('money')
  }, [money, drawer, syncState])

  const openDrawer = useCallback(() => {
    drawer.value = withSpring(1, SPRING)
    money.value = withTiming(0, TIMING)
    syncState('drawer')
  }, [money, drawer, syncState])

  const closeAll = useCallback(() => {
    money.value = withTiming(0, TIMING)
    drawer.value = withTiming(0, TIMING)
    setOpen('none')
  }, [money, drawer])

  const navigate = useCallback(
    (route: string) => {
      closeAll()
      // Let the close animation start before pushing.
      setTimeout(() => router.push(route as Parameters<typeof router.push>[0]), 60)
    },
    [closeAll, router],
  )

  // ── Gestures ───────────────────────────────────────────────────────
  const grabberPan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onBegin(() => {
      moneyStart.value = money.value
    })
    .onUpdate((e) => {
      money.value = Math.min(1, Math.max(0, moneyStart.value + e.translationY / PANEL_H))
    })
    .onEnd((e) => {
      const shouldOpen = money.value > 0.32 || e.velocityY > 600
      money.value = withSpring(shouldOpen ? 1 : 0, SPRING)
      if (shouldOpen) drawer.value = withTiming(0, TIMING)
      runOnJS(syncState)(shouldOpen ? 'money' : 'none')
    })

  const grabberTap = Gesture.Tap().maxDistance(10).onEnd(() => {
    runOnJS(openMoney)()
  })

  const grabberGesture = Gesture.Race(grabberPan, grabberTap)

  // Drag the panel's bottom handle up to dismiss.
  const panelClosePan = Gesture.Pan()
    .onBegin(() => {
      moneyStart.value = money.value
    })
    .onUpdate((e) => {
      money.value = Math.min(1, Math.max(0, moneyStart.value + e.translationY / PANEL_H))
    })
    .onEnd((e) => {
      const keepOpen = money.value > 0.6 && e.velocityY > -700
      money.value = withSpring(keepOpen ? 1 : 0, SPRING)
      runOnJS(syncState)(keepOpen ? 'money' : 'none')
    })

  // Right-edge swipe opens the drawer.
  const edgePan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      drawerStart.value = drawer.value
    })
    .onUpdate((e) => {
      drawer.value = Math.min(1, Math.max(0, drawerStart.value - e.translationX / DRAWER_W))
    })
    .onEnd((e) => {
      const shouldOpen = drawer.value > 0.32 || e.velocityX < -600
      drawer.value = withSpring(shouldOpen ? 1 : 0, SPRING)
      if (shouldOpen) money.value = withTiming(0, TIMING)
      runOnJS(syncState)(shouldOpen ? 'drawer' : 'none')
    })

  // Drag the drawer's left handle right to dismiss.
  const drawerClosePan = Gesture.Pan()
    .onBegin(() => {
      drawerStart.value = drawer.value
    })
    .onUpdate((e) => {
      drawer.value = Math.min(1, Math.max(0, drawerStart.value - e.translationX / DRAWER_W))
    })
    .onEnd((e) => {
      const keepOpen = drawer.value > 0.6 && e.velocityX < 700
      drawer.value = withSpring(keepOpen ? 1 : 0, SPRING)
      runOnJS(syncState)(keepOpen ? 'drawer' : 'none')
    })

  // ── Animated styles ─────────────────────────────────────────────────
  const chatStyle = useAnimatedStyle(() => {
    const p = Math.max(money.value, drawer.value)
    return {
      transform: [
        { translateX: interpolate(drawer.value, [0, 1], [0, -DRAWER_W * 0.16]) },
        { translateY: interpolate(money.value, [0, 1], [0, 44]) },
        { scale: interpolate(p, [0, 1], [1, 0.94]) },
      ],
      borderRadius: interpolate(p, [0, 1], [0, 28]),
    }
  })

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: Math.max(money.value, drawer.value) * 0.45,
  }))

  const moneyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(money.value, [0, 1], [-PANEL_H, 0]) }],
  }))

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drawer.value, [0, 1], [DRAWER_W, 0]) }],
  }))

  return (
    <View style={s.root}>
      {/* Chat (parallaxes back as panels open) */}
      <Animated.View style={[s.chat, chatStyle]}>
        <ChatSurface onOpenDrawer={openDrawer} topInset={insets.top + GRABBER_H} />
      </Animated.View>

      {/* Top grabber — pull down or tap to open the Money panel */}
      <GestureDetector gesture={grabberGesture}>
        <View style={[s.grabber, { paddingTop: insets.top, height: insets.top + GRABBER_H }]}>
          <View style={s.grabberPill} />
        </View>
      </GestureDetector>

      {/* Right-edge swipe zone for the drawer */}
      <GestureDetector gesture={edgePan}>
        <View style={[s.edgeZone, { top: insets.top + GRABBER_H, bottom: insets.bottom + 80 }]}>
          <View style={s.edgePill} />
        </View>
      </GestureDetector>

      {/* Scrim */}
      <Animated.View pointerEvents={scrimActive ? 'auto' : 'none'} style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAll} accessibilityLabel="Close panel" />
      </Animated.View>

      {/* Money panel — top sheet */}
      <Animated.View
        pointerEvents={open === 'money' ? 'auto' : 'none'}
        style={[s.moneyPanel, { height: PANEL_H, paddingTop: insets.top }, moneyStyle]}
      >
        <MoneyPanel onClose={closeAll} onNavigate={navigate} />
        {/* Bottom drag handle (pull up to dismiss) */}
        <GestureDetector gesture={panelClosePan}>
          <View style={[s.panelHandleZone, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={s.panelHandle} />
            <CaretDown size={16} color={t.color.textMuted} weight="bold" style={s.panelHandleCaret} />
          </View>
        </GestureDetector>
      </Animated.View>

      {/* Surfaces drawer — right drawer */}
      <Animated.View
        pointerEvents={open === 'drawer' ? 'auto' : 'none'}
        style={[s.drawer, { width: DRAWER_W, paddingTop: insets.top + t.spacing[2] }, drawerStyle]}
      >
        {/* Left drag handle (pull right to dismiss) */}
        <GestureDetector gesture={drawerClosePan}>
          <View style={s.drawerHandleZone}>
            <View style={s.drawerHandle} />
          </View>
        </GestureDetector>
        <View style={s.drawerBody}>
          <SurfacesDrawer onNavigate={navigate} onClose={closeAll} />
        </View>
      </Animated.View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.color.bg },
  chat: { flex: 1, overflow: 'hidden', backgroundColor: t.color.bg, zIndex: t.z.chat },

  grabber: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6,
    zIndex: t.z.grabber,
  },
  grabberPill: { width: 40, height: 5, borderRadius: 3, backgroundColor: t.color.surface2 },

  edgeZone: {
    position: 'absolute', right: 0, width: 22,
    alignItems: 'center', justifyContent: 'center',
    zIndex: t.z.grabber,
  },
  edgePill: { width: 4, height: 46, borderRadius: 2, backgroundColor: t.color.surface2 },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A1F1A', zIndex: t.z.scrim },

  moneyPanel: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: t.color.bg,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    zIndex: t.z.sheet, ...shadow.lg,
  },
  panelHandleZone: { alignItems: 'center', justifyContent: 'center', paddingTop: 6, gap: 2 },
  panelHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: t.color.surface2 },
  panelHandleCaret: { opacity: 0.6 },

  drawer: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    flexDirection: 'row',
    backgroundColor: t.color.bg,
    borderTopLeftRadius: 28, borderBottomLeftRadius: 28,
    zIndex: t.z.drawer, ...shadow.lg,
  },
  drawerHandleZone: { width: 22, alignItems: 'center', justifyContent: 'center' },
  drawerHandle: { width: 5, height: 46, borderRadius: 3, backgroundColor: t.color.surface2 },
  drawerBody: { flex: 1, paddingRight: t.spacing[2] },
})
