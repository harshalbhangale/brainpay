// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// pnpm monorepo: watch the whole workspace and let Metro resolve hoisted
// packages from the workspace root node_modules in addition to the local one.
config.watchFolders = [workspaceRoot]
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

module.exports = config
