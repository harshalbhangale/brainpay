import { useEffect } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { haptic } from '@/lib/haptics'
import { Lottie } from './Lottie'

/**
 * Confetti — full-screen celebration burst (Lottie).
 * API preserved: <Confetti show={celebrating} onComplete={() => ...} />
 */

const { width: SW, height: SH } = Dimensions.get('window')

type Props = {
  show: boolean
  onComplete?: () => void
}

export function Confetti({ show, onComplete }: Props) {
  // Drive completion off a timer so it behaves consistently (incl. web no-op).
  useEffect(() => {
    if (!show) return
    haptic.success()
    const t = setTimeout(() => onComplete?.(), 1700)
    return () => clearTimeout(t)
  }, [show, onComplete])

  if (!show) return null

  return (
    <View pointerEvents="none" style={s.root}>
      <Lottie name="confetti" size={Math.min(SW, 440)} loop={false} />
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SW,
    height: SH,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
})
