import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Mic, MicOff, X } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { useFamilyStore } from '@/stores/family'
import { api } from '@/lib/api'
import { useRealtimeVoice, type RealtimePhase } from '@/hooks/useRealtimeVoice'
import { ChatBubble } from '@/components'
import { tokens } from '@/theme/tokens'

const AVATARS = ['👩‍🦰', '👨', '👩', '👴', '👵', '🧑']
const STYLES = [
  { id: 'chill', label: 'Chill', desc: 'Relaxed approach' },
  { id: 'balanced', label: 'Balanced', desc: 'Middle ground' },
  { id: 'strict', label: 'Strict', desc: 'High standards' },
]

/**
 * Real-time voice onboarding — like ChatGPT voice mode.
 *
 *   • PAL avatar pulses while speaking
 *   • Chat history scrolls above
 *   • Mic state shown at bottom (auto-listens after PAL speaks)
 *   • Voice activity detection auto-stops on silence
 *   • Conversation continues until persona is complete
 */
export default function VoiceOnboard() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const accountType = useAuthStore((s) => s.accountType)
  const setAccountType = useAuthStore((s) => s.setAccountType)
  const setFamily = useFamilyStore((s) => s.setFamily)

  const role: 'parent' | 'kid' = accountType === 'kid' ? 'kid' : 'parent'

  const onComplete = async (persona: Record<string, unknown>) => {
    // Persona was already persisted server-side. Just route forward.
    setAccountType(role)
    if (role === 'parent') {
      // Refresh family from server (might already exist).
      try {
        const fam = await api<{ family: { id: string; name: string; avatar: string | null } | null }>('/family')
        if (fam.family) setFamily(fam.family)
      } catch { /* ignore */ }

      // If no family yet, route to family-create. Otherwise parent home.
      router.replace('/(app)/parent')
    } else {
      router.replace('/(app)/kid')
    }
  }

  const {
    phase,
    level,
    chatHistory: conversation,
    connect,
    stop,
  } = useRealtimeVoice({ role, onComplete })

  // Detect what PAL is asking about to show visual helpers.
  const lastPalMessage = conversation.filter((m) => m.role === 'assistant').at(-1)?.content ?? ''
  const isAskingAvatar = /avatar|pick|choose|emoji/i.test(lastPalMessage)
  const isAskingStyle = /style|chill|balanced|strict/i.test(lastPalMessage)

  const AVATARS = ['👩‍🦰', '👨', '👩', '👴', '👵', '🧑']
  const STYLES = [
    { id: 'chill', label: 'Chill', desc: 'Relaxed approach' },
    { id: 'balanced', label: 'Balanced', desc: 'Middle ground' },
    { id: 'strict', label: 'Strict', desc: 'High standards' },
  ]

  // For realtime hook, visual selections are handled by the server VAD
  // The user can just speak their choice, or we show visual options as hints
  const sendText = (_text: string) => {
    // With realtime API, the user speaks — visual options are just hints
    // In future: inject text directly into the WebSocket session
  }

  const scrollRef = useRef<ScrollView>(null)
  const pulse = useRef(new Animated.Value(1)).current

  // Kick off conversation on mount.
  useEffect(() => {
    void connect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pulse animation while speaking or listening.
  useEffect(() => {
    if (phase === 'speaking' || phase === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start()
    } else {
      pulse.stopAnimation()
      pulse.setValue(1)
    }
  }, [phase, pulse])

  // Audio level scales avatar on top of pulse.
  const avatarScale = level > 0.05 ? 1 + level * 0.3 : 1

  // Auto-scroll conversation.
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [conversation.length])

  const onClose = async () => {
    await stop()
    router.back()
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top close button */}
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={onClose}>
          <X size={tokens.iconSize.xl} color={tokens.color.textMuted} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.statusLabel}>{phaseLabel(phase)}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Conversation history (scrolls above the avatar) */}
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {conversation.map((m, i) => (
          <ChatBubble key={i} from={m.role === 'user' ? 'user' : 'pal'}>
            {m.content}
          </ChatBubble>
        ))}
      </ScrollView>

      {/* Avatar picker — shown when PAL asks about avatar */}
      {isAskingAvatar && (
        <View style={s.pickerRow}>
          {AVATARS.map((emoji) => (
            <Pressable
              key={emoji}
              style={s.pickerBtn}
              onPress={() => void sendText(`I pick ${emoji}`)}
            >
              <Text style={s.pickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Style picker — shown when PAL asks about parenting style */}
      {isAskingStyle && (
        <View style={s.styleRow}>
          {STYLES.map((st) => (
            <Pressable
              key={st.id}
              style={s.styleBtn}
              onPress={() => void sendText(st.label)}
            >
              <Text style={s.styleBtnLabel}>{st.label}</Text>
              <Text style={s.styleBtnDesc}>{st.desc}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* PAL avatar + status */}
      <View style={s.avatarWrap}>
        {/* Outer pulse ring (only during listening/speaking) */}
        {(phase === 'listening' || phase === 'speaking') && (
          <Animated.View
            style={[
              s.pulseRing,
              {
                transform: [{ scale: pulse }],
                borderColor: phase === 'speaking' ? tokens.color.accent : tokens.color.purple,
              },
            ]}
          />
        )}

        {/* Avatar disc */}
        <Animated.View
          style={[
            s.avatar,
            {
              transform: [{ scale: avatarScale }],
              backgroundColor: phase === 'speaking' ? tokens.color.accent : tokens.color.purple,
            },
          ]}
        >
          <Text style={s.avatarChar}>P</Text>
        </Animated.View>
      </View>

      {/* Bottom mic indicator */}
      <View style={s.bottom}>
        {phase === 'no_permission' ? (
          <View style={s.micRow}>
            <MicOff size={tokens.iconSize.lg} color={tokens.color.danger} strokeWidth={1.5} />
            <Text style={s.permText}>Mic permission needed</Text>
          </View>
        ) : phase === 'listening' ? (
          <View style={s.micRow}>
            <Mic size={tokens.iconSize.lg} color={tokens.color.purple} strokeWidth={2} />
            <View style={s.levelBars}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={[
                    s.levelBar,
                    {
                      height: 4 + level * 28 * (1 - Math.abs(i - 2) * 0.2),
                      backgroundColor: level > i / 5 ? tokens.color.purple : tokens.color.surface2,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={s.listenText}>Listening...</Text>
          </View>
        ) : phase === 'speaking' ? (
          <View style={s.micRow}>
            <View style={[s.speakingDot, { backgroundColor: tokens.color.accent }]} />
            <Text style={s.listenText}>PAL is talking</Text>
          </View>
        ) : phase === 'processing' ? (
          <View style={s.micRow}>
            <Text style={s.listenText}>Processing...</Text>
          </View>
        ) : phase === 'connecting' ? (
          <View style={s.micRow}>
            <Text style={s.listenText}>Connecting...</Text>
          </View>
        ) : phase === 'done' ? (
          <View style={s.micRow}>
            <Text style={[s.listenText, { color: tokens.color.accent }]}>All set ✓</Text>
          </View>
        ) : (
          <View style={s.micRow}>
            <Text style={s.listenText}>{phase}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

function phaseLabel(phase: RealtimePhase): string {
  switch (phase) {
    case 'idle':          return ''
    case 'connecting':    return 'Connecting...'
    case 'ready':         return 'Ready'
    case 'listening':     return ''
    case 'processing':    return 'Processing...'
    case 'speaking':      return ''
    case 'done':          return ''
    case 'no_permission': return 'Mic blocked'
    case 'error':         return 'Connection error'
    default:              return ''
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  statusLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  avatarWrap: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    opacity: 0.4,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.color.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarChar: { color: '#fff', fontSize: 44, fontWeight: '900' },

  bottom: {
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[5],
    alignItems: 'center',
  },

  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    minHeight: 40,
  },

  levelBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
  },
  levelBar: {
    width: 4,
    borderRadius: 2,
  },

  speakingDot: {
    width: 12, height: 12, borderRadius: 6,
  },

  listenText: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '600' },
  permText: { color: tokens.color.danger, fontSize: tokens.fontSize.md, fontWeight: '600' },

  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    flexWrap: 'wrap',
  },
  pickerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmoji: { fontSize: 28 },

  styleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  styleBtn: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[3],
    alignItems: 'center',
    gap: 4,
  },
  styleBtnLabel: { color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '800' },
  styleBtnDesc: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, textAlign: 'center' },
})
