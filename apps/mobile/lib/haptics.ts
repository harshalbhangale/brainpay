import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

/** Web-safe haptics. No-ops on web; fire-and-forget on native. */
const native = Platform.OS !== 'web'

export const haptic = {
  tap: () => { if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) },
  select: () => { if (native) Haptics.selectionAsync().catch(() => {}) },
  success: () => { if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}) },
}
