import { Platform, StyleSheet } from "react-native";
import { ThemeColors, SPACING, RADIUS, TYPE } from "../../../app/theme";

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    overlayTouch: {
      flex: 1,
    },
    sheet: {
      backgroundColor: c.modal,
      // Sheet radius standardized to 18 across the app (was 16 here).
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: SPACING.sm,
      paddingBottom: Platform.OS === 'ios' ? SPACING.xxl : SPACING.lg,
      paddingHorizontal: SPACING.lg,
      maxHeight: '90%',
      minHeight: '50%',
    },
    // Grabber — added for swipe-to-dismiss + visual parity with every other
    // sheet (this one previously had none).
    grabHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: SPACING.xs,
    },
    // Step / subtask edit views — shaved bottom padding so the Done
    // CTA doesn't float over a large empty band. The 8px floor still
    // clears the iOS home indicator on phones that have one.
    sheetTight: {
      paddingBottom: Platform.OS === 'ios' ? SPACING.md : SPACING.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      paddingBottom: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    title: {
      fontSize: TYPE.title,
      fontWeight: '700',
      color: c.label,
      lineHeight: 25,
    },
    titleEdit: {
      fontSize: TYPE.title,
      fontWeight: '700',
      color: c.label,
      lineHeight: 23,
      backgroundColor: c.bg,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: 6,
    },
    subtitle: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    statusPill: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
    },
    statusPill_notstarted: { backgroundColor: c.bg },
    statusPill_progress: { backgroundColor: c.primarySoft },
    statusPill_done: { backgroundColor: c.primarySoft },
    statusPillText: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    statusPillText_notstarted: { color: c.label2 },
    statusPillText_progress: { color: c.orange },
    statusPillText_done: { color: c.green },
    metaSep: { color: c.label3, fontSize: TYPE.caption },
    metaCat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    metaCatText: { fontSize: TYPE.caption, fontWeight: '600' },
    metaDate: { fontSize: TYPE.caption, fontWeight: '500', color: c.label2 },
    // Calm lens: overdue is information, not an alarm — match TaskItem's soft
    // orange (was c.red). Red is reserved for destructive actions.
    metaDateOverdue: { color: c.orange, fontWeight: '600' },
    metaDateToday: { color: c.orange, fontWeight: '600' },
    metaDateMuted: { color: c.label3, fontStyle: 'italic' },
    metaProgress: { fontSize: TYPE.caption, color: c.label2, fontVariant: ['tabular-nums'] },
    closeBtn: { padding: SPACING.xs },
    list: { flexGrow: 0, flexShrink: 1 },
    listFilled: { paddingVertical: SPACING.sm, gap: SPACING.sm },
    listEmpty: { paddingVertical: SPACING.xl, alignItems: 'center' },

    /* Subtask row — borderless single line, sidecar style.
       paddingHorizontal: 16 matches the editFieldRowInGroup so the checkbox
       aligns with the Category/Completed-by icons above. */
    subCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingLeft: SPACING.lg,
      paddingRight: SPACING.lg,
    },
    subCardCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCardCheckboxDone: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    subCardCheckmark: {
      color: c.primaryOn,
      fontSize: TYPE.caption,
      fontWeight: '700',
      lineHeight: 14,
    },
    subCardTapArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: 2,
    },
    subCardText: { flex: 1, fontSize: TYPE.body, color: c.label, letterSpacing: -0.2 },
    subCardTextDone: { color: c.label3, textDecorationLine: 'line-through' },
    subCardTextEdit: {
      flex: 1,
      fontSize: TYPE.body,
      color: c.label,
      backgroundColor: c.bg,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: 4,
    },
    subPriorityBtn: { padding: SPACING.xs },
    subDateChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: 5,
    },
    subDateChipText: { fontSize: TYPE.caption, fontWeight: '500' },
    subDateChipMuted: { color: c.gray3, fontStyle: 'italic', fontWeight: '500' },
    subDateChipPlain: { color: c.label3, fontWeight: '500' },
    subDateChipOverdue: { color: c.orange, fontWeight: '600' },
    subDateChipToday: { color: c.orange, fontWeight: '600' },
    subRemoveBtn: { padding: SPACING.xs },

    /* Action bar (view mode): Add a subtask primary */
    actionBar: {
      paddingTop: SPACING.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    addSubtaskBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      height: 50,
      borderRadius: RADIUS.control,
      backgroundColor: c.blue,
    },
    addSubtaskBtnText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    /* Header: Cancel | Edit to-do | Save */
    editHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xs,
      paddingBottom: SPACING.md,
    },
    editHeaderTitle: {
      fontSize: TYPE.body,
      fontWeight: '700',
      color: c.label,
    },
    headerSideBtn: {
      width: 64,
    },
    cancelText: {
      fontSize: TYPE.body,
      fontWeight: '500',
      color: c.blue,
    },
    saveHeaderText: {
      fontSize: TYPE.body,
      fontWeight: '700',
      color: c.blue,
      textAlign: 'right',
    },
    saveHeaderTextDisabled: {
      color: c.gray3,
    },
    cancelHeaderText: {
      fontSize: TYPE.body,
      fontWeight: '500',
      color: c.label2,
      textAlign: 'left',
    },
    /* R6a — Edit-scope segmented control (series rows only) */
    editModeWrap: {
      paddingHorizontal: SPACING.xs,
      paddingBottom: SPACING.md,
    },
    editModeCaption: {
      fontSize: TYPE.caption,
      color: c.label3,
      fontWeight: '500',
      textAlign: 'center',
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.sm,
    },
    editFieldLockHint: {
      fontSize: TYPE.caption,
      color: c.label3,
      fontWeight: '500',
      marginLeft: 2,
    },
    editModeSegmented: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: RADIUS.pill,
      padding: 3,
    },
    editModeSegment: {
      flex: 1,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.pill,
      alignItems: 'center',
      justifyContent: 'center',
      // Transparent border on both segments so the active one can gain a
      // colored border without shifting layout by 1px.
      borderWidth: 1,
      borderColor: 'transparent',
    },
    editModeSegmentActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
      elevation: 2,
    },
    editModeSegmentText: {
      fontSize: TYPE.footnote,
      fontWeight: '500',
      color: c.label2,
    },
    editModeSegmentTextActive: {
      color: c.primaryOn,
      fontWeight: '700',
    },
    editModeHelper: {
      marginTop: SPACING.sm,
      fontSize: TYPE.caption,
      color: c.label3,
      lineHeight: 16,
      textAlign: 'center',
    },
    /* Edit-mode body */
    editBody: {
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    editGroupCard: {
      backgroundColor: c.bg,
      borderRadius: RADIUS.card,
      overflow: 'hidden',
      marginBottom: SPACING.lg,
    },
    editTextInputInCard: {
      minHeight: 96,
      fontSize: TYPE.bodyLg,
      color: c.label,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    // Inline notes inside the title editGroupCard — smaller font and a
    // shorter min-height so the title remains the dominant element.
    // Matches ComposeSheet's notesInputInline footprint.
    notesInputInGroup: {
      minHeight: 56,
      fontSize: TYPE.body,
      lineHeight: 20,
      color: c.label,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    editGroupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: SPACING.lg,
    },
    // Mochi-thinking accessory row — only renders while an AI call
    // is in flight. Mirrors the ComposeSheet styling so the
    // indicator looks the same on Add vs Edit.
    inputAccessoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
    },
    editFieldRowInGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    subtaskSectionHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    notesSectionHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    notesCard: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      marginBottom: SPACING.xs,
    },
    notesInput: {
      fontSize: TYPE.body,
      lineHeight: 21,
      color: c.label,
      minHeight: 84,
      padding: 0,
    },
    editFieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    remindChipRow: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    remindChipRowLabel: {
      fontSize: TYPE.footnote,
      color: c.label2,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    remindChipScroll: {
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingVertical: SPACING.xs,
    },
    remindChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primarySoft,
    },
    remindChipActive: {
      backgroundColor: c.primary,
    },
    remindChipText: {
      fontSize: TYPE.footnote,
      color: c.primary,
      fontWeight: '600',
    },
    remindChipTextActive: {
      color: c.primaryOn,
    },
    remindPreviewWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      alignItems: 'center',
    },
    remindPreviewText: {
      fontSize: TYPE.body,
      color: c.label,
      fontWeight: '600',
      textAlign: 'center',
    },
    remindPreviewTextMuted: {
      color: c.label3,
      fontWeight: '500',
    },
    editFieldLabel: {
      flex: 1,
      fontSize: TYPE.body,
      color: c.label,
      fontWeight: '500',
    },
    editFieldValue: {
      fontSize: TYPE.body,
      color: c.label2,
      maxWidth: 160,
    },
    editFieldValueMuted: {
      color: c.gray3,
    },
    editChevron: {
      fontSize: TYPE.title,
      color: c.gray3,
      fontWeight: '300',
      marginLeft: 2,
    },
    editDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 44,
    },
    editSubtasks: {
      gap: SPACING.sm,
    },
    datePresetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingTop: SPACING.md,
      paddingHorizontal: SPACING.sm,
    },
    datePresetChip: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    datePresetChipActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    datePresetChipText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.label2 },
    datePresetChipTextActive: { color: c.primary },
    dateWrap: {
      paddingTop: SPACING.sm,
      alignItems: 'center',
    },
    datePendingLabel: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.label2,
      marginBottom: SPACING.sm,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
    dateActions: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.md,
    },
    dateClearBtn: {
      flex: 1,
      height: 50,
      borderRadius: RADIUS.control,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateClearBtnText: {
      color: c.label2,
      fontSize: TYPE.bodyLg,
      fontWeight: '500',
    },
    dateDoneBtn: {
      flex: 1.4,
      height: 50,
      borderRadius: RADIUS.control,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDoneBtnSolo: {
      flex: 1,
      height: 50,
      borderRadius: RADIUS.control,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDoneBtnText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
    },
    // Row holding the STEPS header on the left and the Suggest steps
    // pill on the right. Mirrors the web subtask-section-header row.
    subtaskSectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.md,
      minHeight: 24,
      marginBottom: SPACING.xs,
    },
    // Bottom-of-section row: Clear all (left) + Add a step (right).
    // Rendered after the subtask list (or empty state) and after the
    // optional Suggest review panel.
    subtaskActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.md,
      paddingTop: SPACING.sm,
    },
    // Empty-list variant — only the Add link renders, so center it
    // instead of letting space-between push it to one edge.
    subtaskActionsRowCentered: {
      justifyContent: 'center',
    },
    addSubtaskLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    clearStepsLink: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    clearStepsLinkText: {
      color: c.label3,
      fontSize: TYPE.caption,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    destructiveAction: {
      alignItems: 'flex-start',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      marginTop: SPACING.md,
    },
    destructiveActionText: {
      color: c.label3,
      fontSize: TYPE.body,
      fontWeight: '500',
      letterSpacing: -0.16,
    },
    subEditDoneBtn: {
      // Tightened from 16 to 8 so the Done CTA hugs the field group.
      marginTop: SPACING.sm,
      alignSelf: 'stretch',
      backgroundColor: c.primary,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.control,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Step view's ScrollView contentContainerStyle — shaves the
    // paddingBottom relative to the shared editBody so there's less
    // dead space under the Done CTA. Other edit views keep editBody.
    editStepBody: {
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xs,
    },
    editHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editHeaderSubtitle: {
      marginTop: 2,
      fontSize: TYPE.caption,
      color: c.label2,
      maxWidth: '90%',
    },
    headerSideBtnRight: {
      alignItems: 'flex-end',
    },
    deleteHeaderText: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.red,
      textAlign: 'right',
    },
    subEditDoneText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    // Sticky footer — pinned below the scrollable content; holds Save +
    // the Delete/Skip/Mark-done row. Solid sheet background so scrolled
    // content doesn't bleed through, hairline divider on top.
    stickyFooter: {
      backgroundColor: c.modal,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.lg,
    },
    // Primary commit button — Save moved here from the header.
    primarySaveBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.lg,
      marginHorizontal: SPACING.xs,
    },
    primarySaveBtnText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    // Disabled field row (e.g. Repeat in "Edit this only").
    editFieldRowDisabled: {
      opacity: 0.4,
    },
    bottomActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    bottomActionButton: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    skipActionText: {
      color: c.label2,
      fontSize: TYPE.body,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    deleteActionText: {
      color: c.red,
      fontSize: TYPE.body,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    markDoneActionText: {
      color: c.primary,
      fontSize: TYPE.body,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    seriesAction: {
      alignItems: 'flex-start',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      marginTop: SPACING.sm,
    },
    seriesActionText: {
      color: c.primary,
      fontSize: TYPE.body,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    addSubtaskLinkText: {
      color: c.blue,
      fontSize: TYPE.body,
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
    dateClear: { color: c.label2, fontSize: TYPE.bodyLg, fontWeight: '500' },
    dateDone: { color: c.blue, fontSize: TYPE.bodyLg, fontWeight: '600' },
  })
}

export type Styles = ReturnType<typeof makeStyles>;
