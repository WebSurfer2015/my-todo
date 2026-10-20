import React, { useState, useEffect, useMemo } from "react";
import {
  Animated,
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from "react-native";
import { useSheetDismiss, sheetGrabZone } from "../../../ui/useSheetDismiss";
import { Check, Pin, Pencil } from "lucide-react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { makeStyles } from "./styles";
import { CategoryDef, COLOR_PALETTE, categoryLabel } from "../../../core-bindings/categories";
import { ICON_KEYS } from "../../../ui/icons";
import {
  Filter,
  Priority,
  StatusFilter,
  categoryFilter,
  priorityFilter,
} from "../../../core-bindings/types";
import CategoryIcon from "../../../ui/CategoryIcon";
import StatusIcon, { statusColor } from "../../../ui/StatusIcon";
import PriorityBars from "../../../ui/PriorityBars";
import { useLang } from "../../../app/LangContext";
import { useTheme } from "../../../app/theme";
import { PIN_LIMIT } from "../../../../../core/src/logic/filters";

export interface StatusEntry {
  id: StatusFilter;
  label: string;
  hidden: boolean;
}

export interface PriorityEntry {
  id: Priority;
  label: string;
  hidden: boolean;
}

interface Props {
  visible: boolean;
  /** Multi-select source of truth. View-mode rows render the checkmark
   * when their filter is in this array; tapping toggles in/out. Empty
   * array = "all" semantics. Keeps currentFilter as a back-compat
   * alias for the legacy single-pick code paths. */
  selectedFilters: Filter[];
  /** Toggle one filter in/out of the selection. */
  onToggleFilter: (f: Filter) => void;
  /** Clear every selected filter — same effect as picking "All". */
  onClearFilters: () => void;
  /** Ordered list of pinned filter SETS (from Profile.pinnedFilters).
   * Each entry is a Filter[]; inline Pin buttons in Configure mode
   * pin/unpin a single-element set ([f]). */
  pinnedFilters: Filter[][];
  /** Set-aware pin toggle. Inline row pins pass `[f]`; the FilterBar
   * uses multi-element sets for composite pinning. */
  onPinFilter: (set: Filter[]) => void;
  categories: CategoryDef[];
  /** Total task counts per category (used for delete confirm + row badges). */
  taskCounts: Record<string, number>;
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number; notDo: number };
  /** Total task counts per priority — used by the PRIORITIES section.
   * Items with no priority don't count toward any bucket. */
  priorityCounts: Record<Priority, number>;
  /** Statuses in the user's order. */
  orderedStatuses: StatusEntry[];
  /** Priorities in the user's order. */
  orderedPriorities: PriorityEntry[];
  onAdd: (data: { label: string; color: string; icon: string }) => void;
  onEdit: (
    id: string,
    data: { label: string; color: string; icon: string },
  ) => void;
  /** Delete a category. Returns what to say inline (its to-dos are now
   * uncategorized) and the store's Undo — the sheet shows them itself, since
   * a snackbar would sit behind this Modal. */
  onDelete: (id: string) => { message: string; undo: (() => unknown) | null } | null;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRenameStatus: (id: StatusFilter, label: string) => void;
  onReorderStatuses: (newOrder: StatusFilter[]) => void;
  onReorderPriorities: (newOrder: Priority[]) => void;
  /** Which mode to land in when the sheet opens. Funnel entry-point
   * uses "view" (filter picker); gear entry-point uses "edit"
   * (Manage Filter). Resets on every open so the same sheet can
   * serve both flows. */
  defaultMode?: "view" | "edit";
  onClose: () => void;
}

type Mode =
  | { kind: "view" }
  | { kind: "edit" }
  | { kind: "editCategory"; id: string | null };

