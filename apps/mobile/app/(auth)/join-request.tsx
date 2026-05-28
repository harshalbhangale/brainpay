import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CircleCheck, CircleX } from 'lucide-react-native'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Join Request screen — shown to a kid after login if a parent has
 * sent them a request to join a family.
 *
 * Kid sees: "Sarah wants to add you to Smith Family"
 * Taps Accept → added to family → voice onboarding
 * Taps Decline → goes to role-select
 */

type JoinRequest = {
  id: string
  familyId: string
  familyName: string
  familyAvatar: string
  parentName: string
  parentAvatar: string
  initialTopup: number
  kidSeed: Record<string, unknown>
}

export default function JoinRequestScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setAccountType = useAuthStore((s) => s.setAccountType)

  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ requests: JoinRequest[] }>('/join-requests/pending')
      .then((d) => setRequests(d.requests))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }, [])

  const accept = async (req: JoinRequest) => {
    setAccepting(true)
    setError(null)
    try {
      await api(`/join-requests/${req.id}/accept`, { method: 'POST' })
      setAccountType('kid')
      // Route to voice onboarding with kid context.
      router.replace('/(auth)/voice-onboard')
    } catch (err) {
      setError('Could not join. Try again.')
      setAccepting(false)
    }
  }

  const decline = async (req: JoinRequest) => {
    try {
      await api(`/join-requests/${req.id}/decline`, { method: 'POST' })
    } catch { /* ignore */ }
    // Remove from list.
    setRequests((prev) => prev.filter((r) => r.id !== req.id))
    if (requests.length <= 1) {
      router.replace('/(auth)/role-select')
    }
  }

  if (loading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  if (requests.length === 0) {
    // No pending requests — go to role select.
    router.replace('/(auth)/role-select')
    return null
  }

  const req = requests[0]

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.content}>
        {/* Family avatar */}
        <Text style={s.familyAvatar}>{req.familyAvatar}</Text>

        {/* Message */}
        <Text style={s.title}>You've been invited!</Text>
        <Text style={s.message}>
          <Text style={s.parentName}>{req.parentAvatar} {req.parentName}</Text>
          {' '}wants to add you to{'\n'}
          <Text style={s.familyName}>{req.familyName}</Text>
        </Text>

        {/* Starting Brains */}
        {req.initialTopup > 0 && (
          <View style={s.topupBadge}>
            <Text style={s.topupText}>+{req.initialTopup} 🧠 to start</Text>
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <Pressable
          style={[s.acceptBtn, accepting && { opacity: 0.6 }]}
          onPress={() => accept(req)}
          disabled={accepting}
        >
          {accepting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <CircleCheck size={tokens.iconSize.lg} color="#000" strokeWidth={2} />
              <Text style={s.acceptText}>Accept</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={s.declineBtn}
          onPress={() => decline(req)}
          disabled={accepting}
        >
          <CircleX size={tokens.iconSize.lg} color={tokens.color.textMuted} strokeWidth={1.5} />
          <Text style={s.declineText}>Decline</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[4] },

  familyAvatar: { fontSize: 80 },

  title: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', textAlign: 'center' },

  message: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.lg,
    textAlign: 'center', lineHeight: 28,
  },
  parentName: { color: tokens.color.text, fontWeight: '700' },
  familyName: { color: tokens.color.accent, fontWeight: '800' },

  topupBadge: {
    backgroundColor: tokens.color.accent + '22',
    paddingHorizontal: tokens.spacing[5], paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.pill,
    borderWidth: 1, borderColor: tokens.color.accent + '44',
  },
  topupText: { color: tokens.color.accent, fontWeight: '800', fontSize: tokens.fontSize.lg },

  error: { color: tokens.color.danger, fontSize: tokens.fontSize.sm, textAlign: 'center' },

  actions: { gap: tokens.spacing[3], paddingBottom: tokens.spacing[5] },

  acceptBtn: {
    height: 64,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: tokens.spacing[2],
  },
  acceptText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.lg },

  declineBtn: {
    height: 56,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: tokens.spacing[2],
  },
  declineText: { color: tokens.color.textMuted, fontWeight: '700', fontSize: tokens.fontSize.md },
})
