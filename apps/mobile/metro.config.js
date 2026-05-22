// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

/**
 * Supabase v2 fix on React Native.
 *
 * @supabase/realtime-js statically imports `ws` (the Node WebSocket
 * library). When Metro has package-exports resolution enabled (default in
 * SDK 53+) it fails to substitute the browser/RN build, so the bundler
 * tries to load Node's `stream` module and crashes.
 *
 * Disabling unstable_enablePackageExports falls back to the legacy
 * `browser` / `react-native` field resolution which Supabase + ws ship
 * correctly. Tracked at:
 *   https://github.com/supabase/supabase-js/issues/962
 *   https://github.com/expo/expo/issues/30530
 */
config.resolver.unstable_enablePackageExports = false

module.exports = config
