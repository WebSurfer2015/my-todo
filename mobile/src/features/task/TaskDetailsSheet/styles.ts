import { Platform, StyleSheet } from "react-native";
import { ThemeColors } from "../../../app/theme";

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
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
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      paddingHorizontal: 16,
      maxHeight: '90%',
      minHeight: '50%',
    },
    // Step / subtask edit views — shaved bottom padding so the Done
    // CTA doesn't float over a large empty band. The 8px floor still
    // clears the iOS home indicator on phones that have one.
    sheetTight: {
      paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: c.label,
      lineHeight: 23,
    },
    titleEdit: {
      fontSize: 18,
      fontWeight: '700',
      color: c.label,
      lineHeight: 23,
      backgroundColor: c.bg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    subtitle: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    statusPill_notstarted: { backgroundColor: c.bg },
    statusPill_progress: { backgroundColor: 'rgba(255,149,0,0.18)' },
    statusPill_done: { backgroundColor: 'rgba(52,199,89,0.20)' },
    statusPillText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    statusPillText_notstarted: { color: c.label2 },
    statusPillText_progress: { color: '#FF9500' },
    statusPillText_done: { color: '#34C759' },
    metaSep: { color: c.label3, fontSize: 12 },
    metaCat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaCatText: { fontSize: 12, fontWeight: '600' },
    metaDate: { fontSize: 12, fontWeight: '500', color: c.label2 },
    metaDateOverdue: { color: c.red, fontWeight: '600' },
    metaDateToday: { color: c.orange, fontWeight: '600' },
    metaDateMuted: { color: c.label3, fontStyle: 'italic' },
    metaProgress: { fontSize: 12, color: c.label2, fontVariant: ['tabular-nums'] },
    closeBtn: { padding: 4 },
    list: { flexGrow: 0, flexShrink: 1 },
    listFilled: { paddingVertical: 8, gap: 6 },
    listEmpty: { paddingVertical: 24, alignItems: 'center' },

    /* Subtask row — borderless single line, sidecar style.
       paddingHorizontal:14 matches the editFieldRowInGroup so the checkbox
       aligns with the Category/Completed-by icons above. */
    subCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingLeft: 14,
      paddingRight: 14,
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
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 14,
    },
    subCardTapArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    subCardText: { flex: 1, fontSize: 15, color: c.label, letterSpacing: -0.2 },
    subCardTextDone: { color: c.label3, textDecorationLine: 'line-through' },
    subCardTextEdit: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    subPriorityBtn: { padding: 4 },
    subDateChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 5,
    },
    subDateChipText: { fontSize: 12, fontWeight: '500' },
    subDateChipMuted: { color: c.gray3, fontStyle: 'italic', fontWeight: '500' },
    subDateChipPlain: { color: c.label3, fontWeight: '500' },
    subDateChipOverdue: { color: c.red, fontWeight: '600' },
    subDateChipToday: { color: c.orange, fontWeight: '600' },
    subRemoveBtn: { padding: 4 },

    /* Action bar (view mode): Add a subtask primary */
    actionBar: {
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    addSubtaskBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
    },
    addSubtaskBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    /* Header: Cancel | Edit to-do | Save */
    editHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 12,
    },
    editHeaderTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    headerSideBtn: {
      width: 64,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.blue,
    },
    saveHeaderText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.blue,
      textAlign: 'right',
    },
    saveHeaderTextDisabled: {
      color: c.gray3,
    },
    cancelHeaderText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.label2,
      textAlign: 'left',
    },
    /* R6a — Edit-scope segmented control (series rows only) */
    editModeWrap: {
      paddingHorizontal: 4,
      paddingBottom: 12,
    },
    editModeSegmented: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: 999,
      padding: 3,
    },
    editModeSegment: {
      flex: 1,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editModeSegmentActive: {
      backgroundColor: c.card,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 2,
      elevation: 1,
    },
    editModeSegmentText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.label2,
    },
    editModeSegmentTextActive: {
      color: c.label,
      fontWeight: '600',
    },
    editModeHelper: {
      marginTop: 8,
      fontSize: 12,
      color: c.label3,
      lineHeight: 16,
      textAlign: 'center',
    },
    /* Edit-mode body */
    editBody: {
      paddingTop: 16,
      paddingBottom: 16,
    },
    editGroupCard: {
      backgroundColor: c.bg,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
    },
    editTextInputInCard: {
      minHeight: 96,
      fontSize: 16,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 14,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    // Inline notes inside the title editGroupCard — smaller font and a
    // shorter min-height so the title remains the dominant element.
    // Matches ComposeSheet's notesInputInline footprint.
    notesInputInGroup: {
      minHeight: 56,
      fontSize: 14,
      lineHeight: 20,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 12,
    },
    editGroupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 14,
    },
    // Mochi-thinking accessory row — only renders while an AI call
    // is in flight. Mirrors the ComposeSheet styling so the
    // indicator looks the same on Add vs Edit.
    inputAccessoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingTop: 4,
      paddingBottom: 8,
    },
    editFieldRowInGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    subtaskSectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 4,
      marginBottom: 8,
    },
    notesSectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 16,
      marginBottom: 8,
    },
    notesCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 4,
    },
    notesInput: {
      fontSize: 15,
      lineHeight: 21,
      color: c.label,
      minHeight: 84,
      padding: 0,
    },
    editFieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    remindChipRow: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    remindChipRowLabel: {
      fontSize: 13,
      color: c.label2,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    remindChipScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    remindChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    remindChipActive: {
      backgroundColor: c.primary,
    },
    remindChipText: {
      fontSize: 13,
      color: c.primary,
      fontWeight: '600',
    },
    remindChipTextActive: {
      color: c.primaryOn,
    },
    remindPreviewWrap: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 12,
      alignItems: 'center',
    },
    remindPreviewText: {
      fontSize: 15,
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
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
    },
    editFieldValue: {
      fontSize: 15,
      color: c.label2,
      maxWidth: 160,
    },
    editFieldValueMuted: {
      color: c.gray3,
    },
    editChevron: {
      fontSize: 18,
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
      gap: 6,
    },
    datePresetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      paddingTop: 12,
      paddingHorizontal: 8,
    },
    datePresetChip: {
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    datePresetChipActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    datePresetChipText: { fontSize: 13, fontWeight: '600', color: c.label2 },
    datePresetChipTextActive: { color: c.primary },
    dateWrap: {
      paddingTop: 8,
      alignItems: 'center',
    },
    datePendingLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.label2,
      marginBottom: 8,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
    dateActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 12,
    },
    dateClearBtn: {
      flex: 1,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateClearBtnText: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    dateDoneBtn: {
      flex: 1.4,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDoneBtnSolo: {
      flex: 1,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDoneBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    // Row holding the STEPS header on the left and the Suggest steps
    // pill on the right. Mirrors the web subtask-section-header row.
    subtaskSectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      minHeight: 24,
      marginBottom: 4,
    },
    // Bottom-of-section row: Clear all (left) + Add a step (right).
    // Rendered after the subtask list (or empty state) and after the
    // optional Suggest review panel.
    subtaskActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingTop: 6,
    },
    // Empty-list variant — only the Add link renders, so center it
    // instead of letting space-between push it to one edge.
    subtaskActionsRowCentered: {
      justifyContent: 'center',
    },
    addSubtaskLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    clearStepsLink: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    clearStepsLinkText: {
      color: c.label3,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    destructiveAction: {
      alignItems: 'flex-start',
      paddingVertical: 14,
      paddingHorizontal: 4,
      marginTop: 12,
    },
    destructiveActionText: {
      color: c.label3,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: -0.16,
    },
    subEditDoneBtn: {
      // Tightened from 16 to 8 so the Done CTA hugs the field group.
      marginTop: 8,
      alignSelf: 'stretch',
      backgroundColor: c.primary,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Step view's ScrollView contentContainerStyle — shaves the
    // paddingBottom relative to the shared editBody so there's less
    // dead space under the Done CTA. Other edit views keep editBody.
    editStepBody: {
      paddingTop: 16,
      paddingBottom: 4,
    },
    editHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editHeaderSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: c.label2,
      maxWidth: '90%',
    },
    headerSideBtnRight: {
      alignItems: 'flex-end',
    },
    deleteHeaderText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.red,
      textAlign: 'right',
    },
    subEditDoneText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    bottomActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingHorizontal: 4,
    },
    bottomActionButton: {
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    deleteActionText: {
      color: c.red,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    markDoneActionText: {
      color: c.primary,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    seriesAction: {
      alignItems: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: 4,
      marginTop: 8,
    },
    seriesActionText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    addSubtaskLinkText: {
      color: c.blue,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.16,
    },

    dateOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
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
    dateClear: { color: c.label2, fontSize: 16, fontWeight: '500' },
    dateDone: { color: c.blue, fontSize: 16, fontWeight: '600' },
  })
}

export type Styles = ReturnType<typeof makeStyles>;
