import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Brain, Check, Fire, X } from 'phosphor-react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

const { width: SCREEN_W } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_W * 0.3

type Card = {
  id: string
  front: string
  back: string
  topicId: string
  status: string
  reviewCount: number
}

export default function StudyReview() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['study-cards-due'],
    queryFn: () => api<{ cards: Card[]; count: number }>('/study/cards/due'),
  })

  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [completed, setCompleted] = useState(0)

  const cards = data?.cards ?? []
  const card = cards[index]
  const total = cards.length

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current
  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] })
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] })

  const flip = () => {
    Animated.spring(flipAnim, {
      toValue: flipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start()
    setFlipped(!flipped)
  }

  // Swipe animation
  const pan = useRef(new Animated.ValueXY()).current
  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ['-15deg', '0deg', '15deg'] })

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, quality }: { cardId: string; quality: number }) =>
      api(`/study/cards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ quality }) }),
  })

  const handleSwipe = useCallback((quality: number) => {
    if (!card) return
    reviewMutation.mutate({ cardId: card.id, quality })
    setCompleted((c) => c + 1)

    // Reset for next card
    setFlipped(false)
    flipAnim.setValue(0)
    pan.setValue({ x: 0, y: 0 })
    setIndex((i) => i + 1)
  }, [card, reviewMutation, flipAnim, pan])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => flipped, // Only swipe when flipped (answer shown)
      onMoveShouldSetPanResponder: (_, g) => flipped && Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          // Swipe right = got it (quality 4)
          Animated.timing(pan, { toValue: { x: SCREEN_W + 100, y: g.dy }, duration: 200, useNativeDriver: true }).start(() => handleSwipe(4))
        } else if (g.dx < -SWIPE_THRESHOLD) {
          // Swipe left = didn't know (quality 1)
          Animated.timing(pan, { toValue: { x: -SCREEN_W - 100, y: g.dy }, duration: 200, useNativeDriver: true }).start(() => handleSwipe(1))
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  // Done state
  if (!isLoading && (index >= total || total === 0)) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.doneContainer}>
          <View style={s.doneIcon}>
            <Brain size={56} color={tokens.color.primary} weight="duotone" />
          </View>
          <Text style={s.doneTitle}>
            {total === 0 ? 'No cards due!' : 'All done! 🎉'}
          </Text>
          <Text style={s.doneSubtitle}>
            {total === 0
              ? 'Come back later when cards are due for review.'
              : `You reviewed ${completed} cards. Nice work!`}
          </Text>
          <Pressable style={s.doneBtn} onPress={() => { qc.invalidateQueries({ queryKey: ['study-stats'] }); router.back() }}>
            <Text style={s.doneBtnText}>Back to Study</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.primary} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={tokens.color.text} />
        </Pressable>
        <View style={s.progress}>
          <View style={[s.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
        </View>
        <Text style={s.counter}>{index + 1}/{total}</Text>
      </View>

      {/* Card */}
      <View style={s.cardArea} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            s.card,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { rotate },
              ],
            },
          ]}
        >
          <Pressable onPress={flip} style={s.cardInner}>
            {/* Front */}
            <Animated.View style={[s.cardFace, { transform: [{ rotateY: frontInterpolate }] }]}>
              <Text style={s.cardLabel}>Question</Text>
              <Text style={s.cardText}>{card?.front}</Text>
              <Text style={s.tapHint}>Tap to reveal answer</Text>
            </Animated.View>

            {/* Back */}
            <Animated.View style={[s.cardFace, s.cardBack, { transform: [{ rotateY: backInterpolate }] }]}>
              <Text style={s.cardLabel}>Answer</Text>
              <Text style={s.cardText}>{card?.back}</Text>
              <Text style={s.tapHint}>← Didn't know · Got it →</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>

        {/* Swipe indicators */}
        <Animated.View style={[s.swipeIndicator, s.swipeLeft, { opacity: pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
          <X size={32} color="#fff" weight="bold" />
          <Text style={s.swipeText}>Again</Text>
        </Animated.View>
        <Animated.View style={[s.swipeIndicator, s.swipeRight, { opacity: pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
          <Check size={32} color="#fff" weight="bold" />
          <Text style={s.swipeText}>Got it</Text>
        </Animated.View>
      </View>

      {/* Bottom buttons (alternative to swiping) */}
      {flipped && (
        <View style={s.buttons}>
          <Pressable style={[s.btn, s.btnFail]} onPress={() => handleSwipe(1)}>
            <X size={20} color="#fff" weight="bold" />
            <Text style={s.btnFailText}>Again</Text>
          </Pressable>
          <Pressable style={[s.btn, s.btnHard]} onPress={() => handleSwipe(2)}>
            <Text style={s.btnHardText}>Hard</Text>
          </Pressable>
          <Pressable style={[s.btn, s.btnGood]} onPress={() => handleSwipe(3)}>
            <Text style={s.btnGoodText}>Good</Text>
          </Pressable>
          <Pressable style={[s.btn, s.btnEasy]} onPress={() => handleSwipe(5)}>
            <Check size={20} color="#fff" weight="bold" />
            <Text style={s.btnEasyText}>Easy</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  progress: { flex: 1, height: 6, backgroundColor: tokens.color.surface2, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: tokens.color.primary, borderRadius: 3 },
  counter: { fontSize: 13, color: tokens.color.textMuted, fontWeight: '600', minWidth: 40, textAlign: 'right' },

  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 360, aspectRatio: 0.7 },
  cardInner: { flex: 1 },
  cardFace: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  cardBack: { backgroundColor: '#EEF9F4' },
  cardLabel: { fontSize: 12, fontWeight: '700', color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 1, position: 'absolute', top: 24 },
  cardText: { fontSize: 20, fontWeight: '600', color: tokens.color.text, textAlign: 'center', lineHeight: 30 },
  tapHint: { fontSize: 12, color: tokens.color.textMuted, position: 'absolute', bottom: 24 },

  swipeIndicator: { position: 'absolute', top: '35%', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  swipeLeft: { left: 10, backgroundColor: '#EF4444' },
  swipeRight: { right: 10, backgroundColor: tokens.color.primary },
  swipeText: { color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 4 },

  buttons: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnFail: { backgroundColor: '#EF4444' },
  btnFailText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnHard: { backgroundColor: '#F59E0B' },
  btnHardText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGood: { backgroundColor: '#3B82F6' },
  btnGoodText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnEasy: { backgroundColor: tokens.color.primary },
  btnEasyText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: tokens.color.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: tokens.color.text, marginBottom: 8 },
  doneSubtitle: { fontSize: 15, color: tokens.color.textMuted, textAlign: 'center', lineHeight: 22 },
  doneBtn: { marginTop: 32, height: 52, paddingHorizontal: 32, backgroundColor: tokens.color.primary, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
