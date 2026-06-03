import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { kidTheme as tokens } from '@/theme/tokens'

/**
 * Chat bubble — animates in with a soft slide + fade.
 * iMessage-style with "from" parameter controlling left/right alignment.
 */

type Props = {
  from: 'pal' | 'user'
  children: ReactNode
  /** Render any extra content (avatar grid, style cards) inside the bubble. */
  attachment?: ReactNode
}

export function ChatBubble({ from, children, attachment }: Props) {
  const isPal = from === 'pal'
  const translateX = useRef(new Animated.Value(isPal ? -20 : 20)).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 80,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start()
  }, [translateX, opacity, scale])

  return (
    <Animated.View
      style={[
        styles.row,
        isPal ? styles.rowLeft : styles.rowRight,
        {
          opacity,
          transform: [{ translateX }, { scale }],
        },
      ]}
    >
      {isPal && <View style={styles.avatar}><Text style={styles.avatarChar}>P</Text></View>}
      <View style={[styles.bubble, isPal ? styles.bubblePal : styles.bubbleUser]}>
        {typeof children === 'string' ? (
          <Text style={[styles.text, isPal ? styles.textPal : styles.textUser]}>{children}</Text>
        ) : (
          children
        )}
        {attachment ? <View style={styles.attachment}>{attachment}</View> : null}
      </View>
    </Animated.View>
  )
}

/** Animated typing indicator — three pulsing dots in a bubble. */
export function TypingBubble() {
  const dot1 = useRef(new Animated.Value(0.3)).current
  const dot2 = useRef(new Animated.Value(0.3)).current
  const dot3 = useRef(new Animated.Value(0.3)).current
  const opacity = useRef(new Animated.Value(0)).current
  const translateX = useRef(new Animated.Value(-20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.3,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      )

    const a1 = animate(dot1, 0)
    const a2 = animate(dot2, 150)
    const a3 = animate(dot3, 300)
    a1.start(); a2.start(); a3.start()

    return () => {
      a1.stop(); a2.stop(); a3.stop()
    }
  }, [dot1, dot2, dot3, opacity, translateX])

  return (
    <Animated.View
      style={[
        styles.row,
        styles.rowLeft,
        { opacity, transform: [{ translateX }] },
      ]}
    >
      <View style={styles.avatar}><Text style={styles.avatarChar}>P</Text></View>
      <View style={[styles.bubble, styles.bubblePal, styles.typingBubble]}>
        <Animated.View style={[styles.dot, { opacity: dot1, transform: [{ scale: dot1 }] }]} />
        <Animated.View style={[styles.dot, { opacity: dot2, transform: [{ scale: dot2 }] }]} />
        <Animated.View style={[styles.dot, { opacity: dot3, transform: [{ scale: dot3 }] }]} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: tokens.spacing[3],
    gap: 8,
  },
  rowLeft: {
    justifyContent: 'flex-start',
    paddingRight: 40,
  },
  rowRight: {
    justifyContent: 'flex-end',
    paddingLeft: 40,
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarChar: {
    color: '#000',
    fontWeight: '900',
    fontSize: 14,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
  },
  bubblePal: {
    backgroundColor: tokens.color.surface,
    borderBottomLeftRadius: 6,
  },
  bubbleUser: {
    backgroundColor: tokens.color.accent,
    borderBottomRightRadius: 6,
  },
  text: {
    fontSize: tokens.fontSize.md,
    lineHeight: 22,
    fontWeight: '500',
  },
  textPal: {
    color: tokens.color.text,
  },
  textUser: {
    color: '#000',
    fontWeight: '700',
  },
  attachment: {
    marginTop: tokens.spacing[3],
  },
  typingBubble: {
    flexDirection: 'row',
    paddingVertical: 14,
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.textMuted,
  },
})
