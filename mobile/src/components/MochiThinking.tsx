/**
 * "Mochi's thinking…" busy indicator used across every AI textbox.
 *
 * Composition:
 *   - Bundled Mochi mascot PNG that pulses (scale + opacity loop)
 *   - Sparkles icon that fades in/out, slightly offset in time
 *   - Italic gray text from `t.suggestStepsThinking`
 *
 * `compact` variant hides the text — used inside pills (Suggest
 * Steps trigger, TodoFieldSuggestPills) where surrounding chrome
 * already supplies the label.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

const MOCHI_PNG = require('../../assets/mochi-mascot.png')

interface Props {
  /** When true, render just the mochi + sparkles icons (no text).
   * For surfaces that already render the "thinking…" label nearby. */
  compact?: boolean
  /** Override the icon size. Defaults to 18. The mochi PNG renders
   * 2px taller than the sparkles to feel balanced. */
  size?: number
}

export default function MochiThinking({ compact = false, size = 18 }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Two looping animations driven by a single shared progress value
  // so both icons stay phase-locked. Mochi scales 1.0 ↔ 1.12 with a
  // small opacity dip; sparkles fades 0.35 ↔ 1.0 on the same beat
  // but with a slight phase offset so the two feel "alive" rather
  // than mechanical.
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [progress])

  const mochiScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  })
  const mochiOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1, 0.85],
  })
  // Sparkles fade is offset — peaks when mochi is mid-pulse — so the
  // two feel like a single creature breathing rather than two
  // independent toggles.
  const sparkleOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 1, 0.35],
  })

  return (
    <View style={styles.row}>
      <View style={styles.iconsWrap}>
        <Animated.Image
          source={MOCHI_PNG}
          style={[
            styles.mochi,
            {
              width: size + 2,
              height: size + 2,
              transform: [{ scale: mochiScale }],
              opacity: mochiOpacity,
            },
          ]}
          resizeMode="contain"
        />
        <Animated.View style={{ opacity: sparkleOpacity }}>
          <Sparkles size={size - 6} color={theme.primary} strokeWidth={2.2} />
        </Animated.View>
      </View>
      {!compact && (
        <Text style={styles.label}>{t.suggestStepsThinking}</Text>
      )}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconsWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    mochi: {
      // Width/height set inline so callers can resize via `size` prop.
    },
    label: {
      fontSize: 12,
      fontStyle: 'italic',
      color: c.label3,
      letterSpacing: -0.1,
    },
  })
}

// Re-export the Image so other components can preload if needed.
export { MOCHI_PNG }
