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
import { CircleCheck, CircleX, Clock } from 'lucide-react-native'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Join Request screen — shown when a kid taps "I'm a kid" on role-select.
 *
 * Two states:
 *   - Pending request exists → show accept/decline
 *   - No request yet         → show waiting state (parent hasn't added them yet)
 *
 * Kids come in via the direct flow: parent enters their phone in add-kid,
 * kid signs in and lands here. No invite codes.
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
  const accountType = useAuthStore((s) => s.accountType)
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)

  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // If already a kid with onboarding done, skip this screen entirely
    if (accountType === 'kid' && onboardingComplete) {
      router.replace('/(app)/(tabs)')
      return
    }

    // Check for pending join requests
    api<{ requests: JoinRequest[] }>('/join-requests/pending')
      .then(async (d) => {
        if (d.requests.length > 0) {
          setRequests(d.requests)
          setLoading(false)
          return
        }
        // No pending requests — check if already in a family
        try {
          const fam = await api<{ family: { id: string } | null }>('/family')
          if (fam.family) {
            // Already in a family — go straight to kid home
            setAccountType('kid')
            router.replace('/(app)/(tabs)')
            return
          }
        } catch { /* ignore — show waiting state */ }
        setLoading(false)
      })
      .catch(() => {
        setRequests([])
        setLoading(false)
      })
  }, [])

  const accept = async (req: JoinRequest) => {
    setAccepting(true)
    setError(null)
    try {
      await api(`/join-requests/${req.id}/accept`, { method: 'POST' })
      setAccountType('kid')
      // Route to kid persona wizard with seed data from the request
      router.replace({
        pathname: '/(auth)/kid-persona',
        params: { kidSeed: JSON.stringify(req.kidSeed) },
      })
    } catch {
      setError('Could not join. Try again.')
      setAccepting(false)
    }
  }

  const decline = async (req: JoinRequest) => {
    try {
      await api(`/join-requests/${req.id}/decline`, { method: 'POST' })
    } catch { /* ignore */ }
    setRequests((prev) => prev.filter((r) => r.id !== req.id))
  }

  if (loading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  // ── No pending request — waiting state ────────────────────────────
  if (requests.length === 0) {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, tokens.spacing[5]) }]}>
        <View style={s.content}>
          <View style={s.waitingIcon}>
            <Clock size={40} color={tokens.color.textMuted} strokeWidth={1.2} />
          </View>
          <Text style={s.title}>No request yet</Text>
          <Text style={s.waitingMessage}>
            Ask your parent to add you in BrainPal.{'\n'}
            They'll enter your phone number and you'll see the request here.
          </Text>
          <Text style={s.waitingHint}>
            Already asked them? Pull down to refresh or come back after they've added you.
          </Text>
        </View>
        <View style={s.actions}>
          <Pressable
            style={s.refreshBtn}
            onPress={() => {
              setLoading(true)
              api<{ requests: JoinRequest[] }>('/join-requests/pending')
                .then(async (d) => {
                  if (d.requests.length > 0) {
                    setRequests(d.requests)
                    setLoading(false)
                    return
                  }
                  // Check if already joined
                  try {
                    const fam = await api<{ family: { id: string } | null }>('/family')
                    if (fam.family) {
                      setAccountType('kid')
                      router.replace('/(app)/(tabs)')
                      return
                    }
                  } catch { /* ignore */ }
                  setLoading(false)
                })
                .catch(() => {
                  setRequests([])
                  setLoading(false)
                })
            }}
          >
            <Text style={s.refreshText}>Check again</Text>
          </Pressable>
          <Pressable
            style={s.backLink}
            onPress={() => router.replace('/(auth)/role-select')}
          >
            <Text style={s.backLinkText}>← Back</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // ── Pending request — accept/decline ─────────────────────────────
  const req = requests[0]

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, tokens.spacing[5]) }]}>
      <View style={s.content}>
        <Text style={s.familyAvatar}>{req.familyAvatar}</Text>
        <Text style={s.title}>You've been added!</Text>
        <Text style={s.message}>
          <Text style={s.parentName}>{req.parentAvatar} {req.parentName}</Text>
          {' '}wants to add you to{'\n'}
          <Text style={s.familyName}>{req.familyName}</Text>
        </Text>

        {req.initialTopup > 0 && (
          <View style={s.topupBadge}>
            <Text style={s.topupText}>+{req.initialTopup} 🧠 to start</Text>
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </View>

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

  // Waiting state
  waitingIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: tokens.spacing[2],
  },
  waitingMessage: {
    color: tokens.color.text, fontSize: tokens.fontSize.md,
    textAlign: 'center', lineHeight: 24,
    paddingHorizontal: tokens.spacing[3],
  },
  waitingHint: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.sm,
    textAlign: 'center', lineHeight: 20,
    paddingHorizontal: tokens.spacing[4],
  },
  refreshBtn: {
    height: 56, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  refreshText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  backLink: { alignItems: 'center', paddingVertical: tokens.spacing[3] },
  backLinkText: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, fontWeight: '600' },

  // Request state
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

  actions: { gap: tokens.spacing[3], paddingBottom: tokens.spacing[3], paddingTop: tokens.spacing[3] },
  acceptBtn: {
    height: 64, backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: tokens.spacing[2],
  },
  acceptText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.lg },
  declineBtn: {
    height: 56, backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: tokens.spacing[2],
  },
  declineText: { color: tokens.color.textMuted, fontWeight: '700', fontSize: tokens.fontSize.md },
})
