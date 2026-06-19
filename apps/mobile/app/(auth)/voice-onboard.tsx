import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Mic, MicOff, Sparkles, X } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { useFamilyStore } from '@/stores/family'
import { api } from '@/lib/api'
import { useRealtimeWebRTC, type RealtimePhase } from '@/hooks/useRealtimeWebRTC'
import { kidTheme as tokens } from '@/theme/tokens'

const { width } = Dimensions.get('window')

/**
 * Voice onboarding — ChatGPT voice mode style.
 *
 * On web (Expo web / browser) this immediately redirects to the HTTP TTS
 * chat-style onboarding (parent-onboarding.tsx) because:
 *   - expo-audio raw PCM streaming doesn't work in browsers
 *   - WebSocket mic capture requires getUserMedia which needs extra setup
 *
 * On native iOS/Android it uses the OpenAI Realtime WebSocket path.
 */
export default function VoiceOnboard() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const accountType = useAuthStore((s) => s.accountType)
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const setAccountType = useAuthStore((s) => s.setAccountType)
  const setPersona = useAuthStore((s) => s.setPersona)
  const setFamily = useFamilyStore((s) => s.setFamily)

  // Guard: already onboarded
  useEffect(() => {
    if (onboardingComplete) {
      router.replace('/(app)/(tabs)')
    }
  }, [onboardingComplete, accountType, router])

  // On web, skip the realtime path entirely — use the appropriate text-based flow
  useEffect(() => {
    if (Platform.OS === 'web') {
      router.replace(accountType === 'kid' ? '/(auth)/kid-persona' : '/(auth)/parent-onboarding')
    }
  }, [router, accountType])

  const role: 'parent' | 'kid' = accountType === 'kid' ? 'kid' : 'parent'
  const accentColor = role === 'parent' ? tokens.color.purple : tokens.color.accent

  const onComplete = async (persona: Record<string, unknown>) => {
    setAccountType(role)
    setPersona(persona)
    if (role === 'parent') {
      try {
        const fam = await api<{ family: { id: string; name: string; avatar: string | null } | null }>('/family')
        if (fam.family) setFamily(fam.family)
      } catch { /* ignore */ }
      router.replace('/(app)/(tabs)')
    } else {
      router.replace('/(app)/(tabs)')
    }
  }

  const {
    phase,
    level,
    chatHistory: conversation,
    connect,
    stop,
  } = useRealtimeWebRTC({ role, onComplete })

  // Mic denied OR webrtc unavailable (Expo Go / stale dev build) → text-based flow
  useEffect(() => {
    if (phase === 'no_permission' || phase === 'unsupported') {
      router.replace(role === 'kid' ? '/(auth)/kid-persona' : '/(auth)/parent-onboarding')
    }
  }, [phase, router, role])

  const scrollRef = useRef<ScrollView>(null)

  // Animated values
  const orbScale = useRef(new Animated.Value(1)).current
  const orbOpacity = useRef(new Animated.Value(0.6)).current
  const ring1Scale = useRef(new Animated.Value(1)).current
  const ring2Scale = useRef(new Animated.Value(1)).current
  const fadeIn = useRef(new Animated.Value(0)).current

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start()
    void connect()
  }, [])

  // Orb animation based on phase
  useEffect(() => {
    if (phase === 'speaking') {
      // Pulsing fast while PAL speaks
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.12, duration: 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.95, duration: 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start()
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring1Scale, { toValue: 1.4, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(ring1Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ).start()
      Animated.loop(
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(ring2Scale, { toValue: 1.6, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(ring2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ).start()
      Animated.timing(orbOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    } else if (phase === 'listening') {
      // Gentle breathing while listening
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.97, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start()
      orbScale.stopAnimation()
      ring1Scale.stopAnimation()
      ring2Scale.stopAnimation()
      ring1Scale.setValue(1)
      ring2Scale.setValue(1)
      Animated.timing(orbOpacity, { toValue: 0.85, duration: 300, useNativeDriver: true }).start()
    } else {
      orbScale.stopAnimation()
      ring1Scale.stopAnimation()
      ring2Scale.stopAnimation()
      Animated.timing(orbScale, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      Animated.timing(ring1Scale, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      Animated.timing(ring2Scale, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      Animated.timing(orbOpacity, { toValue: 0.6, duration: 300, useNativeDriver: true }).start()
    }
  }, [phase])

  // Audio level boosts orb scale while listening
  const liveScale = phase === 'listening' && level > 0.05 ? 1 + level * 0.25 : 1

  // Auto-scroll to latest message
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [conversation.length])

  const onClose = async () => {
    await stop()
    router.back()
  }

  const isSpeaking = phase === 'speaking'
  const isListening = phase === 'listening'
  const isConnecting = phase === 'connecting' || phase === 'idle'
  const isError = phase === 'error'

  return (
    <Animated.View style={[s.root, { opacity: fadeIn, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#FFFFFF', '#F3F4FA', '#EEF0FA']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Ambient glow behind orb */}
      <View style={[s.ambientGlow, { backgroundColor: accentColor + '18' }]} />

      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={onClose} style={s.closeBtn}>
          <X size={18} color={tokens.color.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={s.statusPill}>
          <View style={[s.statusDot, {
            backgroundColor: isSpeaking ? accentColor : isListening ? '#3DDC84' : tokens.color.surface2,
          }]} />
          <Text style={s.statusText}>{phaseLabel(phase)}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Conversation transcript — scrolls up */}
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {conversation.length === 0 && (
          <View style={s.emptyHint}>
            <Text style={s.emptyHintText}>
              {isConnecting ? 'Connecting to PAL...' : 'PAL will speak first — just listen'}
            </Text>
          </View>
        )}
        {conversation.map((m, i) => (
          <TranscriptBubble
            key={i}
            role={m.role}
            text={m.content}
            accent={accentColor}
          />
        ))}
      </ScrollView>

      {/* Central orb section */}
      <View style={s.orbSection}>
        {/* Ripple rings — only while speaking */}
        {isSpeaking && (
          <>
            <Animated.View style={[s.ring, s.ring1, {
              borderColor: accentColor + '30',
              transform: [{ scale: ring1Scale }],
            }]} />
            <Animated.View style={[s.ring, s.ring2, {
              borderColor: accentColor + '18',
              transform: [{ scale: ring2Scale }],
            }]} />
          </>
        )}

        {/* Main orb */}
        <Animated.View style={[s.orbWrap, {
          transform: [{ scale: Animated.multiply(orbScale, liveScale as unknown as Animated.Value) }],
          opacity: orbOpacity,
        }]}>
          <LinearGradient
            colors={isSpeaking
              ? [accentColor, accentColor + 'AA']
              : isListening
                ? ['#3DDC84', '#22C55E']
                : [tokens.color.surface, tokens.color.surface2]}
            style={s.orb}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Sparkles
            size={36}
            color={isSpeaking || isListening ? '#fff' : tokens.color.textMuted}
            strokeWidth={1.5}
          />
        </Animated.View>

        {/* Phase label under orb */}
        <Text style={[s.orbLabel, { color: isSpeaking ? accentColor : isListening ? '#3DDC84' : tokens.color.textMuted }]}>
          {isSpeaking ? 'PAL is speaking' : isListening ? 'Listening...' : phaseLabel(phase)}
        </Text>
      </View>

      {/* Bottom mic / level indicator */}
      <View style={s.bottom}>
        {phase === 'no_permission' || isError ? (
          <View style={s.errorRow}>
            <MicOff size={20} color={tokens.color.danger} strokeWidth={2} />
            <Text style={s.errorText}>
              {phase === 'no_permission' ? 'Microphone permission needed' : 'Connection error — tap to retry'}
            </Text>
            {isError && (
              <Pressable style={s.retryBtn} onPress={() => void connect()}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            )}
          </View>
        ) : isListening ? (
          <View style={s.micRow}>
            <Mic size={18} color="#3DDC84" strokeWidth={2} />
            <View style={s.levelBars}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                const barLevel = level * (1 - Math.abs(i - 3) * 0.15)
                const active = level > (i / 7)
                return (
                  <Animated.View
                    key={i}
                    style={[
                      s.levelBar,
                      {
                        height: 4 + barLevel * 32,
                        backgroundColor: active ? '#3DDC84' : tokens.color.surface2,
                      },
                    ]}
                  />
                )
              })}
            </View>
            <Text style={s.micLabel}>Listening</Text>
          </View>
        ) : isSpeaking ? (
          <View style={s.micRow}>
            <View style={s.speakingBars}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={[s.speakingBar, {
                    height: 6 + (i % 3) * 8,
                    backgroundColor: accentColor,
                    opacity: 0.6 + (i % 3) * 0.2,
                  }]}
                />
              ))}
            </View>
            <Text style={[s.micLabel, { color: accentColor }]}>PAL is talking</Text>
          </View>
        ) : (
          <View style={s.micRow}>
            <Text style={s.micLabel}>{isConnecting ? 'Starting up...' : ''}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  )
}

// ─── Transcript bubble ────────────────────────────────────────────────
function TranscriptBubble({ role, text, accent }: { role: 'user' | 'assistant'; text: string; accent: string }) {
  const isPal = role === 'assistant'
  return (
    <View style={[tb.row, isPal ? tb.palRow : tb.userRow]}>
      {isPal && (
        <View style={[tb.palDot, { backgroundColor: accent }]}>
          <Sparkles size={10} color="#fff" strokeWidth={2} />
        </View>
      )}
      <View style={[tb.bubble, isPal
        ? { backgroundColor: tokens.color.surface, borderColor: accent + '33' }
        : { backgroundColor: accent + '22', borderColor: accent + '44' }
      ]}>
        <Text style={[tb.text, { color: isPal ? tokens.color.text : '#fff' }]}>{text}</Text>
      </View>
    </View>
  )
}

const tb = StyleSheet.create({
  row: { marginBottom: tokens.spacing[3], maxWidth: '85%' },
  palRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  userRow: { alignSelf: 'flex-end' },
  palDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginBottom: 2,
  },
  bubble: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  text: { fontSize: tokens.fontSize.md, lineHeight: 22, fontWeight: '500' },
})

// ─── Helpers ──────────────────────────────────────────────────────────
function phaseLabel(phase: RealtimePhase): string {
  switch (phase) {
    case 'idle':          return 'Starting...'
    case 'connecting':    return 'Connecting...'
    case 'ready':         return 'Ready'
    case 'listening':     return 'Listening'
    case 'processing':    return 'Processing...'
    case 'speaking':      return 'Speaking'
    case 'done':          return 'Done'
    case 'no_permission': return 'Mic blocked'
    case 'error':         return 'Error'
    default:              return ''
  }
}

const s = StyleSheet.create({
  root: { flex: 1 },

  ambientGlow: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    top: '20%',
    left: '-10%',
    opacity: 0.5,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing[3], paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: tokens.color.textMuted, fontSize: 12, fontWeight: '600' },

  // Transcript scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[3],
    paddingBottom: tokens.spacing[4],
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyHint: {
    alignItems: 'center',
    paddingVertical: tokens.spacing[6],
  },
  emptyHintText: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Orb section
  orbSection: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  ring1: { width: 160, height: 160 },
  ring2: { width: 200, height: 200 },
  orbWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  orb: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
  },
  orbLabel: {
    marginTop: tokens.spacing[4],
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Bottom
  bottom: {
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[5],
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  micLabel: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  levelBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 40,
  },
  levelBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 4,
  },
  speakingBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 28,
  },
  speakingBar: {
    width: 4,
    borderRadius: 2,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  errorText: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
  },
  retryText: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '700' },
})
