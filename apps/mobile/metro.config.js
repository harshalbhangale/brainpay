// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// pnpm monorepo: watch the whole workspace and let Metro resolve hoisted
// packages from the workspace root node_modules in addition to the local one.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = false

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

/**
 * Web stubs for native-only packages.
 * Metro calls resolveRequest for every import; on web we redirect
 * packages that use native modules to lightweight JS stubs.
 */
const WEB_STUBS = {
  '@stripe/stripe-react-native': path.resolve(projectRoot, 'shims/stripe-react-native.web.js'),
  'expo-secure-store': path.resolve(projectRoot, 'shims/expo-secure-store.web.js'),
  'react-native-webrtc': path.resolve(projectRoot, 'shims/react-native-webrtc.web.js'),
  'react-native-maps': path.resolve(projectRoot, 'shims/react-native-maps.web.js'),
}

const originalResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_STUBS[moduleName]) {
    return { filePath: WEB_STUBS[moduleName], type: 'sourceFile' }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
