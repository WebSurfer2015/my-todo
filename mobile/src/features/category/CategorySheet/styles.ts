import { StyleSheet } from "react-native";
import { ThemeColors } from "../../../app/theme";

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
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 28,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    headerTitle: { fontSize: 17, fontWeight: "700", color: c.label },
    headerLeft: { fontSize: 16, fontWeight: "500", color: c.primary },
    headerRight: { fontSize: 16, fontWeight: "600", color: c.primary },
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
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 14,
      color: c.label,
    },
    body: { flex: 1 },
    bodyContent: { paddingTop: 4, paddingBottom: 12 },
    multiSelectNote: {
      fontSize: 12,
      color: c.label3,
      textAlign: 'center',
      paddingHorizontal: 16,
      paddingTop: 2,
      paddingBottom: 6,
    },
    sectionHeader: {
      // Comfort: was 11/14/8 — bumped to 12/20/12 so section breaks
      // breathe and the sheet feels less crammed.
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 20,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    listCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: "hidden",
    },
    viewRow: {
      flexDirection: "row",
      alignItems: "center",
      // Comfort: gap 12 → 14, paddings 14 → 16/18 so rows have the
      // same exhale as EmptyStateCard's interior.
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowIcon: { width: 20, alignItems: "center" },
    viewRowLabel: { flex: 1, fontSize: 17, fontWeight: "500", color: c.label },
    viewRowCount: {
      fontSize: 15,
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
      marginRight: 4,
    },
    editCatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 12,
    },
    cancelText: {
      fontSize: 15,
      color: c.label2,
      fontWeight: '500',
    },
    editCatHeaderSide: {
      width: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editCatTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: c.label,
      letterSpacing: -0.2,
    },
    editCatSaveBtn: {
      marginTop: 16,
      marginBottom: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editCatSaveText: {
      color: c.primaryOn,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    viewDoneBtn: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 24,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewDoneText: {
      color: c.primaryOn,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    editRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
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
    editRowLabel: { fontSize: 15, color: c.label, fontWeight: "500", flexShrink: 1 },
    // Wrap the label in a flex:1 tap target so the row's whole label-area
    // is the rename hit area, not just the visible glyphs.
    editRowLabelTap: { flex: 1, justifyContent: "center", paddingVertical: 4 },
    // Inner cluster — label + a small pencil glyph to signal the row is
    // tap-to-rename. The pencil is dim by default and only present in
    // Configure mode (this view is only rendered there).
    editRowLabelInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    // Subtle highlight to signal the field is in inline-edit mode.
    inlineInput: {
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      flex: 1,
    },
    editRowLabelHidden: { color: c.label3, textDecorationLine: "line-through" },
    rowBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    rowBtnText: { fontSize: 13, fontWeight: "600", color: c.primary },
    // Inline action buttons inside an edit-mode row (Hide/Unhide/Pin/Unpin/
    // Edit/Delete). Compact text so 3 actions plus the drag handle still
    // fit on a single row at default density.
    rowAction: { paddingHorizontal: 6, paddingVertical: 4 },
    tileBadge: {
      marginHorizontal: 6,
      minWidth: 26,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.gray3,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    tileBadgePicked: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tileBadgeDisabled: {
      opacity: 0.35,
    },
    tileBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.label2,
      lineHeight: 14,
    },
    tileBadgeTextPicked: {
      color: c.primaryOn,
    },
    tileBadgeTextDisabled: {
      color: c.label3,
    },
    homeTilesBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 4,
    },
    homeTilesBannerLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label2,
    },
    homeTilesBannerReset: {
      fontSize: 12,
      fontWeight: "600",
      color: c.red,
    },
    rowActionText: {
      fontSize: 12,
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
      fontSize: 11,
      fontWeight: "600",
      color: c.label3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: c.bg,
    },
    secondaryAction: {
      paddingVertical: 12,
      paddingHorizontal: 4,
      alignItems: "flex-start",
    },
    secondaryActionText: {
      fontSize: 14,
      fontWeight: "500",
      color: c.label2,
    },
    destructiveAction: {
      paddingVertical: 12,
      paddingHorizontal: 4,
      alignItems: "flex-start",
    },
    destructiveActionText: {
      fontSize: 14,
      fontWeight: "500",
      color: c.red,
    },
    dragHandle: { paddingHorizontal: 8, paddingVertical: 4 },
    dragHandleIcon: { fontSize: 18, color: c.label3, fontWeight: "500" },
    addRow: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    addRowText: { fontSize: 15, fontWeight: "600", color: c.primary },
    field: { marginBottom: 12 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: 6,
    },
    input: {
      height: 38,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 14,
      color: c.label,
      backgroundColor: c.bg,
    },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchSelected: { borderColor: c.label },
    iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    iconCell: {
      width: 38,
      height: 38,
      borderRadius: 8,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bg,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 4,
    },
    btn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: c.bg,
    },
    btnPrimary: { backgroundColor: c.primary },
    btnText: { fontSize: 14, fontWeight: "600", color: c.label },
    btnPrimaryText: { color: c.primaryOn },
    allCard: {
      marginTop: 14,
    },
    viewRowFlush: {
      borderBottomWidth: 0,
    },
  });
}

export type Styles = ReturnType<typeof makeStyles>;