/**
 * Combined filter picker + management sheet.
 *
 * - View mode (default): two read-only sections — STATUSES (top) and
 *   CATEGORIES (below). Tapping a row sets the filter and closes the sheet.
 *   The currently active filter shows a checkmark.
 * - Edit mode ("Filters & categories"): same layout; each row keeps at most
 *   two trailing controls — pin + drag. A status label renames in place; a
 *   category label opens its edit form (name, color, icon, and Delete — the
 *   only place a category can be deleted, so it can't be hit by accident).
 *   Add Category appears at the end of the categories list.
 *
 * Toggle between modes via the "Edit" / "Done" action in the header.
 */
export default function CategorySheet({
  visible,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  pinnedFilters,
  onPinFilter,
  categories,
  taskCounts,
  systemCounts,
  priorityCounts,
  orderedStatuses,
  orderedPriorities,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  onRenameStatus,
  onReorderStatuses,
  onReorderPriorities,
  defaultMode = "view",
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Swipe-the-grabber-down to dismiss. confirmsClose: handleBackdrop returns to
  // the list (or auto-saves) in edit mode rather than always closing, so settle
  // back to rest rather than slide off-screen.
  const { translateY, panHandlers } = useSheetDismiss(visible, handleBackdrop, {
    confirmsClose: true,
  });
  const [mode, setMode] = useState<Mode>({ kind: defaultMode });
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[5]);
  const [icon, setIcon] = useState<string>("tag");
  // Inline label editing in Configure mode — tap a status label to rename
  // it in place. `inlineId` is the status id being edited (null when no row
  // is open); `inlineText` is the staged new label.
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState("");
  // Freeze the outer scroll while a row is being dragged so the sheet
  // doesn't appear to scroll along with the dragged row.
  const [dragActive, setDragActive] = useState(false);
  // Explicit sheet height instead of maxHeight:'85%'. With percentage
  // heights the inner ScrollView couldn't reliably bound itself, so the
  // tail of the categories list (+Add Category row) fell below the
  // visible area with no scroll recovery. Mirrors ManageHomeTilesSheet.
  const screenH = Dimensions.get("window").height;
  const sheetHeight = Math.round(screenH * 0.85);

  // Pinned filters are sets (Filter[][]). For inline row pin
  // indicators we only care about the single-filter case — "is the
  // set [f] currently pinned?"
  const isFilterPinned = (f: Filter) =>
    pinnedFilters.some((set) => set.length === 1 && set[0] === f);

  // An inline note under the header — the store's snackbar would render
  // behind this Modal. A category delete carries its Undo here; a pin past
  // the cap says so here (and isn't sent to the store).
  const [notice, setNotice] = useState<{ message: string; undo: (() => unknown) | null } | null>(null);
  function pinRow(f: Filter) {
    if (!isFilterPinned(f) && pinnedFilters.length >= PIN_LIMIT) {
      setNotice({ message: t.pinCapReached(PIN_LIMIT), undo: null });
      return;
    }
    setNotice(null);
    onPinFilter([f]);
  }

  // Case-insensitive duplicate guard for category labels. Returns true
  // (and surfaces an Alert) when `label` collides with an existing
  // category other than `ignoreId`.
  function isDuplicateCategoryLabel(label: string, ignoreId: string | null): boolean {
    const norm = label.trim().toLowerCase();
    if (!norm) return false;
    const clash = categories.some((c) => {
      if (ignoreId && c.id === ignoreId) return false;
      return categoryLabel(c, t).trim().toLowerCase() === norm;
    });
    if (clash) {
      Alert.alert(
        "Duplicate category",
        `A category named "${label.trim()}" already exists.`,
      );
    }
    return clash;
  }

  function startInlineEdit(id: string, currentLabel: string) {
    setInlineId(id);
    setInlineText(currentLabel);
  }

  function commitInlineStatus(id: StatusFilter, original: string) {
    const trimmed = inlineText.trim().slice(0, 40);
    if (trimmed && trimmed !== original) onRenameStatus(id, trimmed);
    setInlineId(null);
  }

  useEffect(() => {
    // On every open, snap to the caller's requested mode. Closing the
    // sheet doesn't change `defaultMode`, so a re-open from the same
    // entry-point lands in the same place.
    if (visible) setMode({ kind: defaultMode });
    setNotice(null);
  }, [visible, defaultMode]);

  function startAdd() {
    setName("");
    setColor(COLOR_PALETTE[5]);
    setIcon("tag");
    setMode({ kind: "editCategory", id: null });
  }

  // A category row's label opens its edit form, staged with what it has now.
  function startEditCategory(c: CategoryDef) {
    setNotice(null);
    setName(categoryLabel(c, t));
    setColor(c.color);
    setIcon(c.icon);
    setMode({ kind: "editCategory", id: c.id });
  }


  // Backdrop / Android-back. From the add/edit FORM, return to the list
  // instead of tearing down the whole sheet (which silently dropped the
  // staged name/color/icon); auto-save a valid edit to an existing category
  // on the way out (calm, forgiving). Only the list-view backdrop closes.
  function handleBackdrop() {
    if (mode.kind === "editCategory") {
      const trimmed = name.trim();
      if (mode.id && trimmed && !isDuplicateCategoryLabel(trimmed, mode.id)) {
        onEdit(mode.id, { label: trimmed, color, icon });
      }
      setMode({ kind: "edit" });
      return;
    }
    onClose();
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const currentId = mode.kind === "editCategory" ? mode.id : null;
    if (isDuplicateCategoryLabel(trimmed, currentId)) return;
    if (mode.kind === "editCategory" && mode.id) {
      onEdit(mode.id, { label: trimmed, color, icon });
    } else {
      onAdd({ label: trimmed, color, icon });
    }
    setMode({ kind: "edit" });
  }

  function handleDelete(c: CategoryDef) {
    if (categories.length <= 1) {
      Alert.alert(t.cannotDeleteLast);
      return;
    }
    const count = taskCounts[c.id] ?? 0;
    const message =
      count > 0
        ? t.deleteCategoryConfirm(categoryLabel(c, t), count)
        : t.deleteCategoryConfirmEmpty(categoryLabel(c, t));
    Alert.alert(t.deleteCategoryAction, message, [
      { text: t.cancel, style: "cancel" },
      {
        // Neutral, not red: a category delete has an Undo.
        text: t.deleteCategoryAction,
        onPress: () => {
          const res = onDelete(c.id);
          // Back to the list (the deleted category's form is gone), with
          // what happened + its Undo inline.
          setMode({ kind: "edit" });
          setNotice(res);
        },
      },
    ]);
  }

  // Multi-select tap: toggle this filter in/out without closing the
  // sheet so the user can build up a multi-filter set in one pass.
  // The sheet's checkmarks reflect the live selection; close via
  // Done/Cancel when satisfied. The FilterBar collapses 2+ selected
  // filters into one composite pill ("A + B").
  function tapFilterRow(f: Filter) {
    onToggleFilter(f);
  }

  // --- Row renderers ----------------------------------------------------

  function viewStatusRow(s: { id: StatusFilter; label: string }) {
    const active = selectedFilters.includes(s.id);
    const count = systemCounts[s.id] ?? 0;
    // Carried over never shows a number — a backlog count is a guilt
    // counter (FilterBar and the Todos header hide it too).
    const showCount = s.id !== 'overdue';
    return (
      <TouchableOpacity
        key={s.id}
        style={styles.viewRow}
        onPress={() => tapFilterRow(s.id)}
        activeOpacity={0.65}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={showCount ? `${s.label}, ${count} items` : s.label}
      >
        <View style={styles.rowIcon}>
          <StatusIcon id={s.id} size={18} color={statusColor(s.id, theme)} />
        </View>
        <Text style={styles.viewRowLabel}>{s.label}</Text>
        {showCount && <Text style={styles.viewRowCount}>{count}</Text>}
        {active ? <Check size={18} color={theme.primary} strokeWidth={2.5} /> : <View style={styles.checkPlaceholder} />}
      </TouchableOpacity>
    );
  }

  function viewPriorityRow(p: Priority) {
    const f = priorityFilter(p);
    const active = selectedFilters.includes(f);
    const count = priorityCounts[p] ?? 0;
    return (
      <TouchableOpacity
        key={`pri-${p}`}
        style={styles.viewRow}
        onPress={() => tapFilterRow(f)}
        activeOpacity={0.65}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={`${t.priority[p]} priority, ${count} items`}
      >
        <View style={styles.rowIcon}>
          <PriorityBars level={p} size={16} />
        </View>
        <Text style={styles.viewRowLabel}>{t.priority[p]}</Text>
        <Text style={styles.viewRowCount}>{count}</Text>
        {active ? <Check size={18} color={theme.primary} strokeWidth={2.5} /> : <View style={styles.checkPlaceholder} />}
      </TouchableOpacity>
    );
  }

  function viewCategoryRow(c: CategoryDef) {
    const f = categoryFilter(c.id);
    const active = selectedFilters.includes(f);
    const count = taskCounts[c.id] ?? 0;
    // View mode is purely for picking a filter — no edit affordances
    // (no pencil, no long-press shortcut). All editing lives in the
    // "Filters & categories" (Configure) view, reached from Settings.
    return (
      <TouchableOpacity
        key={c.id}
        style={styles.viewRow}
        onPress={() => tapFilterRow(f)}
        activeOpacity={0.65}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={`${categoryLabel(c, t)}, ${count} items`}
      >
        <View style={styles.rowIcon}>
          <CategoryIcon icon={c.icon} color={c.color} size={18} />
        </View>
        <Text style={styles.viewRowLabel}>{categoryLabel(c, t)}</Text>
        <Text style={styles.viewRowCount}>{count}</Text>
        {active ? <Check size={18} color={theme.primary} strokeWidth={2.5} /> : <View style={styles.checkPlaceholder} />}
      </TouchableOpacity>
    );
  }

  // --- Render ----------------------------------------------------------

  const isList = mode.kind === "view" || mode.kind === "edit";
  const isEditing = mode.kind === "edit";

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={handleBackdrop}
    >
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
              collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdrop} accessible={false} />
            {/* Plain View (not Pressable) for the sheet itself. The
                opaque background already absorbs taps so they don't
                reach the backdrop, and a Pressable here would claim
                the touch responder and starve the inner ScrollView's
                pan recognizer — that's what was blocking scroll. */}
            <Animated.View style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
              <View style={sheetGrabZone} {...panHandlers}>
                <View style={styles.handle} />
              </View>

              {isList ? (
                <>
                  <View style={styles.headerRow}>
                    {isEditing ? (
                      <TouchableOpacity onPress={onClose} hitSlop={8}>
                        <Text style={styles.headerLeft}>{t.cancel}</Text>
                      </TouchableOpacity>
                    ) : (
                      // No Cancel on the Filter sheet: taps apply live, and a
                      // swipe down / scrim tap dismisses. Spacer keeps the
                      // title centered against Reset.
                      <View style={styles.headerRightSpacer} />
                    )}
                    <Text style={styles.headerTitle}>
                      {isEditing ? t.filtersAndCategories : 'Filter'}
                    </Text>
                    {isEditing ? (
                      // Manage flow keeps Done in the header. The Filter sheet's
                      // "Show results" lives in the sticky footer below.
                      <TouchableOpacity onPress={onClose} hitSlop={8}>
                        <Text style={styles.headerRight}>{t.done}</Text>
                      </TouchableOpacity>
                    ) : (
                      // Reset clears every selected filter (back to "All").
                      <TouchableOpacity
                        onPress={onClearFilters}
                        hitSlop={10}
                        style={styles.headerResetWrap}
                        accessibilityRole="button"
                        accessibilityLabel="Reset filters"
                      >
                        <Text style={styles.headerReset}>Reset</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {notice && (
                    <View style={styles.noticeRow} accessibilityLiveRegion="polite">
                      <Text style={styles.noticeText}>{notice.message}</Text>
                      {notice.undo && (
                        <TouchableOpacity
                          onPress={() => {
                            const undo = notice.undo;
                            setNotice(null);
                            undo?.();
                          }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.undo}: ${notice.message}`}
                        >
                          <Text style={styles.noticeAction}>{t.undo}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {isEditing ? (
                    <ScrollView
                      style={styles.body}
                      contentContainerStyle={styles.bodyContent}
                      scrollEnabled={!dragActive}
                      // While a rename has the keyboard up, the first tap on
                      // another row must act, not just dismiss the keyboard.
                      keyboardShouldPersistTaps="handled"
                    >
                      <Text style={styles.sectionHeader}>STATUSES</Text>
                      <View style={styles.listCard}>
                        <DraggableFlatList
                          data={orderedStatuses}
                          keyExtractor={(s) => s.id}
                          scrollEnabled={false}
                          activationDistance={8}
                          onDragBegin={() => setDragActive(true)}
                          onDragEnd={({ data }) => {
                            setDragActive(false);
                            onReorderStatuses(data.map((s) => s.id));
                          }}
                          renderItem={({
                            item: s,
                            drag,
                            isActive,
                          }: RenderItemParams<StatusEntry>) => {
                            const isInline = inlineId === s.id;
                            const isPinned = isFilterPinned(s.id);
                            return (
                              <View style={[styles.editRow, isActive && styles.editRowActive]}>
                                <StatusIcon id={s.id} size={18} color={statusColor(s.id, theme)} />
                                {isInline ? (
                                  <TextInput
                                    style={[styles.editRowLabel, styles.inlineInput]}
                                    value={inlineText}
                                    onChangeText={setInlineText}
                                    autoFocus
                                    selectTextOnFocus
                                    returnKeyType="done"
                                    onBlur={() => commitInlineStatus(s.id, s.label)}
                                    onSubmitEditing={() => commitInlineStatus(s.id, s.label)}
                                    maxLength={40}
                                  />
                                ) : (
                                  <TouchableOpacity
                                    style={styles.editRowLabelTap}
                                    onPress={() => startInlineEdit(s.id, s.label)}
                                    activeOpacity={0.6}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Rename ${s.label}`}
                                  >
                                    <View style={styles.editRowLabelInner}>
                                      <Text
                                        style={styles.editRowLabel}
                                        numberOfLines={1}
                                      >
                                        {s.label}
                                      </Text>
                                      <Pencil size={11} color={theme.label3} strokeWidth={2} />
                                    </View>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => pinRow(s.id)}
                                  hitSlop={10}
                                  style={styles.rowAction}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${isPinned ? t.unpin : t.pin} ${s.label}`}
                                >
                                  <Pin
                                    size={13}
                                    color={isPinned ? theme.primary : theme.label2}
                                    strokeWidth={2.2}
                                    fill={isPinned ? theme.primary : 'none'}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onLongPress={drag}
                                  delayLongPress={150}
                                  disabled={isActive}
                                  style={styles.dragHandle}
                                  accessibilityLabel="Drag to reorder"
                                >
                                  <Text style={styles.dragHandleIcon}>≡</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          }}
                        />
                      </View>

                      {/* PRIORITIES — mirrors STATUSES so the pin column
                          aligns with the rest of the sheet; drag handle
                          reorders. Rename is not supported (priority labels
                          are i18n-owned). */}
                      <Text style={styles.sectionHeader}>PRIORITIES</Text>
                      <View style={styles.listCard}>
                        <DraggableFlatList
                          data={orderedPriorities}
                          keyExtractor={(p) => `pri-${p.id}`}
                          scrollEnabled={false}
                          activationDistance={8}
                          onDragBegin={() => setDragActive(true)}
                          onDragEnd={({ data }) => {
                            setDragActive(false);
                            onReorderPriorities(data.map((p) => p.id));
                          }}
                          renderItem={({
                            item: p,
                            drag,
                            isActive,
                          }: RenderItemParams<PriorityEntry>) => {
                            const f = priorityFilter(p.id);
                            const isPinned = isFilterPinned(f);
                            return (
                              <View style={[styles.editRow, isActive && styles.editRowActive]}>
                                <PriorityBars level={p.id} size={18} />
                                <View style={styles.editRowLabelTap}>
                                  <View style={styles.editRowLabelInner}>
                                    <Text
                                      style={styles.editRowLabel}
                                      numberOfLines={1}
                                    >
                                      {p.label}
                                    </Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  onPress={() => pinRow(f)}
                                  hitSlop={10}
                                  style={styles.rowAction}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${isPinned ? t.unpin : t.pin} ${p.label}`}
                                >
                                  <Pin
                                    size={13}
                                    color={isPinned ? theme.primary : theme.label2}
                                    strokeWidth={2.2}
                                    fill={isPinned ? theme.primary : 'none'}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onLongPress={drag}
                                  delayLongPress={150}
                                  disabled={isActive}
                                  style={styles.dragHandle}
                                  accessibilityLabel="Drag to reorder"
                                >
                                  <Text style={styles.dragHandleIcon}>≡</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          }}
                        />
                      </View>

                      <Text style={styles.sectionHeader}>CATEGORIES</Text>
                      <View style={styles.listCard}>
                        <DraggableFlatList
                          data={categories}
                          keyExtractor={(c) => c.id}
                          scrollEnabled={false}
                          activationDistance={8}
                          onDragBegin={() => setDragActive(true)}
                          onDragEnd={({ data }) => {
                            setDragActive(false);
                            for (let i = 0; i < categories.length; i++) {
                              if (categories[i].id !== data[i].id) {
                                const movedItem = data[i];
                                const oldIdx = categories.findIndex(
                                  (c) => c.id === movedItem.id,
                                );
                                onReorder(oldIdx, i);
                                break;
                              }
                            }
                          }}
                          renderItem={({
                            item: c,
                            drag,
                            isActive,
                          }: RenderItemParams<CategoryDef>) => {
                            const label = categoryLabel(c, t);
                            const catFilter = `cat:${c.id}` as Filter;
                            const isPinned = isFilterPinned(catFilter);
                            return (
                              <View style={[styles.editRow, isActive && styles.editRowActive]}>
                                <CategoryIcon icon={c.icon} color={c.color} size={18} />
                                <TouchableOpacity
                                  style={styles.editRowLabelTap}
                                  onPress={() => startEditCategory(c)}
                                  activeOpacity={0.6}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${t.editCategory}: ${label}`}
                                >
                                  <View style={styles.editRowLabelInner}>
                                    <Text style={styles.editRowLabel} numberOfLines={1}>
                                      {label}
                                    </Text>
                                    <Pencil size={11} color={theme.label3} strokeWidth={2} />
                                  </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => pinRow(catFilter)}
                                  hitSlop={10}
                                  style={styles.rowAction}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${isPinned ? t.unpin : t.pin} ${label}`}
                                >
                                  <Pin
                                    size={13}
                                    color={isPinned ? theme.primary : theme.label2}
                                    strokeWidth={2.2}
                                    fill={isPinned ? theme.primary : 'none'}
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onLongPress={drag}
                                  delayLongPress={150}
                                  disabled={isActive}
                                  style={styles.dragHandle}
                                  accessibilityLabel="Drag to reorder"
                                >
                                  <Text style={styles.dragHandleIcon}>≡</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          }}
                        />
                        <TouchableOpacity
                          style={styles.addRow}
                          onPress={startAdd}
                          activeOpacity={0.6}
                        >
                          <Text style={styles.addRowText}>+ {t.addCategory}</Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  ) : (
                    <>
                    <Text style={styles.multiSelectNote}>
                      Pick more than one in any group to combine filters.
                    </Text>
                    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                      <View style={[styles.listCard, styles.allCard]}>
                        <TouchableOpacity
                          style={[styles.viewRow, styles.viewRowFlush]}
                          onPress={() => onClearFilters()}
                          activeOpacity={0.65}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.filters.all} — clear every selected filter`}
                        >
                          <View style={styles.rowIcon} />
                          <Text style={styles.viewRowLabel}>{t.filters.all}</Text>
                          <Text style={styles.viewRowCount}>{systemCounts.all}</Text>
                          {selectedFilters.length === 0 ? (
                            <Check size={18} color={theme.primary} strokeWidth={2.5} />
                          ) : (
                            <View style={styles.checkPlaceholder} />
                          )}
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.sectionHeader}>STATUSES</Text>
                      <View style={styles.listCard}>
                        {orderedStatuses.map(viewStatusRow)}
                      </View>
                      <Text style={styles.sectionHeader}>PRIORITIES</Text>
                      <View style={styles.listCard}>
                        {orderedPriorities.map((p) => viewPriorityRow(p.id))}
                      </View>
                      <Text style={styles.sectionHeader}>CATEGORIES</Text>
                      <View style={styles.listCard}>
                        {categories.map(viewCategoryRow)}
                      </View>
                    </ScrollView>
                    {/* Sticky Done — pinned below the scrollable filter list. */}
                    <View style={styles.viewStickyFooter}>
                      <TouchableOpacity
                        style={styles.viewDoneBtn}
                        onPress={onClose}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Show results"
                      >
                        <Text style={styles.viewDoneText}>Show results</Text>
                      </TouchableOpacity>
                    </View>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Header row matches the unified sheet pattern:
                      Back left, title center. Delete lives at the foot of
                      the form (neutral — it has an Undo). */}
                  <View style={styles.editCatHeader}>
                    <TouchableOpacity
                      // Same as the backdrop: an edit to an existing category
                      // is kept (calm, forgiving); back to the list.
                      onPress={handleBackdrop}
                      hitSlop={10}
                      style={styles.editCatHeaderSide}
                      accessibilityRole="button"
                      accessibilityLabel={t.back}
                    >
                      <Text style={styles.cancelText}>‹ {t.back}</Text>
                    </TouchableOpacity>
                    <Text style={styles.editCatTitle}>
                      {mode.id ? t.editCategory : t.addCategory}
                    </Text>
                    <View style={styles.editCatHeaderSide} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t.categoryNameLabel}</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      autoFocus
                      maxLength={40}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t.categoryColorLabel}</Text>
                    <View style={styles.swatchRow}>
                      {COLOR_PALETTE.map((cl, i) => (
                        <TouchableOpacity
                          key={cl}
                          onPress={() => setColor(cl)}
                          style={[
                            styles.swatch,
                            { backgroundColor: cl },
                            color === cl && styles.swatchSelected,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: color === cl }}
                          accessibilityLabel={`Color ${i + 1}`}
                        />
                      ))}
                    </View>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t.categoryIconLabel}</Text>
                    <View style={styles.iconGrid}>
                      {ICON_KEYS.map((k) => (
                        <TouchableOpacity
                          key={k}
                          onPress={() => setIcon(k)}
                          style={[
                            styles.iconCell,
                            { borderColor: icon === k ? color : "transparent" },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: icon === k }}
                          accessibilityLabel={`${k} icon`}
                        >
                          <CategoryIcon icon={k} size={20} color={color} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {/* Primary Save, then (existing category only) a quiet
                      Delete — consistent with the Edit Step sheet. */}
                  <TouchableOpacity
                    style={[styles.editCatSaveBtn, !name.trim() && styles.editCatSaveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!name.trim()}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !name.trim() }}
                    accessibilityLabel={t.save}
                  >
                    <Text style={styles.editCatSaveText}>{t.save}</Text>
                  </TouchableOpacity>
                  {mode.id ? (
                    <TouchableOpacity
                      style={styles.editCatDeleteBtn}
                      onPress={() => {
                        const c = categories.find((x) => x.id === mode.id);
                        if (c) handleDelete(c);
                      }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={t.deleteCategoryButton}
                    >
                      <Text style={styles.editCatDeleteText}>{t.deleteCategoryButton}</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
