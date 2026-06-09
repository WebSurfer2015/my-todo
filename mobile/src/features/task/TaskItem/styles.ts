import { StyleSheet } from "react-native";
import { ThemeColors } from "../../../app/theme";
import { Density } from "../../../core-bindings/profile";

export function makeStyles(c: ThemeColors, density: Density) {
  const compact = density === 'compact'
  return StyleSheet.create({
    rowFlash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.primarySoft,
      borderRadius: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: compact ? 7 : 12,
      paddingLeft: 16,
      paddingRight: 16,
      backgroundColor: c.card,
      gap: 10,
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
      borderColor: c.gray3,
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
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 15,
    },
    removedMark: {
      color: c.label3,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 16,
    },
    body: {
      flex: 1,
      gap: compact ? 1 : 4,
    },
    mainLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    text: {
      flex: 1,
      // Bumped title weight so it carries the row visually; the meta
      // chips below are intentionally smaller/dimmer so they read as
      // secondary information.
      fontSize: compact ? 15 : 17,
      fontWeight: '500',
      color: c.label,
      lineHeight: compact ? 20 : 22,
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
      fontSize: 16,
      color: c.label,
      lineHeight: 21,
      letterSpacing: -0.3,
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    priorityBtn: {
      padding: 4,
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
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 5,
    },
    chipText: {
      // One step smaller than the title's secondary line so the meta
      // row reads as supporting context, not headline content.
      fontSize: 11,
      fontWeight: '500',
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
      color: c.red,
      fontWeight: '700',
    },
    chipTextToday: {
      color: c.orange,
      fontWeight: '700',
    },
    expandToggle: {
      width: 22,
      height: compact ? 19 : 21,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    metaSep: { color: c.label3, fontSize: 11, marginHorizontal: 2 },
    progressPill: {
      marginLeft: 'auto',
      paddingHorizontal: 8,
      paddingVertical: 1,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    progressPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
      lineHeight: 13,
    },
    subList: {
      marginTop: 4,
      gap: 2,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
      // Indented to read as nested under the parent task, not as a peer.
      paddingLeft: 28,
    },
    subPriorityBtn: {
      padding: 3,
    },
    subChip: {
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    subChipText: {
      fontSize: 11,
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
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 13,
    },
    subText: {
      flex: 1,
      fontSize: 14,
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
    },
    swipeAction: {
      width: 86,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    swipeActionsRow: { flexDirection: 'row' },
    notDoIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notDoIconX: {
      color: c.gray,
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 14,
    },
    swipeEdit:    { backgroundColor: c.blue },
    swipeDefer:   { backgroundColor: c.orange },
    swipeMarkDone: { backgroundColor: c.green },
    // swipeTrash sends a row to the reversible 30-day bin (same destination
    // as the checkbox/Mark-done). Calm muted sage — red is reserved for
    // truly irreversible actions (Empty bin, Delete permanently).
    swipeTrash:   { backgroundColor: c.gray },
    swipeRestore: { backgroundColor: c.green },
    swipeDelete:  { backgroundColor: c.red },
    swipeActionText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    dateOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    dateSheet: {
      backgroundColor: c.modal,
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 8,
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
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    dateClear: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    dateDone: {
      color: c.blue,
      fontSize: 16,
      fontWeight: '600',
    },
    datePendingLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.label2,
      textAlign: 'center',
      paddingTop: 8,
      paddingBottom: 4,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
  })
}


export type Styles = ReturnType<typeof makeStyles>;
