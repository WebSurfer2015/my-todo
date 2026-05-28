import { StyleSheet } from "react-native";
import { ThemeColors } from "../../theme";

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
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    pillsScroll: {
      flexDirection: 'row',
      gap: 8,
      // Explicit paddingLeft instead of leaning on pillsRow's `gap: 8`.
      // RN's gap between a regular flex child (the All pill) and a
      // ScrollView sibling has been unreliable — the leading pill
      // inside the ScrollView ended up tucked behind the All pill on
      // some renders. 8pt here matches the pillsScroll inter-pill gap
      // for a consistent visual rhythm.
      paddingRight: 0,
      paddingLeft: 8,
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
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 100,
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
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.label,
      maxWidth: 180,
    },
    storePillLabelActive: { color: '#fff' },
    storePillCount: {
      fontSize: 12,
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
      paddingHorizontal: 16,
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
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
      paddingVertical: 6,
      marginBottom: 2,
    },
    groupHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
    },
    groupHeaderFuture: { color: c.label2 },
    groupCount: { fontWeight: '500', color: c.gray3 },
    futureHint: {
      fontSize: 12,
      color: c.label3,
      paddingHorizontal: 4,
      marginBottom: 6,
      marginTop: -2,
    },
    groupCard: {
      backgroundColor: c.card,
      borderRadius: 12,
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
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      // Pad vertically so the tap target stays at least 44pt for HIG
      // even when the text is short.
      paddingVertical: 4,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
    checkboxFuture: { borderColor: c.label3, borderStyle: 'dashed' },
    checkboxCheck: { color: c.primaryOn, fontSize: 14, fontWeight: '700', lineHeight: 16 },
    checkboxPlus: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 16 },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: c.label,
    },
    rowTextChecked: {
      textDecorationLine: 'line-through',
      color: c.label3,
    },
    rowStore: {
      fontSize: 12,
      color: c.label3,
      marginLeft: 'auto',
      maxWidth: 100,
    },
  })
}

export type Styles = ReturnType<typeof makeStyles>;
