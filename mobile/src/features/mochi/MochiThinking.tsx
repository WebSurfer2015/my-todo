/**
 * "Mochi's thinking…" busy indicator used across every AI textbox.
 *
 * Composition:
 *   - Sparkles icon that pulses (scale + opacity loop), tinted in
 *     the avatar theme primary so the AI cue feels like one of the
 *     calm chrome elements
 *   - Italic gray text from `t.suggestStepsThinking`
 *
 * The Mochi mascot PNG that used to sit alongside the sparkles was
 * removed — the avatar in the header is already Mochi, so a second
 * mini-Mochi inside the input chrome read as crowded duplication.
 * Sparkles alone communicates "AI working" cleanly.
 *
 * `compact` variant hides the text — used inside pills (Suggest
 * Steps trigger, TodoFieldSuggestPills) where surrounding chrome
 * already supplies the label.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'

interface Props {
  /** When true, render just the sparkles icon (no text). For
   * surfaces that already render the "thinking…" label nearby. */
  compact?: boolean
  /** Override the icon size. Defaults to 18. */
  size?: number
}

export default function MochiThinking({ compact = false, size = 18 }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Single looping breathe — scale + opacity together. Native driver
  // keeps it 60fps with no JS thread cost.
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

  const sparkleScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.12],
  })
  const sparkleOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 1, 0.45],
  })

  return (
    <View style={styles.row}>
      <Animated.View
        style={{ opacity: sparkleOpacity, transform: [{ scale: sparkleScale }] }}
      >
        <Sparkles size={size - 2} color={theme.primary} strokeWidth={2.2} />
      </Animated.View>
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
    label: {
      fontSize: 12,
      fontStyle: 'italic',
      color: c.label3,
      letterSpacing: -0.1,
    },
  })
}
