import { StyleSheet } from "react-native";
import { ThemeColors } from "../../../app/theme";

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 16,
      paddingBottom: 24,
      paddingHorizontal: 16,
      // Cap at 90% of the (keyboard-aware) viewport. Without this,
      // when the keyboard opens the sheet's content can push past the
      // top of the screen — the title row and to-do textbox scroll
      // off-screen and become unreachable. Mirrors TaskDetailsSheet's
      // sheet which already had this cap.
      maxHeight: '90%',
      minHeight: 420,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 8,
    },
    askMochiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 18,
      marginTop: 2,
      marginBottom: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    askMochiText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.primary,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.blue,
      width: 56,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      paddingTop: 4,
      paddingBottom: 16,
    },
    textInput: {
      minHeight: 96,
      fontSize: 16,
      color: c.label,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    // Variant of textInput that lives inside the same card as the
    // field rows (mirrors Edit-Todo layout). No border/corners since
    // the wrapping fieldGroup card handles those.
    textInputInCard: {
      minHeight: 64,
      fontSize: 16,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    headerSideBtn: { width: 60 },
    saveHeaderText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: '700',
      textAlign: 'right',
    },
    saveHeaderTextDisabled: { color: c.gray3 },
    sectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    // Row that holds the STEPS heading on the left and the
    // Suggest steps trigger pill on the right when applicable.
    // Mirrors TaskDetailsSheet's subtaskSectionRow.
    stepsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    stepsCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    stepsEmpty: {
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    stepsEmptyDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.label3,
      marginBottom: 8,
    },
    stepsEmptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.label,
      marginBottom: 4,
    },
    stepsEmptyHint: {
      fontSize: 12,
      color: c.label3,
      textAlign: 'center',
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    stepCheckbox: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: c.gray3,
    },
    stepBody: { flex: 1 },
    stepText: { fontSize: 14, color: c.label },
    stepMeta: { fontSize: 11, color: c.label3, marginTop: 2 },
    stepRemoveBtn: { paddingHorizontal: 6 },
    stepRemoveText: { fontSize: 20, color: c.label3, lineHeight: 22 },
    addStepRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
    },
    addStepText: { fontSize: 14, color: c.blue, fontWeight: '600' },
    fieldGroup: {
      marginTop: 16,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // Title + inline notes — sits above the suggestion list so the
    // user's typing surface is anchored at the top of the sheet.
    // Notes lives inside the same card under a hairline so quick
    // context capture doesn't require scrolling past every field row.
    titleCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    titleCardDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginHorizontal: 14,
    },
    notesInputInline: {
      minHeight: 56,
      fontSize: 14,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 12,
      lineHeight: 19,
    },
    // Anchor wrapper for the title input + floating overlay. position:
    // relative so the overlay can absolute-position itself against
    // this container without escaping the parent sheet's coordinate
    // system. zIndex pulls the wrapper above the body ScrollView so
    // the overlay clip path covers form content underneath.
    titleAnchor: {
      position: 'relative',
      zIndex: 10,
    },
    inputAccessoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 8,
      minHeight: 22,
    },
    aiBusyText: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    aiBusyLabel: {
      fontSize: 12,
      fontStyle: 'italic',
      color: c.label3,
      letterSpacing: -0.1,
    },
    // Suggestion overlay — anchored to the bottom edge of the title
    // card (top: 100%) so it appears to drop down from where the
    // user is typing. Doesn't push the form below; just floats over
    // it. The inner ScrollView caps tall lists at maxHeight.
    dupeOverlay: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 8,
      zIndex: 11,
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
    },
    dupeScroll: {
      maxHeight: 240,
    },
    dupeScrollContent: {
      paddingBottom: 0,
    },
    dupePanel: {
      marginTop: 14,
      marginBottom: 4,
    },
    dupeHeaderRow: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 8,
    },
    dupeHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.primary,
    },
    // Suggestion list reads as a distinct surface — mint-tinted
    // background + primary-tinted border + slight inner shadow so the
    // user immediately registers it as "history / past entries", not
    // part of the new-todo form being composed below.
    dupeCard: {
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
      overflow: 'hidden',
    },
    dupeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minHeight: 40,
    },
    dupeRowText: { flex: 1, fontSize: 14, color: c.label },
    dupeRowIconSpacer: { width: 14 },
    dupeRowMeta: {
      fontSize: 12,
      color: c.label3,
      maxWidth: 110,
    },
    dupeRowRecur: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    dupeDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.primary,
      opacity: 0.18,
      marginLeft: 38,
    },
    dupeDividerFull: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.primary,
      opacity: 0.18,
    },
    dupeHint: {
      fontSize: 12,
      color: c.label2,
      paddingHorizontal: 12,
      paddingVertical: 10,
      lineHeight: 16,
      fontStyle: 'italic',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    fieldLabel: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
    },
    fieldValue: {
      fontSize: 15,
      color: c.label2,
      maxWidth: 160,
    },
    fieldValueMuted: {
      color: c.gray3,
    },
    chevron: {
      fontSize: 18,
      color: c.gray3,
      fontWeight: '300',
      marginLeft: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 44,
    },
    addBtn: {
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      backgroundColor: c.gray3,
      opacity: 0.5,
    },
    addBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
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
      alignItems: 'center',
      marginTop: 8,
    },
    // Mirrors TaskDetailsSheet — header-right "Clear" link tint.
    dateClearBtnText: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    // Mirrors TaskDetailsSheet — primary-color Save button that spans
    // the row in the date subview when there's no sibling Clear
    // button to compete with it.
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
    clearBtn: {
      flex: 1,
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    applyBtn: {
      flex: 1.4,
    },
    doneHeaderText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.blue,
      width: 56,
      textAlign: 'right',
    },
    clearLink: {
      alignSelf: 'center',
      paddingVertical: 6,
      marginTop: 4,
    },
    clearLinkText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.red,
    },
  })
}

export type Styles = ReturnType<typeof makeStyles>;
