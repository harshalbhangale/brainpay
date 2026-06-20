import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Brain, CheckCircle, XCircle } from 'phosphor-react-native'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

type Question = {
  question: string
  options: string[]
  correctAnswer: string
  concept: string
  kidAnswer?: string | null
  isCorrect?: boolean | null
}

type Quiz = {
  id: string
  questionCount: number
  questions: Question[]
}

type SubmitResult = {
  correctCount: number
  scorePct: number
  brainsEarned: number
  weakConcepts: string[]
  questions: Question[]
}

export default function StudyQuiz() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<{ questionIndex: number; answer: string }[]>([])
  const [result, setResult] = useState<SubmitResult | null>(null)

  const generateMutation = useMutation({
    mutationFn: () => api<{ quiz: Quiz }>(`/study/topics/${topicId}/quiz`, { method: 'POST' }),
    onSuccess: (data) => setQuiz(data.quiz),
  })

  const submitMutation = useMutation({
    mutationFn: (ans: { questionIndex: number; answer: string }[]) =>
      api<SubmitResult>(`/study/quizzes/${quiz!.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: ans }) }),
    onSuccess: (data) => setResult(data),
  })

  // Generate quiz on mount
  if (!quiz && !generateMutation.isPending && !generateMutation.isError) {
    generateMutation.mutate()
  }

  const handleAnswer = useCallback((answer: string) => {
    const newAnswers = [...answers, { questionIndex: currentIdx, answer }]
    setAnswers(newAnswers)

    if (currentIdx + 1 >= (quiz?.questionCount ?? 0)) {
      submitMutation.mutate(newAnswers)
    } else {
      setCurrentIdx((i) => i + 1)
    }
  }, [answers, currentIdx, quiz, submitMutation])

  // Loading state
  if (generateMutation.isPending) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.primary} size="large" />
        <Text style={s.loadingText}>Generating quiz...</Text>
      </View>
    )
  }

  // Error state
  if (generateMutation.isError) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <Text style={s.errorText}>Failed to generate quiz</Text>
        <Pressable style={s.retryBtn} onPress={() => generateMutation.mutate()}>
          <Text style={s.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  // Results screen
  if (result) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={tokens.color.text} />
          </Pressable>
          <Text style={s.headerTitle}>Quiz Results</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={s.resultsContent}>
          <View style={s.scoreCircle}>
            <Text style={s.scoreNum}>{result.scorePct}%</Text>
            <Text style={s.scoreLabel}>{result.correctCount}/{quiz!.questionCount} correct</Text>
          </View>

          {result.brainsEarned > 0 && (
            <View style={s.brainsRow}>
              <Brain size={24} color={tokens.color.coin} weight="duotone" />
              <Text style={s.brainsText}>+{result.brainsEarned} Brains earned!</Text>
            </View>
          )}

          {result.weakConcepts.length > 0 && (
            <View style={s.weakSection}>
              <Text style={s.weakTitle}>Areas to review:</Text>
              {result.weakConcepts.map((c, i) => (
                <Text key={i} style={s.weakItem}>• {c}</Text>
              ))}
            </View>
          )}

          <Pressable style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Back to Topic</Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }

  // Quiz question
  if (!quiz) return null
  const question = quiz.questions[currentIdx]

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={tokens.color.text} />
        </Pressable>
        <View style={s.progress}>
          <View style={[s.progressFill, { width: `${((currentIdx + 1) / quiz.questionCount) * 100}%` }]} />
        </View>
        <Text style={s.counter}>{currentIdx + 1}/{quiz.questionCount}</Text>
      </View>

      <ScrollView contentContainerStyle={s.questionContent}>
        <Text style={s.questionText}>{question.question}</Text>

        <View style={s.optionsContainer}>
          {question.options.map((opt, i) => (
            <Pressable
              key={i}
              style={s.optionBtn}
              onPress={() => handleAnswer(opt)}
              disabled={submitMutation.isPending}
            >
              <Text style={s.optionLetter}>{String.fromCharCode(65 + i)}</Text>
              <Text style={s.optionText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {submitMutation.isPending && (
        <View style={s.submittingOverlay}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={s.loadingText}>Grading...</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: tokens.color.text, textAlign: 'center' },
  progress: { flex: 1, height: 6, backgroundColor: tokens.color.surface2, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: tokens.color.primary, borderRadius: 3 },
  counter: { fontSize: 13, color: tokens.color.textMuted, fontWeight: '600', minWidth: 40, textAlign: 'right' },

  loadingText: { marginTop: 12, fontSize: 15, color: tokens.color.textMuted },
  errorText: { fontSize: 16, color: tokens.color.danger, marginBottom: 16 },
  retryBtn: { height: 44, paddingHorizontal: 24, backgroundColor: tokens.color.primary, borderRadius: 22, justifyContent: 'center' },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  questionContent: { padding: 24, paddingTop: 32 },
  questionText: { fontSize: 20, fontWeight: '700', color: tokens.color.text, lineHeight: 28, marginBottom: 32 },

  optionsContainer: { gap: 12 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: tokens.color.surface2,
  },
  optionLetter: { width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.color.surface2, textAlign: 'center', lineHeight: 32, fontSize: 14, fontWeight: '700', color: tokens.color.text },
  optionText: { flex: 1, fontSize: 16, color: tokens.color.text, lineHeight: 22 },

  resultsContent: { padding: 24, alignItems: 'center' },
  scoreCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: tokens.color.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  scoreNum: { fontSize: 36, fontWeight: '800', color: tokens.color.primary },
  scoreLabel: { fontSize: 13, color: tokens.color.textMuted, marginTop: 4 },

  brainsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, backgroundColor: tokens.color.coin + '15', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 },
  brainsText: { fontSize: 17, fontWeight: '700', color: tokens.color.coin },

  weakSection: { width: '100%', marginTop: 8, marginBottom: 24 },
  weakTitle: { fontSize: 15, fontWeight: '700', color: tokens.color.text, marginBottom: 8 },
  weakItem: { fontSize: 14, color: tokens.color.textMuted, lineHeight: 22 },

  doneBtn: { marginTop: 16, height: 52, paddingHorizontal: 32, backgroundColor: tokens.color.primary, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  submittingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(242,246,244,0.9)', justifyContent: 'center', alignItems: 'center' },
})
