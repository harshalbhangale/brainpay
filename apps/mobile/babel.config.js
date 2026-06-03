module.exports = function (api) {
  api.cache(true)
  // babel-preset-expo bundles the react-native-reanimated plugin (required by Moti).
  return {
    presets: ['babel-preset-expo'],
  }
}
