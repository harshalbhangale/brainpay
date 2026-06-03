import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { api } from './api'

/**
 * Push notification setup for MoneyPal.
 *
 * Call `registerForPushNotifications()` once after the user authenticates.
 * It requests permission, gets the Expo push token, and sends it to the API.
 *
 * Notification behaviour (how alerts appear while app is foregrounded):
 *   - Show alert banner
 *   - Play sound
 *   - Update badge
 */

// Configure how notifications appear when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Request permission and register the Expo push token with the API.
 * Safe to call multiple times — skips silently if already registered.
 *
 * Returns the token string, or null if permission was denied.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Physical device required — simulators can't receive push.
  // We still run through the flow so the token endpoint is exercised.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MoneyPal',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3DDC84',
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    // User denied — don't retry, don't crash.
    return null
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    })
    const token = tokenData.data

    // Send to API — fire and forget, never block the auth flow.
    api('/me/push-token', {
      method: 'PATCH',
      body: JSON.stringify({ token }),
    }).catch(() => undefined)

    return token
  } catch {
    // Simulator or misconfigured project — non-fatal.
    return null
  }
}

/**
 * Add a listener for notification taps (deep link routing).
 * Call this once in the root layout.
 *
 * Returns a cleanup function — call it in useEffect cleanup.
 */
export function addNotificationResponseListener(
  onResponse: (screen: string, params?: Record<string, unknown>) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>
    const screen = (data?.screen as string) ?? 'home'
    const params = (data?.params as Record<string, unknown>) ?? {}
    onResponse(screen, params)
  })
  return () => sub.remove()
}
