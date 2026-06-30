import { StyleSheet } from "react-native";
import { ThemeColors, SPACING, RADIUS, TYPE } from "../../../app/theme";

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
      // Sheet top corners are standardized to 18 across the app — kept raw
      // (RADIUS.card is 14, which would make this sheet flatter than the rest).
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xl,
      paddingHorizontal: SPACING.lg,
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
      marginBottom: SPACING.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: SPACING.sm,
    },
    askMochiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      marginTop: 2,
      marginBottom: SPACING.md,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    askMochiText: {
      fontSize: TYPE.body,
      fontWeight: '700',
      color: c.primary,
    },
    cancelText: {
      fontSize: TYPE.body,
      fontWeight: '500',
      color: c.blue,
      width: 56,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    title: {
      fontSize: TYPE.title,
      fontWeight: '700',
      color: c.label,
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.lg,
    },
    textInput: {
      minHeight: 96,
      fontSize: TYPE.bodyLg,
      color: c.label,
      backgroundColor: c.card,
      borderRadius: RADIUS.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    // Variant of textInput that lives inside the same card as the
    // field rows (mirrors Edit-Todo layout). No border/corners since
    // the wrapping fieldGroup card handles those.
    textInputInCard: {
      minHeight: 64,
      fontSize: TYPE.bodyLg,
      color: c.label,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    headerSideBtn: { width: 60 },
    saveHeaderText: {
      fontSize: TYPE.body,
      color: c.blue,
      fontWeight: '700',
      textAlign: 'right',
    },
    saveHeaderTextDisabled: { color: c.gray3 },
    sectionHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 20,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    // Row that holds the STEPS heading on the left and the
    // Suggest steps trigger pill on the right when applicable.
    // Mirrors TaskDetailsSheet's subtaskSectionRow.
    stepsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.md,
      marginTop: 20,
      marginBottom: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    stepsCard: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    stepsEmpty: {
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
    },
    stepsEmptyDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.label3,
      marginBottom: SPACING.sm,
    },
    stepsEmptyTitle: {
      fontSize: TYPE.body,
      fontWeight: '700',
      color: c.label,
      marginBottom: SPACING.xs,
    },
    stepsEmptyHint: {
      fontSize: TYPE.caption,
      color: c.label3,
      textAlign: 'center',
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    stepCheckbox: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: c.gray3,
    },
    stepBody: { flex: 1 },
    stepText: { fontSize: TYPE.body, color: c.label },
    stepMeta: { fontSize: TYPE.caption, color: c.label3, marginTop: 2 },
    stepRemoveBtn: { paddingHorizontal: SPACING.sm },
    stepRemoveText: { fontSize: TYPE.title, color: c.label3, lineHeight: 22 },
    addStepRow: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
    },
    addStepText: { fontSize: TYPE.body, color: c.blue, fontWeight: '600' },
    fieldGroup: {
      marginTop: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
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
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    titleCardDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginHorizontal: SPACING.lg,
    },
    notesInputInline: {
      minHeight: 56,
      fontSize: TYPE.body,
      color: c.label,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
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
      paddingHorizontal: SPACING.sm,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      minHeight: 22,
    },
    aiBusyText: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    aiBusyLabel: {
      fontSize: TYPE.caption,
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
      marginTop: SPACING.sm,
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
      marginTop: SPACING.lg,
      marginBottom: SPACING.xs,
    },
    dupeHeaderRow: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
    },
    dupeHeader: {
      fontSize: TYPE.caption,
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
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
      overflow: 'hidden',
    },
    dupeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      minHeight: 40,
    },
    dupeRowText: { flex: 1, fontSize: TYPE.body, color: c.label },
    dupeRowIconSpacer: { width: 14 },
    dupeRowMeta: {
      fontSize: TYPE.caption,
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
      fontSize: TYPE.caption,
      color: c.label2,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      lineHeight: 16,
      fontStyle: 'italic',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    fieldLabel: {
      flex: 1,
      fontSize: TYPE.body,
      color: c.label,
      fontWeight: '500',
    },
    fieldValue: {
      fontSize: TYPE.body,
      color: c.label2,
      maxWidth: 160,
    },
    fieldValueMuted: {
      color: c.gray3,
    },
    chevron: {
      fontSize: TYPE.title,
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
      borderRadius: RADIUS.control,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      backgroundColor: c.gray3,
      opacity: 0.5,
    },
    addBtnText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      letterSpacing: -0.16,
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
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    // Mirrors TaskDetailsSheet — header-right "Clear" link tint.
    dateClearBtnText: {
      color: c.label2,
      fontSize: TYPE.bodyLg,
      fontWeight: '500',
    },
    // Mirrors TaskDetailsSheet — primary-color Save button that spans
    // the row in the date subview when there's no sibling Clear
    // button to compete with it.
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
    clearBtn: {
      flex: 1,
      marginTop: 20,
      height: 50,
      borderRadius: RADIUS.control,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: {
      color: c.label2,
      fontSize: TYPE.bodyLg,
      fontWeight: '500',
    },
    applyBtn: {
      flex: 1.4,
    },
    doneHeaderText: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.blue,
      width: 56,
      textAlign: 'right',
    },
    clearLink: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
      marginTop: SPACING.xs,
    },
    clearLinkText: {
      fontSize: TYPE.footnote,
      fontWeight: '500',
      color: c.red,
    },
  })
}

export type Styles = ReturnType<typeof makeStyles>;
