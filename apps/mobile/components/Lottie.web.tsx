import { type ViewStyle } from 'react-native'

/** Web stub — lottie-react-native pulls @lottiefiles/dotlottie-react on web; we skip it. */
export type LottieName = 'confetti' | 'coinBurst' | 'success' | 'loading' | 'empty'

export function Lottie(_props: {
  name: LottieName
  size?: number
  loop?: boolean
  autoPlay?: boolean
  style?: ViewStyle
  onFinish?: () => void
}) {
  return null
}
