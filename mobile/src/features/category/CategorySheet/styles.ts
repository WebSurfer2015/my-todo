import { StyleSheet } from "react-native";
import { ThemeColors, SPACING, RADIUS, TYPE } from "../../../app/theme";

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      // Height is set inline from Dimensions (~85% of screen) so the
      // inner ScrollView gets a bounded container and reliably scrolls
      // when category lists are long. Percentage maxHeight here left
      // the +Add Category row stranded below the viewport.
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: 28,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: SPACING.md,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    // Inline note under the header (category deleted · Undo, pin cap).
    noticeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      marginTop: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.card,
      backgroundColor: c.surface,
    },
    noticeText: { flex: 1, fontSize: TYPE.footnote, color: c.label2 },
    noticeAction: { fontSize: TYPE.footnote, fontWeight: "700", color: c.primary },
    headerTitle: { fontSize: TYPE.title, fontWeight: "700", color: c.label },
    headerLeft: { fontSize: TYPE.bodyLg, fontWeight: "500", color: c.primary },
    headerRight: { fontSize: TYPE.bodyLg, fontWeight: "600", color: c.primary },
    // "Reset" in view mode — deliberately muted so it doesn't compete with the
    // green primary "Set Filter" footer button (which owns the commit).
    headerReset: { fontSize: TYPE.body, fontWeight: "500", color: c.label2 },
    // Balances Cancel so the title stays centered when the header's
    // right-side Done is hidden (Select Filter → Done is sticky below).
    headerRightSpacer: { minWidth: 56 },
    // Sticky footer holding the Select Filter Done button.
    viewStickyFooter: {
      backgroundColor: c.modal,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    title: {
      fontSize: TYPE.bodyLg,
      fontWeight: "700",
      marginBottom: SPACING.lg,
      color: c.label,
    },
    body: { flex: 1 },
    bodyContent: { paddingTop: SPACING.xs, paddingBottom: SPACING.md },
    multiSelectNote: {
      fontSize: TYPE.caption,
      color: c.label3,
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: 2,
      paddingBottom: SPACING.sm,
    },
    sectionHeader: {
      // Comfort: was 11/14/8 — bumped to 12/20/12 so section breaks
      // breathe and the sheet feels less crammed.
      fontSize: TYPE.caption,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 20,
      marginBottom: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    listCard: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: "hidden",
    },
    viewRow: {
      flexDirection: "row",
      alignItems: "center",
      // Comfort: gap 12 → 14, paddings 14 → 16/18 so rows have the
      // same exhale as EmptyStateCard's interior.
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowIcon: { width: 20, alignItems: "center" },
    viewRowLabel: { flex: 1, fontSize: TYPE.bodyLg, fontWeight: "500", color: c.label },
    viewRowCount: {
      fontSize: TYPE.body,
      color: c.label3,
      fontVariant: ["tabular-nums"],
      minWidth: 28,
      textAlign: "right",
    },
    checkPlaceholder: { width: 18 },
    viewRowEdit: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.xs,
    },
    editCatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xs,
      paddingBottom: SPACING.md,
    },
    cancelText: {
      fontSize: TYPE.body,
      color: c.label2,
      fontWeight: '500',
    },
    editCatHeaderSide: {
      width: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editCatTitle: {
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      color: c.label,
      letterSpacing: -0.2,
    },
    editCatSaveBtn: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.control,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editCatSaveBtnDisabled: {
      opacity: 0.4,
    },
    editCatSaveText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    viewDoneBtn: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      marginBottom: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.control,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewDoneText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    editRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    editRowActive: {
      backgroundColor: c.surface,
      borderRadius: 8,
      borderBottomWidth: 0,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 4,
    },
    editRowLabel: { fontSize: TYPE.body, color: c.label, fontWeight: "500", flexShrink: 1 },
    // Wrap the label in a flex:1 tap target so the row's whole label-area
    // is the rename hit area, not just the visible glyphs.
    editRowLabelTap: { flex: 1, justifyContent: "center", paddingVertical: SPACING.xs },
    // Inner cluster — label + a small pencil glyph to signal the row is
    // tap-to-rename. The pencil is dim by default and only present in
    // Configure mode (this view is only rendered there).
    editRowLabelInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    // Subtle highlight to signal the field is in inline-edit mode.
    inlineInput: {
      backgroundColor: c.bg,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: 6,
      flex: 1,
    },
    editRowLabelHidden: { color: c.label3, textDecorationLine: "line-through" },
    rowBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    rowBtnText: { fontSize: TYPE.footnote, fontWeight: "600", color: c.primary },
    // Inline action buttons inside an edit-mode row (Hide/Unhide/Pin/Unpin/
    // Edit/Delete). Compact text so 3 actions plus the drag handle still
    // fit on a single row at default density.
    rowAction: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    rowActionText: {
      fontSize: TYPE.caption,
      fontWeight: "600",
      color: c.label2,
      letterSpacing: -0.1,
    },
    rowActionTextActive: {
      color: c.primary,
    },
    rowActionTextDanger: {
      color: c.red,
    },
    editRowBadge: {
      fontSize: TYPE.caption,
      fontWeight: "600",
      color: c.label3,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: RADIUS.chip,
      backgroundColor: c.bg,
    },
    secondaryAction: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      alignItems: "flex-start",
    },
    secondaryActionText: {
      fontSize: TYPE.body,
      fontWeight: "500",
      color: c.label2,
    },
    destructiveAction: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      alignItems: "flex-start",
    },
    destructiveActionText: {
      fontSize: TYPE.body,
      fontWeight: "500",
      color: c.red,
    },
    dragHandle: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    dragHandleIcon: { fontSize: TYPE.title, color: c.label3, fontWeight: "500" },
    addRow: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      alignItems: "center",
    },
    addRowText: { fontSize: TYPE.body, fontWeight: "600", color: c.primary },
    field: { marginBottom: SPACING.md },
    label: {
      fontSize: TYPE.caption,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: SPACING.sm,
    },
    input: {
      height: 38,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: RADIUS.control,
      paddingHorizontal: SPACING.md,
      fontSize: TYPE.body,
      color: c.label,
      backgroundColor: c.bg,
    },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchSelected: { borderColor: c.label },
    iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
    iconCell: {
      width: 38,
      height: 38,
      borderRadius: RADIUS.chip,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bg,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    btn: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.control,
      backgroundColor: c.bg,
    },
    btnPrimary: { backgroundColor: c.primary },
    btnText: { fontSize: TYPE.body, fontWeight: "600", color: c.label },
    btnPrimaryText: { color: c.primaryOn },
    allCard: {
      marginTop: SPACING.lg,
    },
    viewRowFlush: {
      borderBottomWidth: 0,
    },
  });
}

export type Styles = ReturnType<typeof makeStyles>;
