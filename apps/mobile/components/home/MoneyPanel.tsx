import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowsClockwise,
  ClipboardText,
  Plus,
  Receipt,
  Scan,
  Sparkle,
  Target,
  Users,
  X,
} from 'phosphor-react-native'
import { api } from '@/lib/api'
import { useWallet } from '@/hooks/useWallet'
import { useFamily } from '@/hooks/useFamily'
import { useChores } from '@/hooks/useChores'
import { useAuthStore } from '@/stores/auth'
import { PayCard, heroColors, StatTile } from '@/components/dashboard'
import { kidTheme as t, shadow } from '@/theme/tokens'

type Goal = { id: string; targetBrains: number; currentBrains: number; status: string }

/**
 * Money panel — the swipe-down surface. Card + balance + quick stats, with
 * deeper money screens one tap away. Role-aware: parents see their wallet and
 * approval load; kids see their hero card, Brain Points and goal progress.
 *
 * Purely presentational chrome; `RevealHome` owns the slide/drag animation.
 */
export function MoneyPanel({
  onClose,
  onNavigate,
}: {
  onClose: () => void
  onNavigate: (route: string) => void
}) {
  const accountType = useAuthStore((s) => s.accountType)
  const accountId = useAuthStore((s) => s.accountId)
  const role = accountType === 'kid' ? 'kid' : 'parent'

  const { data: famData } = useFamily()
  const { data: walletData } = useWallet()
  const { data: choresData } = useChores()
  const { data: goalsData } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api<{ goals: Goal[] }>('/goals'),
    staleTime: 10_000,
  })

  const me = famData?.members.find((m) => m.accountId === accountId)
  const persona = (me?.persona ?? {}) as { name?: string; color?: string }
  const balanceCents = walletData?.balance ?? me?.cachedBalance ?? 0
  const balance = balanceCents / 100
  const last4 = (accountId ?? '').replace(/\D/g, '').slice(-4) || (role === 'kid' ? '2734' : '0001')

  const activeGoal = (goalsData?.goals ?? []).find((g) => g.status === 'active')
  const awayFromGoal = activeGoal ? Math.max(0, activeGoal.targetBrains - activeGoal.currentBrains) : null

  const kids = (famData?.members ?? []).filter((m) => m.role === 'kid')
  const toApprove = useMemo(
    () => (choresData?.chores ?? []).filter((c) => ['submitted', 'ai_approved', 'ai_uncertain'].includes(c.status)).length,
    [choresData],
  )
  const missionsInProgress = useMemo(
    () => (choresData?.chores ?? []).filter((c) => ['pending', 'submitted', 'ai_approved', 'ai_uncertain'].includes(c.status)).length,
    [choresData],
  )

  return (
    <View style={s.sheet}>
      <View style={s.headerRow}>
        <Text style={s.heading}>{role === 'kid' ? 'My money' : 'Wallet'}</Text>
        <Pressable hitSlop={10} onPress={onClose} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
          <X size={18} color={t.color.textMuted} weight="bold" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
        <PayCard
          name={persona.name ?? (role === 'kid' ? 'You' : 'Parent')}
          last4={last4}
          balance={balance}
          colors={heroColors(persona.color ?? t.color.primary)}
          brand="BRAINPAL"
          tier={role === 'kid' ? 'Hero' : 'Parent'}
          onPress={() => onNavigate('/(app)/transactions')}
        />

        <Text style={s.section}>QUICK STATS</Text>
        {role === 'kid' ? (
          <View style={s.statRow}>
            <StatTile
              icon={Sparkle}
              label="Points"
              value={balanceCents.toLocaleString()}
              subtitle="Brain Score"
              tint={t.color.accent}
              onPress={() => onNavigate('/(app)/transactions')}
            />
            <StatTile
              icon={Target}
              label="To goal"
              value={awayFromGoal !== null ? `$${(awayFromGoal / 100).toFixed(0)}` : '—'}
              subtitle={activeGoal ? 'Keep saving' : 'No goal yet'}
              tint={t.color.purple}
              onPress={() => onNavigate('/(app)/goals')}
            />
          </View>
        ) : (
          <View style={s.statRow}>
            <StatTile
              icon={Users}
              label="Kids"
              value={`${kids.length}`}
              subtitle={kids.length === 1 ? 'On board' : 'In your family'}
              tint={t.color.blue}
              onPress={() => onNavigate('/(app)/dashboard')}
            />
            <StatTile
              icon={ClipboardText}
              label="Approve"
              value={`${toApprove}`}
              subtitle={toApprove ? 'Waiting on you' : 'All clear'}
              tint={t.color.orange}
              onPress={() => onNavigate('/(app)/parent-chores')}
            />
          </View>
        )}

        <Text style={s.section}>QUICK ACTIONS</Text>
        <View style={s.actionRow}>
          {role === 'kid' ? (
            <>
              <PanelAction icon={Scan} label="Scan" onPress={() => onNavigate('/(app)/camera')} />
              <PanelAction icon={ClipboardText} label="Missions" badge={missionsInProgress} onPress={() => onNavigate('/(app)/chores')} />
              <PanelAction icon={Receipt} label="History" onPress={() => onNavigate('/(app)/transactions')} />
            </>
          ) : (
            <>
              <PanelAction icon={Plus} label="Add money" filled onPress={() => onNavigate('/(app)/topup')} />
              <PanelAction icon={Receipt} label="History" onPress={() => onNavigate('/(app)/transactions')} />
              <PanelAction icon={ArrowsClockwise} label="Autofund" onPress={() => onNavigate('/(app)/topup')} />
            </>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [s.dashboardLink, pressed && { opacity: 0.85 }]}
          onPress={() => onNavigate('/(app)/dashboard')}
        >
          <Text style={s.dashboardLinkText}>View full dashboard</Text>
          <Text style={s.dashboardChevron}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function PanelAction({
  icon: Icon,
  label,
  filled,
  badge,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; weight?: 'duotone' | 'fill' | 'bold' }>
  label: string
  filled?: boolean
  badge?: number
  onPress: () => void
}) {
  return (
    <Pressable style={s.action} onPress={onPress}>
      <View style={[s.actionIcon, filled ? s.actionIconFilled : s.actionIconPlain]}>
        <Icon size={22} color={filled ? '#fff' : t.color.primary} weight={filled ? 'fill' : 'duotone'} />
        {!!badge && badge > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: t.spacing[5] },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: t.spacing[2], paddingBottom: t.spacing[3] },
  heading: { color: t.color.text, fontSize: t.fontSize.xl, fontWeight: '900', letterSpacing: -0.5 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.color.surface, ...shadow.sm },
  body: { paddingBottom: t.spacing[6] },

  section: { color: t.color.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: t.spacing[3] },
  statRow: { flexDirection: 'row', gap: t.spacing[3], marginBottom: t.spacing[5] },

  actionRow: { flexDirection: 'row', gap: t.spacing[3], marginBottom: t.spacing[5] },
  action: { flex: 1, alignItems: 'center', gap: 8 },
  actionIcon: { width: '100%', height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionIconPlain: { backgroundColor: t.color.surface, ...shadow.sm },
  actionIconFilled: { backgroundColor: t.color.primary, ...shadow.sm },
  actionLabel: { color: t.color.text, fontSize: 12, fontWeight: '700' },
  badge: { position: 'absolute', top: 8, right: '30%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: t.color.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  dashboardLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: t.color.surface, borderRadius: t.radius.pill, paddingVertical: t.spacing[4], ...shadow.sm,
  },
  dashboardLinkText: { color: t.color.primary, fontSize: t.fontSize.md, fontWeight: '800' },
  dashboardChevron: { color: t.color.primary, fontSize: 20, fontWeight: '400' },
})
