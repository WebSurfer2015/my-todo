import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { useTheme } from '../../app/theme'

/**
 * CalmFirework — an in-row completion celebration. A soft burst of small
 * particles fans outward from the checkbox, then drifts down with a gentle
 * gravity bias and fades as it goes. Festive, never loud.
 *
 * Renders an absolutely-positioned, non-interactive particle layer centered
 * on the checkbox INSIDE the row — no global overlay, no screen-coordinate
 * measuring. Bump `trigger` (a counter from the parent) to fire a burst.
 * Calls `onDone` after the ~850ms timeline so the parent can unmount it.
 *
 * With `reduceMotion` on, renders nothing — opt-out / Reduce-Motion users
 * get a still checkbox fill with no particles.
 */

const PARTICLE_COUNT = 10
// Warm gold accent, muted. The theme's soft green is the second accent.
const GOLD = '#E8C07A'
const BURST_MS = 250
const DRIFT_MS = 600

interface Props {
  /** Bump this counter to fire a burst. */
  trigger: number
  /** Anchor size hint (checkbox diameter). Accepted for API symmetry;
   * the layer centers itself on the checkbox regardless. */
  size?: number
  /** Category / department tint — the primary particle color. */
  color?: string
  /** When true, render nothing (no particles). */
  reduceMotion?: boolean
  /** Fired after the timeline completes so the parent can unmount. */
  onDone?: () => void
}

export default function CalmFirework({
  trigger,
  color,
  reduceMotion = false,
  onDone,
}: Props) {
  const theme = useTheme()
  const [active, setActive] = useState(false)

  // Two shared, native-driven phase clocks. `burst` shapes the outward
  // pop (0–250ms); `drift` shapes the downward fade (250–850ms). Both
  // run with useNativeDriver, and every per-particle transform is an
  // add/interpolate of these two values, so the whole burst stays on the
  // UI thread.
  const burst = useRef(new Animated.Value(0)).current
  const drift = useRef(new Animated.Value(0)).current

  // Deterministic particle geometry — index-based angle evenly spread
  // around 360°, with a slight per-index radius and gravity variation so
  // the burst reads organic without Math.random.
  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2
      const radius = 24 + (i % 3) * 3 // 24, 27, 30
      const dotSize = 3 + (i % 2) // 3 or 4px
      const gravity = 18 + (i % 4) * 2.5 // 18–25.5px downward drift
      return {
        i,
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius,
        dotSize,
        gravity,
      }
    })
  }, [])

  const palette = useMemo(
    () => [color ?? theme.primary, GOLD, theme.green],
    [color, theme.primary, theme.green],
  )

  useEffect(() => {
    if (trigger <= 0 || reduceMotion) return
    setActive(true)
    burst.setValue(0)
    drift.setValue(0)
    const anim = Animated.sequence([
      // Burst: pop outward, scale up, fade in.
      Animated.timing(burst, {
        toValue: 1,
        duration: BURST_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Drift + fade: keep easing outward a touch, add downward gravity,
      // shrink and fade to nothing.
      Animated.timing(drift, {
        toValue: 1,
        duration: DRIFT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ])
    anim.start(({ finished }) => {
      if (finished) {
        setActive(false)
        onDone?.()
      }
    })
    return () => anim.stop()
    // Re-fire only on a new trigger; the animated values + callbacks are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, reduceMotion])

  if (reduceMotion || !active) return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((p) => {
        // translate = burst-out + a little extra drift-out, native add.
        const translateX = Animated.add(
          burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }),
          drift.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx * 0.35] }),
        )
        const translateY = Animated.add(
          burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }),
          drift.interpolate({
            inputRange: [0, 1],
            outputRange: [0, p.dy * 0.35 + p.gravity],
          }),
        )
        // scale 0 → 1 (burst) → 0.5 (drift).
        const scale = Animated.add(
          burst.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
          drift.interpolate({ inputRange: [0, 1], outputRange: [0, -0.5] }),
        )
        // opacity 0 → 0.9 (burst) → 0 (drift).
        const opacity = Animated.add(
          burst.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
          drift.interpolate({ inputRange: [0, 1], outputRange: [0, -0.9] }),
        )
        return (
          <Animated.View
            key={p.i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: p.dotSize,
              height: p.dotSize,
              marginLeft: -p.dotSize / 2,
              marginTop: -p.dotSize / 2,
              borderRadius: p.dotSize / 2,
              backgroundColor: palette[p.i % palette.length],
              opacity,
              transform: [{ translateX }, { translateY }, { scale }],
            }}
          />
        )
      })}
    </View>
  )
}
