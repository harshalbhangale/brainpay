import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/lib/api'
import { env } from '@/lib/env'
import { useAuthStore } from '@/stores/auth'
import { tokens } from '@/theme/tokens'

/**
 * Invite accept — three sub-states:
 *   1. enter-code     (code not yet known — manual entry from role-select path)
 *   2. preview        (shows family + inviter + initial topup, accept button)
 *   3. accepting      (loading)
 *   4. error          (expired/used/network)
 *
 * On successful accept → kid persona wizard (pre-fills from kidSeed).
 */

type InvitePreview = {
  id: string
  code: string
  expectedRole: 'kid' | 'co_parent' | 'guardian'
  kidSeed: Record<string, unknown>
  initialTopup: number
  family: { id: string; name: string; avatar: string | null }
  inviter: { name: string; avatar: string }
  expiresAt: string
}

export default function InviteAccept() {
  const params = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const status = useAuthStore((s) => s.status)
  const setAccountType = useAuthStore((s) => s.setAccountType)

  const [code, setCode] = useState((params.code ?? '').toUpperCase())
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-fetch preview when we land here with a code in the deep link.
  useEffect(() => {
    if (params.code && !preview && !loading) {
      void fetchPreview((params.code as string).toUpperCase())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code])

  const fetchPreview = async (c: string) => {
    Keyboard.dismiss()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${env.apiBaseUrl}/invites/${c}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        if (body.error === 'expired') setError('That invite has expired. Ask for a new one.')
        else if (body.error === 'not_found_or_used') setError('Invite not found or already used.')
        else setError('Could not load this invite.')
        return
      }
      const data = (await res.json()) as { invite: InvitePreview }
      setPreview(data.invite)
    } catch {
      setError('Network problem. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const accept = async () => {
    if (!preview) return
    if (status !== 'authenticated') {
      // Need to phone+OTP first; carry the code through.
      router.replace({ pathname: '/(auth)/phone', params: { invite: preview.code } })
      return
    }
    setAccepting(true)
    try {
      const res = await api<{
        ok: boolean
        role: 'kid' | 'co_parent' | 'guardian'
        accountType: 'parent' | 'kid' | 'extended'
        kidSeed: Record<string, unknown>
      }>(`/invites/${preview.code}/accept`, { method: 'POST' })

      setAccountType(res.accountType)
      if (res.role === 'kid') {
        router.replace({
          pathname: '/(auth)/kid-persona',
          params: { kidSeed: JSON.stringify(res.kidSeed) },
        })
      } else {
        // Co-parent / guardian: small persona prompt then parent home
        router.replace('/(auth)/parent-persona')
      }
    } catch (err) {
      setError(String(err))
      setAccepting(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[4], paddingBottom: insets.bottom }]}>
        <Pressable hitSlop={16} onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>‹ Back</Text>
        </Pressable>

        {!preview && !loading && (
          <ScrollView
            style={s.flex}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.title}>Got an invite?</Text>
            <Text style={s.subtitle}>Enter the 8-character code from your text.</Text>
            <TextInput
              style={s.codeInput}
              placeholder="ABC12345"
              placeholderTextColor={tokens.color.textMuted}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => code.length === 8 && fetchPreview(code)}
            />
            {error && <Text style={s.error}>{error}</Text>}
            <Pressable
              style={[s.primary, code.length !== 8 && s.primaryDisabled]}
              onPress={() => fetchPreview(code)}
              disabled={code.length !== 8}
            >
              <Text style={s.primaryText}>Look up invite</Text>
            </Pressable>
          </ScrollView>
        )}

        {loading && (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.accent} />
          </View>
        )}

        {preview && (
          <View style={{ flex: 1 }}>
            <View style={s.preview}>
              <Text style={s.familyAvatar}>{preview.family.avatar ?? '🏡'}</Text>
              <Text style={s.familyName}>{preview.family.name}</Text>
              <Text style={s.invited}>
                <Text style={{ fontWeight: '800', color: tokens.color.text }}>
                  {preview.inviter.avatar} {preview.inviter.name}
                </Text>{' '}
                invited you
              </Text>
              {preview.initialTopup > 0 && (
                <View style={s.topupBadge}>
                  <Text style={s.topupText}>{preview.initialTopup} 🧠 to start</Text>
                </View>
              )}
            </View>

            {error && <Text style={s.error}>{error}</Text>}

            <View style={s.actions}>
              <Pressable
                style={[s.primary, accepting && s.primaryDisabled]}
                onPress={accept}
                disabled={accepting}
              >
                <Text style={s.primaryText}>
                  {accepting ? 'Joining…' : 'Accept'}
                </Text>
              </Pressable>
              <Pressable onPress={() => router.replace('/(auth)/welcome')}>
                <Text style={s.decline}>Decline</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  scrollContent: { flexGrow: 1, paddingBottom: tokens.spacing[4] },
  back: { paddingVertical: tokens.spacing[2] },
  backText: { color: tokens.color.text, fontSize: tokens.fontSize.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: {
    color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800',
    marginTop: tokens.spacing[5],
  },
  subtitle: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5],
  },
  codeInput: {
    backgroundColor: tokens.color.surface,
    height: 64, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.xl, fontWeight: '800',
    letterSpacing: 4, textAlign: 'center',
  },
  preview: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: tokens.spacing[5],
  },
  familyAvatar: { fontSize: 80 },
  familyName: {
    color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800',
    marginTop: tokens.spacing[3], textAlign: 'center',
  },
  invited: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md,
    marginTop: tokens.spacing[2], textAlign: 'center',
  },
  topupBadge: {
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[3],
    borderRadius: tokens.radius.pill, marginTop: tokens.spacing[5],
  },
  topupText: { color: tokens.color.accent, fontWeight: '800', fontSize: tokens.fontSize.md },
  actions: { gap: tokens.spacing[3], paddingBottom: tokens.spacing[5] },
  primary: {
    height: 56, backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
    marginTop: tokens.spacing[4],
  },
  primaryDisabled: { backgroundColor: tokens.color.surface2 },
  primaryText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
  decline: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.md,
    textAlign: 'center', paddingVertical: tokens.spacing[3],
  },
  error: {
    color: tokens.color.danger, fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[3], textAlign: 'center',
  },
})
