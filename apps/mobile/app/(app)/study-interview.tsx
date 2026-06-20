import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Microphone, Stop } from 'phosphor-react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useGeminiLive } from '@/hooks/useGeminiLive'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

type TranscriptEntry = { role: string; text: string }

export default function StudyInterview() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [interviewId, setInterviewId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<{ brainsEarned: number; score?: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  const { phase, palLine, userLine, connect, stop, micOn, toggleMic } =
    useGeminiLive({ role: 'kid', mode: 'assist' })

  // Pulsing mic animation
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (phase === 'live' && micOn) {
      pulse.value = withRepeat(withTiming(1.3, { duration: 800 }), -1, true)
    } else {
      pulse.value = 1
    }
  }, [phase, micOn])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  // Start interview
  useEffect(() => {
    if (!topicId) return
    ;(async () => {
      try {
        const res = await api<{ interviewId: string; systemPrompt: string }>(
          `/study/topics/${topicId}/interview`,
          { method: 'POST' },
        )
        setInterviewId(res.interviewId)
        // Connect to live session
        await connect()
        // Start timer
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [topicId])

  // Track transcript from PAL/user lines
  const lastPalRef = useRef('')
  const lastUserRef = useRef('')
  useEffect(() => {
    if (palLine && palLine !== lastPalRef.current) {
      lastPalRef.current = palLine
      setTranscript((t) => {
        const last = t[t.length - 1]
        if (last?.role === 'tutor') return [...t.slice(0, -1), { role: 'tutor', text: palLine }]
        return [...t, { role: 'tutor', text: palLine }]
      })
    }
  }, [palLine])
  useEffect(() => {
    if (userLine && userLine !== lastUserRef.current) {
      lastUserRef.current = userLine
      setTranscript((t) => {
        const last = t[t.length - 1]
        if (last?.role === 'kid') return [...t.slice(0, -1), { role: 'kid', text: userLine }]
        return [...t, { role: 'kid', text: userLine }]
      })
    }
  }, [userLine])

  const handleEnd = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    await stop()
    setDone(true)
    if (!interviewId) return
    try {
      const res = await api<{ brainsEarned: number; score?: number }>(
        `/study/interviews/${interviewId}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ transcript, durationSecs: elapsed, score: 7 }),
        },
      )
      setResult(res)
    } catch {
      /* ignore */
    }
  }, [interviewId, transcript, elapsed, stop])

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <View style={[s.root, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.timer}>{formatTime(elapsed)}</Text>
        <Text style={s.phase}>
          {phase === 'live' ? '🟢 Live' : phase === 'connecting' ? '🔄 Connecting...' : ''}
        </Text>
      </View>

      {/* Avatar */}
      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          <Text style={s.avatarEmoji}>🎓</Text>
        </View>
        <Text style={s.avatarLabel}>Study Tutor</Text>
      </View>

      {/* Transcript */}
      <ScrollView
        ref={scrollRef}
        style={s.transcript}
        contentContainerStyle={{ paddingBottom: 20 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {transcript.map((entry, i) => (
          <View
            key={i}
            style={[s.bubble, entry.role === 'kid' ? s.bubbleKid : s.bubbleTutor]}
          >
            <Text style={s.bubbleText}>{entry.text}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Mic indicator */}
      {!done && (
        <View style={s.micArea}>
          <Animated.View style={[s.micRing, pulseStyle]}>
            <Pressable style={s.micBtn} onPress={toggleMic}>
              <Microphone
                size={28}
                color={micOn ? tokens.color.primary : tokens.color.textMuted}
                weight="fill"
              />
            </Pressable>
          </Animated.View>
          <Text style={s.micLabel}>{micOn ? 'Listening...' : 'Muted'}</Text>
        </View>
      )}

      {/* End / Result */}
      {!done ? (
        <Pressable style={s.endBtn} onPress={handleEnd}>
          <Stop size={18} color="#fff" weight="fill" />
          <Text style={s.endBtnText}>End Interview</Text>
        </Pressable>
      ) : (
        <View style={s.resultWrap}>
          {result ? (
            <>
              <Text style={s.resultTitle}>🎉 Interview Complete!</Text>
              <Text style={s.resultBrains}>+{result.brainsEarned} 🧠 earned</Text>
            </>
          ) : (
            <Text style={s.resultTitle}>Saving...</Text>
          )}
          <Pressable style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  timer: { fontSize: 20, fontWeight: '900', color: tokens.color.text },
  phase: { fontSize: 13, color: tokens.color.textMuted },
  avatarWrap: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: tokens.color.purple,
  },
  avatarEmoji: { fontSize: 36 },
  avatarLabel: { marginTop: 8, fontSize: 14, fontWeight: '700', color: tokens.color.text },
  transcript: { flex: 1, marginBottom: 12 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, marginBottom: 8, maxWidth: '85%' },
  bubbleTutor: { backgroundColor: tokens.color.surface, alignSelf: 'flex-start' },
  bubbleKid: { backgroundColor: tokens.color.purple + '22', alignSelf: 'flex-end' },
  bubbleText: { fontSize: 14, color: tokens.color.text, lineHeight: 20 },
  micArea: { alignItems: 'center', marginBottom: 16 },
  micRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: tokens.color.primary,
  },
  micBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  micLabel: { marginTop: 6, fontSize: 12, color: tokens.color.textMuted },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: tokens.color.danger, borderRadius: 16, paddingVertical: 14, marginBottom: 32,
  },
  endBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  resultWrap: { alignItems: 'center', marginBottom: 32 },
  resultTitle: { fontSize: 20, fontWeight: '900', color: tokens.color.text },
  resultBrains: { fontSize: 16, fontWeight: '700', color: tokens.color.positive, marginTop: 8 },
  doneBtn: { marginTop: 16, backgroundColor: tokens.color.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 12 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
