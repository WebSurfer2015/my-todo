/**
 * Unified empty-state card. Matches the "Nothing pending. / Enjoy
 * the breathing room. / What's Next?" pattern from the Home screen —
 * any new empty surface across the app should use this so they read
 * as members of the same UI family.
 *
 * Layout: white rounded card on the canvas, centered title (bold),
 * optional subline (used for "N done today"), optional italic gray
 * hint underneath, optional pill-shaped action button. Tone is calm
 * and short — empty states aren't a place to cram instructions.
 *
 * When `centered` is true, the card is wrapped in a flex View that
 * vertically centers it within its parent — used by full-page empty
 * states (Todos, Shopping) so the card lands at the same y position
 * across tabs regardless of how much chrome sits above each.
 */

import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme, ThemeColors } from '../theme'
import EmptyStateGlyph from './EmptyStateGlyph'

interface Props {
  /** Headline — short, sentence case with a period. */
  title: string
  /** Optional middle line between title and hint. Used by Dashboard's
   * TODAY-empty state for the "N done today" count line. Rendered
   * with the same weight/size as the title but slightly tighter
   * letter-spacing. */
  subline?: string
  /** Optional italic secondary line (gray). */
  hint?: string
  /** Optional pill button label. Renders nothing when omitted. */
  actionLabel?: string
  /** Tap handler for the pill button. Required when actionLabel set. */
  onAction?: () => void
  /** Accessibility label override for the action button. */
  actionAccessibilityLabel?: string
  /** When true, wraps the card in a flex View that vertically
   * centers it in its parent's empty space. Use this for full-page
   * empty states (Todos, Shopping) so the card lands at a
   * consistent y position regardless of chrome height. The parent
   * must provide a flex height (e.g. ScrollView with
   * contentContainerStyle:{flexGrow:1}) for this to do anything. */
  centered?: boolean
  /** Suppress the theme-aware glyph at the top of the card. Defaults
   * to false (glyph shown). Used by tight sub-empty states where the
   * extra ornament would compete with surrounding chrome. */
  hideGlyph?: boolean
}

export default function EmptyStateCard({
  title,
  subline,
  hint,
  actionLabel,
  onAction,
  actionAccessibilityLabel,
  centered = false,
  hideGlyph = false,
}: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const card = (
    <View style={styles.card}>
      {!hideGlyph && <EmptyStateGlyph />}
      <Text style={styles.title}>{title}</Text>
      {subline && <Text style={styles.subline}>{subline}</Text>}
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
  if (!centered) return card
  return <View style={styles.centerWrap}>{card}</View>
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    centerWrap: {
      flex: 1,
      justifyContent: 'center',
      // Don't stretch: card width stays content-based + the inner
      // alignItems:center keeps it horizontally pinned to the card's
      // natural width when wrapped in alignSelf:stretch parents.
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      // Comfort: was 24/16 → bumped to 36/24 so the title + button
      // have generous breathing room. Empty states are a chance to
      // exhale, not a cramped notification.
      paddingVertical: 36,
      paddingHorizontal: 24,
      alignItems: 'center',
      marginTop: 8,
    },
    title: {
      // Was 15 — bumped to 17 so the title carries the card. Still
      // sentence-case, still short.
      fontSize: 17,
      fontWeight: '600',
      color: c.label,
      // Tighter margin between title and subline/hint so the type
      // reads as one breath.
      marginBottom: 6,
    },
    subline: {
      fontSize: 13,
      fontWeight: '500',
      color: c.label2,
      marginBottom: 6,
      letterSpacing: -0.1,
    },
    hint: {
      fontSize: 13,
      color: c.label3,
      fontStyle: 'italic',
    },
    actionBtn: {
      // Was 14 — bumped to 22 so the button has air above it. With
      // 36 paddingVertical on the card, total = ~58px from the
      // hint, plenty of breathing room without floating away.
      marginTop: 22,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    actionBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
  })
}
