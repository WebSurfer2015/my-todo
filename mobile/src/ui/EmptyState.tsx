import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useTheme, ThemeColors } from '../app/theme'

/**
 * Mochi cameo — bundled icon shown in a soft pale-mint circle so empty
 * states feel mascot-led instead of broken. Sized small enough to be
 * background-decorative, not the focal point.
 */
function MochiCameo({ size = 64, ringColor }: { size?: number; ringColor: string }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.primarySoft,
        borderWidth: 1.5,
        borderColor: ringColor,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    </View>
  )
}

/**
 * Three-leaf sage sprout — matches the small plant sprigs at Mochi's feet
 * in the brand illustration. Used as the compact-variant empty-state mark
 * (e.g. inside the Edit Task sheet's subtask area) where Mochi would feel
 * too prominent.
 */
function Sprout({ color, size = 26 }: { color: string; size?: number }) {
  const w = size
  const h = (size * 18) / 24
  return (
    <Svg width={w} height={h} viewBox="0 0 24 18">
      <Path d="M12 16 C10 12 10 8 12 5 C14 8 14 12 12 16 Z" fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M12 16 C8 13 5 10 4 7 C7 9 10 12 12 16 Z" fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M12 16 C16 13 19 10 20 7 C17 9 14 12 12 16 Z" fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  )
}

interface Props {
  /** Calm, descriptive title. No exclamation marks. */
  title: string
  /** Optional one-line softer hint underneath. */
  hint?: string
  /** Optional call-to-action. Pair with onCta. */
  ctaLabel?: string
  onCta?: () => void
  /** 'default' for full-screen empty (main list, trash). 'compact' for nested empties (subtask list inside a sheet). */
  variant?: 'default' | 'compact'
}

/**
 * Unified empty state. The small soft mark signals "this state is
 * intentional" — important for anxiety-conscious design where a fully blank
 * space can read as broken/loading.
 */
export default function EmptyState({ title, hint, ctaLabel, onCta, variant = 'default' }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme, variant), [theme, variant])
  return (
    <View style={styles.wrap}>
      {variant === 'default' ? (
        <View style={styles.mochi}>
          <MochiCameo size={64} ringColor={theme.primary} />
          <View style={styles.sproutAccent}>
            <Sprout color={theme.primary} size={20} />
          </View>
        </View>
      ) : (
        <View style={styles.mark} />
      )}
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {ctaLabel && onCta ? (
        <TouchableOpacity style={styles.cta} onPress={onCta} activeOpacity={0.7}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function makeStyles(c: ThemeColors, variant: 'default' | 'compact') {
  const compact = variant === 'compact'
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      paddingVertical: compact ? 28 : 56,
      paddingHorizontal: 16,
      gap: 8,
    },
    mark: {
      width: compact ? 6 : 8,
      height: compact ? 6 : 8,
      borderRadius: compact ? 3 : 4,
      backgroundColor: c.label3,
      opacity: 0.3,
      marginBottom: 4,
    },
    sprout: {
      marginBottom: 6,
      opacity: 0.75,
    },
    mochi: {
      marginBottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sproutAccent: {
      position: 'absolute',
      bottom: -4,
      right: -8,
      opacity: 0.7,
    },
    title: {
      fontSize: compact ? 14 : 16,
      fontWeight: '600',
      color: c.label,
      textAlign: 'center',
      letterSpacing: -0.16,
    },
    hint: {
      fontSize: compact ? 12 : 13,
      color: c.label3,
      textAlign: 'center',
      maxWidth: 320,
      lineHeight: 18,
    },
    cta: {
      marginTop: 12,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.blue,
    },
    ctaText: {
      color: c.primaryOn,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
  })
}
