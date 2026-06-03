import LottieView from 'lottie-react-native'
import { Platform, type ViewStyle } from 'react-native'

/**
 * Lottie — thin wrapper around lottie-react-native with named, app-wide presets.
 * Assets are original (commercial-safe) JSON in assets/lottie.
 *
 * Usage: <Lottie name="confetti" size={220} />
 */

const SOURCES = {
  confetti: require('../assets/lottie/confetti.json'),
  coinBurst: require('../assets/lottie/coin-burst.json'),
  success: require('../assets/lottie/success.json'),
  loading: require('../assets/lottie/loading.json'),
  empty: require('../assets/lottie/empty.json'),
} as const

export type LottieName = keyof typeof SOURCES

// which presets loop by default (celebrations play once; loaders/empties loop)
const LOOPING: Record<LottieName, boolean> = {
  confetti: false,
  coinBurst: false,
  success: false,
  loading: true,
  empty: true,
}

export function Lottie({
  name,
  size = 160,
  loop,
  autoPlay = true,
  style,
  onFinish,
}: {
  name: LottieName
  size?: number
  loop?: boolean
  autoPlay?: boolean
  style?: ViewStyle
  onFinish?: () => void
}) {
  // lottie-react-native doesn't render reliably on web — skip gracefully.
  if (Platform.OS === 'web') return null
  return (
    <LottieView
      source={SOURCES[name]}
      autoPlay={autoPlay}
      loop={loop ?? LOOPING[name]}
      onAnimationFinish={onFinish}
      style={[{ width: size, height: size }, style]}
    />
  )
}
