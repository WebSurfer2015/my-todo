import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme, ThemeColors } from '../theme'

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
      <View style={styles.mark} />
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
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
  })
}
