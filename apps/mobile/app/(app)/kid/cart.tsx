import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Bot, ShoppingBag, X } from 'lucide-react-native'
import { api } from '@/lib/api'
import { tokens } from '@/theme/tokens'

/**
 * Kid's cart screen.
 *
 * For Sprint 1 we don't persist cart items via the camera scan yet
 * (that's the existing camera.tsx job). The cart screen reads from
 * a local API endpoint that returns the kid's active cart_items rows.
 *
 * Empty state encourages scanning. When items exist, shows
 * net Brains effect, PAL basket comment, and a Pay CTA.
 */

type CartItem = {
  id: string
  itemName: string
  itemEmoji: string
  brainsDelta: number
  palQuote: string | null
}

export default function KidCart() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  // For now we read cart items via a yet-to-be-built endpoint. Fall back
  // to empty state until that endpoint exists.
  const { data, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      try {
        return await api<{ items: CartItem[] }>('/cart')
      } catch {
        return { items: [] }
      }
    },
    staleTime: 5_000,
  })

  const items = data?.items ?? []
  const netBrains = useMemo(() => items.reduce((sum, i) => sum + i.brainsDelta, 0), [items])
  const palComment = useMemo(() => generatePalComment(items), [items])

  if (isLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.topBar}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <ArrowLeft size={tokens.iconSize.xl} color={tokens.color.text} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.title}>Your cart</Text>
        <Text style={s.itemCount}>{items.length} items</Text>
      </View>

      {items.length === 0 ? (
        <View style={s.empty}>
          <ShoppingBag size={tokens.iconSize.hero} color={tokens.color.textMuted} strokeWidth={1.0} />
          <Text style={s.emptyTitle}>Your cart is empty</Text>
          <Text style={s.emptySub}>Scan something to add to your cart.</Text>
          <Pressable style={s.scanCta} onPress={() => router.push('/(app)/camera')}>
            <Text style={s.scanCtaText}>Scan now</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing[8] }}>
            {items.map((item) => (
              <View key={item.id} style={s.itemRow}>
                <Text style={s.itemEmoji}>{item.itemEmoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{item.itemName}</Text>
                  {item.palQuote ? <Text style={s.itemQuote}>"{item.palQuote}"</Text> : null}
                </View>
                <Text style={[s.itemDelta, { color: item.brainsDelta >= 0 ? tokens.color.accent : tokens.color.danger }]}>
                  {item.brainsDelta >= 0 ? '+' : ''}{item.brainsDelta} 🧠
                </Text>
                <Pressable hitSlop={8}>
                  <X size={tokens.iconSize.md} color={tokens.color.textMuted} strokeWidth={1.5} />
                </Pressable>
              </View>
            ))}

            {palComment && (
              <View style={s.palCard}>
                <Bot size={tokens.iconSize.md} color={tokens.color.accent} strokeWidth={1.5} />
                <Text style={s.palText}>"{palComment}"</Text>
              </View>
            )}

            <View style={s.summary}>
              <Text style={s.summaryLabel}>Net effect</Text>
              <Text style={[s.summaryValue, { color: netBrains >= 0 ? tokens.color.accent : tokens.color.danger }]}>
                {netBrains >= 0 ? '+' : '-'}${Math.abs(netBrains / 100).toFixed(2)}
              </Text>
            </View>
          </ScrollView>

          <View style={s.bottom}>
            <Pressable
              style={s.payCta}
              onPress={() => router.push('/(app)/kid/checkout-nfc')}
            >
              <Text style={s.payCtaText}>Pay with card →</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

function generatePalComment(items: CartItem[]): string | null {
  if (items.length === 0) return null
  if (items.length === 1) return null

  const goodCount = items.filter((i) => i.brainsDelta > 0).length
  const badCount = items.filter((i) => i.brainsDelta < 0).length

  if (goodCount > 0 && badCount > 0) return 'One good, one bad. Predictable.'
  if (badCount > goodCount) return `${badCount} junk items in here. Bold.`
  return 'Genuinely a healthy basket. Don\'t make it weird.'
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg, paddingHorizontal: tokens.spacing[5] },
  center: { justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing[3],
  },
  title: { color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '800' },
  itemCount: { color: tokens.color.textMuted, fontSize: tokens.fontSize.sm },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[3] },
  emptyTitle: { color: tokens.color.text, fontSize: tokens.fontSize.xl, fontWeight: '800' },
  emptySub: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md, textAlign: 'center', marginBottom: tokens.spacing[4] },
  scanCta: {
    height: 56, paddingHorizontal: tokens.spacing[6],
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  scanCtaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing[2],
  },
  itemEmoji: { fontSize: 28 },
  itemName: { color: tokens.color.text, fontSize: tokens.fontSize.md, fontWeight: '700' },
  itemQuote: { color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontStyle: 'italic', marginTop: 2 },
  itemDelta: { fontSize: tokens.fontSize.sm, fontWeight: '800' },

  palCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing[3],
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    marginVertical: tokens.spacing[3],
  },
  palText: { flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontStyle: 'italic', lineHeight: 20 },

  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing[4],
  },
  summaryLabel: { color: tokens.color.textMuted, fontSize: tokens.fontSize.md },
  summaryValue: { fontSize: tokens.fontSize.xl, fontWeight: '900' },

  bottom: {
    paddingTop: tokens.spacing[3],
  },
  payCta: {
    height: 56,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  payCtaText: { color: '#000', fontWeight: '800', fontSize: tokens.fontSize.md },
})
