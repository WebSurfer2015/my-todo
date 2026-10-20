import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Mic, Square } from 'lucide-react-native'
import { SPACING, TYPE, useTheme, ThemeColors } from '../../app/theme'
import { useReducedMotion } from '../../app/useReducedMotion'
import { SPEECH_COPY, SpeechStatus } from './speechInput'

/**
 * The voice-input pieces shared by every "type or speak" field that feeds
 * Mochi (Ask Mochi's chat input and the first-launch Onboarding field), so
 * the mic looks and behaves the same wherever it appears.
 */

/** The voice-input mic. Idle: a soft 40pt circle so it reads as a button.
 * Listening: a filled accent circle with a Stop square and a slow, gentle
 * pulse ring — static when Reduce Motion is on (the in-app switch via
 * `reduceMotion`, or the OS setting via useReducedMotion). Same 40pt footprint
 * in every state, so nothing shifts. */
export function MicButton({
  listening,
  disabled = false,
  reduceMotion = false,
  onPress,
}: {
  listening: boolean
  disabled?: boolean
  reduceMotion?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const osReduceMotion = useReducedMotion()
  const still = reduceMotion || osReduceMotion
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    pulse.setValue(0)
    if (!listening || still) return
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [listening, still, pulse])
  return (
    <View style={styles.micWrap}>
      {listening && !still && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.micPulse,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            },
          ]}
        />
      )}
      <Pressable
        style={({ pressed }) => [
          styles.micBtn,
          listening && styles.micBtnListening,
          disabled && styles.micBtnDisabled,
          pressed && !disabled && { transform: [{ scale: 0.9 }] },
        ]}
        onPress={onPress}
        disabled={disabled}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={listening ? SPEECH_COPY.stopLabel : SPEECH_COPY.micLabel}
        accessibilityState={{ disabled }}
      >
        {listening ? (
          <Square size={14} color={theme.primaryOn} fill={theme.primaryOn} strokeWidth={2.5} />
        ) : (
          <Mic size={20} color={theme.label2} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  )
}

/** "Listening…" / "Didn't catch that" / the denied note with its Settings
 * link. Render it ABOVE the field: below it, the keyboard covers it. Renders
 * nothing in the idle / unavailable states. */
export function SpeechStatusNote({ status }: { status: SpeechStatus }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  if (status === 'listening') {
    return (
      <Text
        style={[styles.speechNote, styles.speechNoteEnd]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={SPEECH_COPY.listeningA11y}
      >
        {SPEECH_COPY.listening}
      </Text>
    )
  }
  if (status === 'error') {
    return (
      <Text style={[styles.speechNote, styles.speechNoteEnd]} accessibilityLiveRegion="polite">
        {SPEECH_COPY.missed}
      </Text>
    )
  }
  if (status === 'denied') {
    return (
      <Text style={styles.speechNote}>
        {SPEECH_COPY.denied}{' '}
        <Text
          style={styles.speechLink}
          onPress={() => Linking.openSettings().catch(() => {})}
          accessibilityRole="link"
        >
          {SPEECH_COPY.openSettings}
        </Text>
      </Text>
    )
  }
  return null
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    micWrap: { width: 40, height: 40, marginBottom: 2 },
    micBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Listening: filled accent circle, Stop square in primaryOn.
    micBtnListening: { backgroundColor: c.primary },
    micBtnDisabled: { opacity: 0.4 },
    // The gentle pulse ring behind the listening mic.
    micPulse: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
    },
    speechNote: {
      fontSize: TYPE.footnote,
      color: c.label2,
      paddingBottom: SPACING.xs,
      paddingHorizontal: SPACING.xs,
    },
    // Listening / missed sit right-aligned, next to the mic they describe.
    speechNoteEnd: { textAlign: 'right' },
    speechLink: { color: c.primary, fontWeight: '600' },
  })
}
