import { useEffect, useRef, useState } from 'react'
import { Text, type TextStyle, type StyleProp } from 'react-native'

/**
 * AnimatedNumber — counts smoothly from previous value to new value.
 * Used for balance updates so the number ticks up after a topup.
 */

type Props = {
  value: number
  style?: StyleProp<TextStyle>
  duration?: number
  formatter?: (n: number) => string
  suffix?: string
}

export function AnimatedNumber({ value, style, duration = 800, formatter, suffix }: Props) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (prevRef.current === value) return
    const start = prevRef.current
    const end = value
    const startTime = Date.now()

    const tick = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const current = Math.round(start + (end - start) * eased)
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = end
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  const text = formatter ? formatter(display) : display.toLocaleString()
  return <Text style={style}>{text}{suffix ?? ''}</Text>
}
