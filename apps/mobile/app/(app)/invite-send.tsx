import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
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
import { Camera, ChevronRight, Link, Mail, MessageSquare } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import QRCode from 'react-native-qrcode-svg'
import { api } from '@/lib/api'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Invite send — choose SMS or QR.
 *
 * Receives params from add-kid: inviteId, code, link, qrData, kidName, kidAvatar.
 * SMS path posts to /invites/:id/send-sms. QR path just renders the QR for
 * the kid to scan in person.
 */

type Mode = 'pick' | 'sms' | 'qr' | 'sent'

export default function InviteSend() {
  const params = useLocalSearchParams<{
    inviteId?: string
    code?: string
    link?: string
    qrData?: string
    kidName?: string
    kidAvatar?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<Mode>('pick')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)

  const kidName = params.kidName ?? 'Your kid'
  const kidAvatar = params.kidAvatar ?? '🧒'

  if (!params.inviteId || !params.code) {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={s.title}>Missing invite details</Text>
        <Pressable style={s.primary} onPress={() => router.replace('/(app)/(tabs)')}>
          <Text style={s.primaryText}>Back to home</Text>
        </Pressable>
      </View>
    )
  }

  const sendSms = async () => {
    if (!phone.trim()) return
    Keyboard.dismiss()
    setSending(true)
    try {
      await api(`/invites/${params.inviteId}/send-sms`, {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim() }),
      })
      setMode('sent')
    } catch (err) {
      Alert.alert("Couldn't send", String(err))
    } finally {
      setSending(false)
    }
  }

  const copyLink = async () => {
    if (!params.link) return
    await Clipboard.setStringAsync(params.link)
    Alert.alert('Copied', 'Link copied to clipboard.')
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top + tokens.spacing[3], paddingBottom: insets.bottom }]}>
        <Pressable hitSlop={16} onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ Back</Text>
        </Pressable>

        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Kid header */}
          <View style={s.header}>
            <Text style={s.headerEmoji}>{kidAvatar}</Text>
            <Text style={s.headerName}>{kidName}</Text>
            <Text style={s.headerSub}>Invite ready · {params.code}</Text>
          </View>

          {mode === 'pick' && (
            <View style={s.modeList}>
              <Pressable style={s.modeCard} onPress={() => setMode('sms')}>
                <MessageSquare size={tokens.iconSize.xl} color={tokens.color.accent} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={s.modeTitle}>Send by SMS</Text>
                  <Text style={s.modeDesc}>Text them a link they can tap.</Text>
                </View>
                <ChevronRight size={tokens.iconSize.md} color={tokens.color.textMuted} strokeWidth={1.5} />
              </Pressable>

              <Pressable style={s.modeCard} onPress={() => setMode('qr')}>
                <Camera size={tokens.iconSize.xl} color={tokens.color.accent} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={s.modeTitle}>Show a QR</Text>
                  <Text style={s.modeDesc}>Scan it from their phone.</Text>
                </View>
                <ChevronRight size={tokens.iconSize.md} color={tokens.color.textMuted} strokeWidth={1.5} />
              </Pressable>

              <Pressable style={[s.modeCard, s.modeCardMuted]} onPress={copyLink}>
                <Link size={tokens.iconSize.xl} color={tokens.color.textMuted} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={s.modeTitle}>Copy link</Text>
                  <Text style={s.modeDesc}>Paste it anywhere.</Text>
                </View>
                <ChevronRight size={tokens.iconSize.md} color={tokens.color.textMuted} strokeWidth={1.5} />
              </Pressable>
            </View>
          )}

          {mode === 'sms' && (
            <View style={s.smsView}>
              <Text style={s.title}>Their phone number</Text>
              <Text style={s.subtitle}>We'll text them the invite link.</Text>
              <TextInput
                style={s.input}
                placeholder="+61 412 345 678"
                placeholderTextColor={tokens.color.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                autoFocus
                textContentType="telephoneNumber"
                returnKeyType="done"
                onSubmitEditing={sendSms}
              />
              <Pressable
                style={[s.primary, (!phone.trim() || sending) && s.primaryDisabled]}
                onPress={sendSms}
                disabled={!phone.trim() || sending}
              >
                <Text style={s.primaryText}>{sending ? 'Sending…' : 'Send invite'}</Text>
              </Pressable>
            </View>
          )}

          {mode === 'qr' && (
            <View style={s.qrView}>
              <View style={s.qrFrame}>
                <QRCode value={params.qrData ?? params.code ?? ''} size={240} backgroundColor="#fff" color="#000" />
              </View>
              <Text style={s.qrCaption}>
                Open BrainPay on their phone, pick "I have an invite", and scan this code.
              </Text>
              <Text style={s.qrCode}>or enter code: {params.code}</Text>
            </View>
          )}

          {mode === 'sent' && (
            <View style={s.sentView}>
              <Mail size={tokens.iconSize.hero} color={tokens.color.accent} strokeWidth={1.0} />
              <Text style={s.title}>Invite sent</Text>
              <Text style={s.subtitle}>
                They'll get a text shortly. Their card will appear on your home as soon as they accept.
              </Text>
              <Pressable style={s.primary} onPress={() => router.replace('/(app)/(tabs)')}>
                <Text style={s.primaryText}>Back to home</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.color.bg },
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  scrollContent: { flexGrow: 1, paddingBottom: tokens.spacing[5] },
  backBtn: { paddingVertical: tokens.spacing[2] },
  backText: { color: tokens.color.text, fontSize: tokens.fontSize.md },
  header: { alignItems: 'center', paddingVertical: tokens.spacing[5] },
  headerEmoji: { fontSize: 64 },
  headerName: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800', marginTop: tokens.spacing[2] },
  headerSub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, marginTop: tokens.spacing[1] },

  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  subtitle: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5] },

  modeList: { gap: tokens.spacing[3] },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface, padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
  },
  modeCardMuted: { opacity: 0.85 },
  modeTitle: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '800' },
  modeDesc: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 },

  smsView: { paddingTop: tokens.spacing[3] },
  input: {
    backgroundColor: tokens.color.surface,
    height: 56, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg, fontWeight: '600',
    marginBottom: tokens.spacing[4],
  },

  qrView: { alignItems: 'center', paddingVertical: tokens.spacing[5] },
  qrFrame: {
    padding: tokens.spacing[4],
    backgroundColor: '#fff',
    borderRadius: tokens.radius.lg,
  },
  qrCaption: {
    color: tokens.color.text, fontSize: tokens.fontSize.md,
    textAlign: 'center', marginTop: tokens.spacing[5],
    paddingHorizontal: tokens.spacing[4], lineHeight: 22,
  },
  qrCode: {
    color: tokens.color.textMuted, fontSize: tokens.fontSize.sm,
    marginTop: tokens.spacing[3], letterSpacing: 2, fontWeight: '700',
  },

  sentView: { alignItems: 'center', paddingTop: tokens.spacing[5], gap: tokens.spacing[3] },

  primary: {
    height: 56, backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
    marginTop: tokens.spacing[4],
  },
  primaryDisabled: { backgroundColor: tokens.color.surface2 },
  primaryText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
