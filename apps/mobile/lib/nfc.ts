import { Platform } from 'react-native'

/**
 * NFC card reader for MoneyPal checkout.
 *
 * Reads the UID of a tapped NFC card and checks it against the
 * configured known tag UIDs.
 *
 * The primary card UID is set via EXPO_PUBLIC_NFC_TAG_PRIMARY env var.
 * Format: 14-char hex string, no colons, uppercase (e.g. "04F9BC82A21C90")
 *
 * Requires a custom Expo dev build — NFC does NOT work in Expo Go.
 * Build with: eas build --profile development --platform ios
 */

// Known card UIDs — normalised to uppercase, no colons.
const KNOWN_UIDS = new Set(
  [
    process.env.EXPO_PUBLIC_NFC_TAG_PRIMARY,
    // Add more cards here as needed:
    // process.env.EXPO_PUBLIC_NFC_TAG_RILEY,
  ]
    .filter(Boolean)
    .map((uid) => uid!.replace(/:/g, '').toUpperCase()),
)

export type NfcResult =
  | { success: true; uid: string }
  | { success: false; reason: 'cancelled' | 'unsupported' | 'unknown_card' | 'error'; message?: string }

/**
 * Wait for an NFC tap and validate the card UID.
 *
 * Returns immediately on simulator (success: false, reason: 'unsupported').
 * On a real device with the custom build, presents the iOS NFC sheet.
 */
export async function waitForNfcTap(): Promise<NfcResult> {
  // Simulator / Android without NFC — return unsupported.
  if (Platform.OS !== 'ios') {
    return { success: false, reason: 'unsupported', message: 'NFC only on iOS' }
  }

  try {
    // Dynamic import so the module doesn't crash in Expo Go.
    const NfcManager = (await import('react-native-nfc-manager')).default
    const { NfcTech } = await import('react-native-nfc-manager')

    const isSupported = await NfcManager.isSupported()
    if (!isSupported) {
      return { success: false, reason: 'unsupported', message: 'NFC not supported on this device' }
    }

    await NfcManager.start()

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef)
      const tag = await NfcManager.getTag()
      const rawId = tag?.id ?? ''

      // Normalise: remove colons, uppercase.
      const uid = rawId.replace(/:/g, '').toUpperCase()

      if (KNOWN_UIDS.size > 0 && !KNOWN_UIDS.has(uid)) {
        return { success: false, reason: 'unknown_card', message: `Unknown card: ${uid}` }
      }

      return { success: true, uid }
    } catch (err) {
      const msg = String(err)
      if (msg.includes('cancelled') || msg.includes('UserCancel')) {
        return { success: false, reason: 'cancelled' }
      }
      return { success: false, reason: 'error', message: msg }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => undefined)
    }
  } catch {
    // react-native-nfc-manager not available (Expo Go).
    return { success: false, reason: 'unsupported', message: 'NFC module not available — use custom dev build' }
  }
}

/**
 * Check if NFC is available on this device/build.
 */
export async function isNfcAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  try {
    const NfcManager = (await import('react-native-nfc-manager')).default
    return NfcManager.isSupported()
  } catch {
    return false
  }
}
