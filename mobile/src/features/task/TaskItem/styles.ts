import { StyleSheet } from "react-native";
import { ThemeColors, SPACING, RADIUS, TYPE } from "../../../app/theme";

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    rowFlash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.primarySoft,
      borderRadius: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: SPACING.md,
      // Floor at 44pt — the row is the toggle target.
      minHeight: 44,
      paddingLeft: SPACING.lg,
      paddingRight: SPACING.lg,
      backgroundColor: c.card,
      gap: SPACING.sm,
      overflow: 'hidden',
    },
    rowDone: {},
    rowTrashed: { opacity: 0.55 },
    rowPartialDone: { opacity: 0.65 },
    rowPressed: { backgroundColor: c.bg },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      // label3 meets the 3:1 non-text minimum — the circle is the ONLY
      // completion control, so it must be visible (gray3 was ~1.5:1).
      borderColor: c.label3,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxDone: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    checkboxSelected: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    checkboxRemoved: {
      borderColor: c.label3,
      borderStyle: 'dashed',
    },
    checkmark: {
      color: c.primaryOn,
      fontSize: TYPE.footnote,
      fontWeight: '700',
      lineHeight: 15,
    },
    removedMark: {
      color: c.label3,
      fontSize: TYPE.body,
      fontWeight: '700',
      lineHeight: 16,
    },
    body: {
      flex: 1,
      gap: SPACING.xs,
    },
    mainLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    text: {
      flex: 1,
      // Bumped title weight so it carries the row visually; the meta
      // chips below are intentionally smaller/dimmer so they read as
      // secondary information.
      fontSize: TYPE.bodyLg,
      fontWeight: '500',
      color: c.label,
      lineHeight: 22,
      letterSpacing: -0.3,
    },
    textDone: {
      color: c.label3,
      textDecorationLine: 'line-through',
    },
    textRemoved: {
      color: c.label3,
      fontStyle: 'italic',
    },
    textEdit: {
      flex: 1,
      fontSize: TYPE.bodyLg,
      color: c.label,
      lineHeight: 21,
      letterSpacing: -0.3,
      backgroundColor: c.bg,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: RADIUS.control,
    },
    priorityBtn: {
      padding: SPACING.xs,
    },
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      flexWrap: 'wrap',
      marginLeft: -4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: RADIUS.chip,
    },
    chipText: {
      // One step smaller than the title's secondary line so the meta
      // row reads as supporting context, not headline content.
      fontSize: TYPE.caption,
      fontWeight: '500',
    },
    // Category label ink: the category's own color stays on the small icon
    // only — saturated category hues (Home green, Other orange) are ~2:1 as
    // text, so the label uses the theme's secondary ink (≥4.5:1).
    chipTextCategory: {
      color: c.label2,
      fontWeight: '600',
    },
    chipTextMuted: {
      color: c.label3,
      fontWeight: '500',
    },
    chipTextMutedItalic: {
      color: c.label3,
      fontWeight: '500',
      fontStyle: 'italic',
    },
    chipTextDate: {
      color: c.label3,
      fontWeight: '500',
    },
    chipTextOverdue: {
      // Calm lens: overdue is information, not an alarm. Use the same soft
      // orange as "today" (was c.red) — the app already reframes overdue as
      // "carried over" and hides its count in the filter bar; the red chip
      // was the one place it still raised its voice. Red stays for destructive.
      color: c.warmText,
      fontWeight: '700',
    },
    chipTextToday: {
      color: c.warmText,
      fontWeight: '700',
    },
    metaSep: { color: c.label3, fontSize: TYPE.caption, marginHorizontal: 2 },
    progressPill: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 1,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primarySoft,
    },
    progressPillText: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
      lineHeight: 13,
    },
    // The row when its step list shows below it: the list's block carries
    // the bottom padding instead, so the card reads as one piece.
    rowWithSteps: { paddingBottom: 0 },
    // The step list, a sibling of the row's Pressable (so VoiceOver reaches
    // each step). Indented to the title: row padding + 22pt circle + row gap.
    stepsBlock: {
      backgroundColor: c.card,
      paddingLeft: SPACING.lg + 22 + SPACING.sm,
      paddingRight: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    subList: {
      // The body's gap (xs) + the list's own top margin (xs) it had inside the row.
      marginTop: SPACING.xs * 2,
      gap: 2,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.xs,
      // Indented to read as nested under the parent task, not as a peer.
      paddingLeft: 28,
    },
    subPriorityBtn: {
      padding: 3,
    },
    subChip: {
      paddingHorizontal: SPACING.xs,
      paddingVertical: 1,
      borderRadius: RADIUS.chip,
    },
    subChipText: {
      fontSize: TYPE.caption,
      fontWeight: '500',
    },
    subCheckbox: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCheckboxDone: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    subCheckmark: {
      color: c.primaryOn,
      fontSize: TYPE.caption,
      fontWeight: '700',
      lineHeight: 13,
    },
    subText: {
      flex: 1,
      fontSize: TYPE.body,
      // Lighter weight than the parent (which is 500/600) so the
      // hierarchy reads correctly when expanded.
      fontWeight: '400',
      color: c.label2,
      lineHeight: 19,
    },
    subTextDone: {
      color: c.label3,
      textDecorationLine: 'line-through',
    },
    swipeContainer: {
      overflow: 'hidden',
      borderRadius: RADIUS.card,
    },
    // Soft lift + rounded edges for each card. Lives on a wrapper
    // OUTSIDE swipeContainer (which clips, so a shadow there wouldn't
    // show). Subtle + sleek; small vertical margin separates the
    // rounded cards.
    cardShadow: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      marginVertical: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.07,
      shadowRadius: 5,
      elevation: 2,
    },
    swipeAction: {
      width: 86,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
    },
    swipeActionsRow: { flexDirection: 'row' },
    swipeEdit:    { backgroundColor: c.primary },
    // Defer is the one warm action (the warm-text amber family); Skip and
    // Delete share the neutral fill. Same outline-icon weight on all three.
    swipeDefer:   { backgroundColor: c.orange },
    swipeMarkDone: { backgroundColor: c.green },
    // swipeTrash = the reversible actions (Skip, Delete on an active row →
    // the 30-day Done bin). Calm muted sage — red is reserved for truly
    // irreversible actions (Delete permanently in the bin, Delete all).
    swipeTrash:   { backgroundColor: c.gray },
    swipeRestore: { backgroundColor: c.green },
    swipeDelete:  { backgroundColor: c.red },
    swipeActionTextInk: { color: '#1F2A24' },
    // Default ink = on-accent (the Edit fill); other fills override it
    // (SWIPE_INK on pastels, onDanger on red).
    swipeActionText: {
      color: c.primaryOn,
      fontSize: TYPE.footnote,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    dateOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
    },
    dateSheet: {
      backgroundColor: c.modal,
      borderRadius: RADIUS.card,
      paddingHorizontal: SPACING.sm,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
      width: '100%',
      maxWidth: 360,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
    },
    dateBtnRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    dateClear: {
      color: c.label2,
      fontSize: TYPE.bodyLg,
      fontWeight: '500',
    },
    dateDone: {
      color: c.blue,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
    },
    datePendingLabel: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.label2,
      textAlign: 'center',
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
  })
}


export type Styles = ReturnType<typeof makeStyles>;
