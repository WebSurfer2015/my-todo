import React, { useEffect, useRef, useState } from 'react'
import { Animated, Image, StyleSheet, Easing, View } from 'react-native'
import { useTheme } from '../theme'

/**
 * In-app splash continuation. The native splash (expo-splash-screen) shows
 * during JS bundle load; once the bundle hands off, this overlay covers the
 * app for ~1 second with a gentle Mochi breathing scale and a soft fade out.
 *
 * Anxiety-friendly tradeoff: extends launch by ~1.1s, but the user only
 * sees this on cold launches; the moment is calm + branded, not blocking.
 *
 * Honors store-side reduceMotion (currently hardcoded true) by skipping
 * the breath cycle and just showing the static image briefly. Set
 * `reduceMotion={false}` from the parent if you want the animation regardless.
 */
interface Props {
  reduceMotion?: boolean
  onDismiss?: () => void
}

export default function SplashOverlay({ reduceMotion = true, onDismiss }: Props) {
  const theme = useTheme()
  const [visible, setVisible] = useState(true)
  const opacity = useRef(new Animated.Value(1)).current
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const breathDuration = 800
    const fadeDuration = 300
    const holdDuration = 200

    const breath = reduceMotion
      ? Animated.delay(breathDuration)
      : Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.04,
            duration: breathDuration / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.0,
            duration: breathDuration / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])

    Animated.sequence([
      breath,
      Animated.delay(holdDuration),
      Animated.timing(opacity, {
        toValue: 0,
        duration: fadeDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false)
      onDismiss?.()
    })
  }, [opacity, scale, reduceMotion, onDismiss])

  if (!visible) return null

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        styles.root,
        { backgroundColor: theme.bg, opacity },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.image}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  image: {
    width: 220,
    height: 220,
  },
})
