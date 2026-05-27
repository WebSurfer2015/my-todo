/**
 * Unified empty-state card. Matches the "Nothing pending. / Enjoy
 * the breathing room. / What's Next?" pattern from the Home screen —
 * any new empty surface across the app should use this so they read
 * as members of the same UI family.
 *
 * Layout: white rounded card on the canvas, centered title (bold),
 * optional italic gray hint underneath, optional pill-shaped action
 * button. Tone is calm and short — empty states aren't a place to
 * cram instructions.
 */

import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  /** Headline — short, sentence case with a period. */
  title: string
  /** Optional italic secondary line (gray). */
  hint?: string
  /** Optional pill button label. Renders nothing when omitted. */
  actionLabel?: string
  /** Tap handler for the pill button. Required when actionLabel set. */
  onAction?: () => void
  /** Accessibility label override for the action button. */
  actionAccessibilityLabel?: string
}

export default function EmptyStateCard({
  title,
  hint,
  actionLabel,
  onAction,
  actionAccessibilityLabel,
}: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAction}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
        >
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: c.label,
      marginBottom: 4,
    },
    hint: {
      fontSize: 12,
      color: c.label3,
      fontStyle: 'italic',
    },
    actionBtn: {
      marginTop: 14,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
  })
}
