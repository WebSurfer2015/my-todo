import { StyleSheet } from "react-native";
import { ThemeColors, SPACING, RADIUS, TYPE } from "../../../app/theme";

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    // Filter row — mirrors the Todos FilterBar idiom exactly: no
    // background fill (sits on the canvas / AppBackground), no
    // separator line. Same 16px horizontal padding + 8px gap so
    // the All pill aligns visually with Todos between tabs.
    pillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      // Extra top padding so the pills sit centered in the space below
      // the header rather than hugging the top.
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    pillsScroll: {
      flexDirection: 'row',
      gap: SPACING.sm,
      // Explicit paddingLeft instead of leaning on pillsRow's `gap: 8`.
      // RN's gap between a regular flex child (the All pill) and a
      // ScrollView sibling has been unreliable — the leading pill
      // inside the ScrollView ended up tucked behind the All pill on
      // some renders. 8pt here matches the pillsScroll inter-pill gap
      // for a consistent visual rhythm.
      paddingRight: 0,
      paddingLeft: SPACING.sm,
    },
    storePill: {
      // Chrome mirrors the Todos FilterBar pill: round, slim padding,
      // hairline border, soft card background. The pin glyph overlays
      // the top-left corner (absolute) instead of consuming inline
      // horizontal space, so the pill body stays narrow when many
      // pinned pills crowd the row.
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: 7,
      borderRadius: RADIUS.pill,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    storePillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    // Unselected "candidate" outline — mirrors Todos FilterBar's
    // pillExtra so the unselected All pill reads identically across
    // the two tabs (white card bg + mint 1.5px border).
    storePillExtra: {
      backgroundColor: c.card,
      borderColor: c.primary,
      borderWidth: 1.5,
    },
    storePillLabel: {
      fontSize: TYPE.footnote,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.label,
      maxWidth: 180,
    },
    storePillLabelActive: { color: c.primaryOn },
    storePillCount: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      color: c.label2,
      fontVariant: ['tabular-nums'],
      marginLeft: 2,
    },
    storePillCountActive: { color: 'rgba(255,255,255,0.95)' },
    scroll: {
      paddingBottom: 96,
      // 16px horizontal so the EmptyStateCard sits at the same
      // page-edge inset as the App.tsx body padding — empty states
      // across tabs must look the same width. groupBlock children
      // explicitly negate this with their own marginHorizontal so
      // pre-existing list layouts aren't double-padded.
      paddingHorizontal: SPACING.lg,
      // flexGrow:1 so EmptyStateCard with `centered` can vertically
      // center within the remaining scroll space. Same shape as
      // App.tsx's container/body for the Todos tab.
      flexGrow: 1,
    },
    groupBlock: {
      // ScrollView already supplies 16px horizontal so EmptyStateCard
      // matches App.tsx's inset. Negate it here so the existing list
      // layout stays exactly where it was — group headers + cards
      // were already aligned right at the screen edge minus 16.
      marginHorizontal: -16,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.sm,
      marginBottom: 2,
    },
    groupHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
    },
    groupHeaderFuture: { color: c.label2 },
    groupCount: { fontWeight: '500', color: c.gray3 },
    // Quiet sub-label inside the Bought recently accordion ("Often picked up" / "Everything else").
    savedSubLabel: {
      fontSize: TYPE.caption,
      fontWeight: '600',
      color: c.label3,
      letterSpacing: 0.3,
      paddingHorizontal: SPACING.xs,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    futureHint: {
      fontSize: TYPE.caption,
      color: c.label3,
      paddingHorizontal: SPACING.xs,
      marginBottom: SPACING.sm,
      marginTop: -2,
    },
    groupCard: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      overflow: 'hidden',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 50,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      minHeight: 48,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      // Pad vertically so the tap target stays at least 44pt for HIG
      // even when the text is short.
      paddingVertical: SPACING.xs,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      // label3, not gray3: the circle is the check-off control, so its ring
      // needs ≥3:1 against the card (WCAG 1.4.11 non-text contrast).
      borderColor: c.label3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
    checkboxFuture: { borderColor: c.label3, borderStyle: 'dashed' },
    checkboxCheck: { color: c.primaryOn, fontSize: TYPE.body, fontWeight: '700', lineHeight: 16 },
    checkboxPlus: { color: c.primaryOn, fontSize: TYPE.bodyLg, fontWeight: '700', lineHeight: 16 },
    rowText: {
      flex: 1,
      fontSize: TYPE.body,
      color: c.label,
    },
    rowTextChecked: {
      textDecorationLine: 'line-through',
      color: c.label3,
    },
    rowStore: {
      fontSize: TYPE.caption,
      color: c.label3,
      marginLeft: 'auto',
      maxWidth: 100,
    },
    // Quiet trailing edit affordance (opens the edit sheet); the row body
    // itself toggles, so this stays low-contrast to not clutter the list.
    rowEditBtn: {
      paddingLeft: SPACING.sm,
      paddingVertical: SPACING.sm,
      alignSelf: 'center',
    },
    rowEditChevron: {
      fontSize: TYPE.h2,
      color: c.gray3,
      lineHeight: 22,
    },
  })
}

export type Styles = ReturnType<typeof makeStyles>;
