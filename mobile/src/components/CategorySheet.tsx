import React, { useState, useEffect, useMemo } from "react";
import {
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
import { Check, Pin, Pencil, Eye, EyeOff, Trash2 } from "lucide-react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { CategoryDef, COLOR_PALETTE, categoryLabel } from "../categories";
import { ICON_KEYS } from "../icons";
import {
  Filter,
  Priority,
  StatusFilter,
  categoryFilter,
  categoryIdFromFilter,
  isCategoryFilter,
  isPriorityFilter,
  priorityFilter,
  priorityFromFilter,
} from "../types";
import CategoryIcon from "./CategoryIcon";
import StatusIcon, { statusColor } from "./StatusIcon";
import PriorityBars from "./PriorityBars";
import { useLang } from "../LangContext";
import { useTheme, ThemeColors } from "../theme";

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
  currentFilter: Filter;
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
  onSelectFilter: (f: Filter) => void;
  /** Set-aware pin toggle. Inline row pins pass `[f]`; the FilterBar
   * uses multi-element sets for composite pinning. */
  onPinFilter: (set: Filter[]) => void;
  categories: CategoryDef[];
  /** Total task counts per category (used for delete confirm + row badges). */
  taskCounts: Record<string, number>;
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number };
  /** Total task counts per priority — used by the PRIORITIES section.
   * Items with no priority don't count toward any bucket. */
  priorityCounts: Record<Priority, number>;
  /** Full status list — used in Edit mode so hidden statuses can be unhidden. */
  orderedStatuses: StatusEntry[];
  /** Visible-only status list — used in View mode picker. */
  orderedVisibleStatuses: { id: StatusFilter; label: string }[];
  /** Full priority list — used in Edit mode so hidden priorities can be unhidden. */
  orderedPriorities: PriorityEntry[];
  onAdd: (data: { label: string; color: string; icon: string }) => void;
  onEdit: (
    id: string,
    data: { label: string; color: string; icon: string },
  ) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRenameStatus: (id: StatusFilter, label: string) => void;
  onToggleStatusHidden: (id: StatusFilter) => void;
  onReorderStatuses: (newOrder: StatusFilter[]) => void;
  onTogglePriorityHidden: (id: Priority) => void;
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
 * - Edit mode: same layout but each row exposes drag-to-reorder + edit
 *   actions (rename/hide for statuses; rename/delete for categories). Add
 *   Category appears at the end of the categories list.
 *
 * Toggle between modes via the "Edit" / "Done" action in the header.
 */
export default function CategorySheet({
  visible,
  currentFilter,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  pinnedFilters,
  onSelectFilter,
  onPinFilter,
  categories,
  taskCounts,
  systemCounts,
  priorityCounts,
  orderedStatuses,
  orderedVisibleStatuses,
  orderedPriorities,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  onRenameStatus,
  onToggleStatusHidden,
  onReorderStatuses,
  onTogglePriorityHidden,
  onReorderPriorities,
  defaultMode = "view",
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [mode, setMode] = useState<Mode>({ kind: defaultMode });
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[5]);
  const [icon, setIcon] = useState<string>("tag");
  // Inline label editing in Configure mode — tap a row's label to rename
  // it in place. `inlineId` is the status/category id being edited (null
  // when no row is open); `inlineText` is the staged new label.
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

  function commitInlineCategory(c: CategoryDef, original: string) {
    const trimmed = inlineText.trim().slice(0, 40);
    if (trimmed && trimmed !== original) {
      if (isDuplicateCategoryLabel(trimmed, c.id)) {
        setInlineId(null);
        return;
      }
      onEdit(c.id, { label: trimmed, color: c.color, icon: c.icon });
    }
    setInlineId(null);
  }

  useEffect(() => {
    // On every open, snap to the caller's requested mode. Closing the
    // sheet doesn't change `defaultMode`, so a re-open from the same
    // entry-point lands in the same place.
    if (visible) setMode({ kind: defaultMode });
  }, [visible, defaultMode]);

  function startAdd() {
    setName("");
    setColor(COLOR_PALETTE[5]);
    setIcon("tag");
    setMode({ kind: "editCategory", id: null });
  }

  function startEditCategory(c: CategoryDef) {
    setName(categoryLabel(c, t));
    setColor(c.color);
    setIcon(c.icon);
    setMode({ kind: "editCategory", id: c.id });
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
    const target = categories.find((x) => x.id !== c.id)!;
    const count = taskCounts[c.id] ?? 0;
    const message =
      count > 0
        ? t.deleteCategoryConfirm(
            categoryLabel(c, t),
            categoryLabel(target, t),
            count,
          )
        : t.deleteCategoryConfirmEmpty(categoryLabel(c, t));
    Alert.alert(t.deleteCategoryAction, message, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.deleteCategoryAction,
        style: "destructive",
        onPress: () => onDelete(c.id),
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
    return (
      <TouchableOpacity
        key={s.id}
        style={styles.viewRow}
        onPress={() => tapFilterRow(s.id)}
        activeOpacity={0.65}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={`${s.label}, ${count} items`}
      >
        <View style={styles.rowIcon}>
          <StatusIcon id={s.id} size={18} color={statusColor(s.id, theme)} />
        </View>
        <Text style={styles.viewRowLabel}>{s.label}</Text>
        <Text style={styles.viewRowCount}>{count}</Text>
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
    // Manage Todo's Filter (Configure) view, reached via the right-
    // side "Manage" header button.
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
      animationType="slide"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            {/* Plain View (not Pressable) for the sheet itself. The
                opaque background already absorbs taps so they don't
                reach the backdrop, and a Pressable here would claim
                the touch responder and starve the inner ScrollView's
                pan recognizer — that's what was blocking scroll. */}
            <View style={[styles.sheet, { height: sheetHeight }]}>
              <View style={styles.handle} />

              {isList ? (
                <>
                  <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onClose} hitSlop={8}>
                      <Text style={styles.headerLeft}>{t.cancel}</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                      {isEditing ? "Manage Todo's Filter" : 'Select Filter'}
                    </Text>
                    <TouchableOpacity
                      // Both modes: "Done" closes the sheet. The two flows
                      // are reached from separate entry-points (funnel →
                      // Select, gear → Manage); we no longer let the user
                      // toggle modes from within the sheet so each one
                      // stays purely-pick or purely-manage.
                      onPress={onClose}
                      hitSlop={8}
                    >
                      <Text style={styles.headerRight}>{t.done}</Text>
                    </TouchableOpacity>
                  </View>

                  {isEditing ? (
                    <ScrollView
                      style={styles.body}
                      contentContainerStyle={styles.bodyContent}
                      scrollEnabled={!dragActive}
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
                                        style={[styles.editRowLabel, s.hidden && styles.editRowLabelHidden]}
                                        numberOfLines={1}
                                      >
                                        {s.label}
                                      </Text>
                                      <Pencil size={11} color={theme.label3} strokeWidth={2} />
                                    </View>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => onToggleStatusHidden(s.id)}
                                  hitSlop={6}
                                  style={styles.rowAction}
                                  accessibilityRole="switch"
                                  accessibilityState={{ checked: !s.hidden }}
                                  accessibilityLabel={`${s.hidden ? t.unhide : t.hide} ${s.label}`}
                                >
                                  {s.hidden ? (
                                    <EyeOff size={16} color={theme.label3} strokeWidth={2} />
                                  ) : (
                                    <Eye size={16} color={theme.label2} strokeWidth={2} />
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => onPinFilter([s.id])}
                                  hitSlop={6}
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
                          aligns with the rest of the sheet. Eye toggle
                          hides the priority from the view-mode picker;
                          drag handle reorders. Rename is not supported
                          (priority labels are i18n-owned). */}
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
                                      style={[styles.editRowLabel, p.hidden && styles.editRowLabelHidden]}
                                      numberOfLines={1}
                                    >
                                      {p.label}
                                    </Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  onPress={() => onTogglePriorityHidden(p.id)}
                                  hitSlop={6}
                                  style={styles.rowAction}
                                  accessibilityRole="switch"
                                  accessibilityState={{ checked: !p.hidden }}
                                  accessibilityLabel={`${p.hidden ? t.unhide : t.hide} ${p.label}`}
                                >
                                  {p.hidden ? (
                                    <EyeOff size={16} color={theme.label3} strokeWidth={2} />
                                  ) : (
                                    <Eye size={16} color={theme.label2} strokeWidth={2} />
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => onPinFilter([f])}
                                  hitSlop={6}
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
                            const isInline = inlineId === c.id;
                            const catFilter = `cat:${c.id}` as Filter;
                            const isPinned = isFilterPinned(catFilter);
                            return (
                              <View style={[styles.editRow, isActive && styles.editRowActive]}>
                                <CategoryIcon icon={c.icon} color={c.color} size={18} />
                                {isInline ? (
                                  <TextInput
                                    style={[styles.editRowLabel, styles.inlineInput]}
                                    value={inlineText}
                                    onChangeText={setInlineText}
                                    autoFocus
                                    selectTextOnFocus
                                    returnKeyType="done"
                                    onBlur={() => commitInlineCategory(c, label)}
                                    onSubmitEditing={() => commitInlineCategory(c, label)}
                                    maxLength={40}
                                  />
                                ) : (
                                  <TouchableOpacity
                                    style={styles.editRowLabelTap}
                                    onPress={() => startInlineEdit(c.id, label)}
                                    activeOpacity={0.6}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Rename ${label}`}
                                  >
                                    <View style={styles.editRowLabelInner}>
                                      <Text style={styles.editRowLabel} numberOfLines={1}>
                                        {label}
                                      </Text>
                                      <Pencil size={11} color={theme.label3} strokeWidth={2} />
                                    </View>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => handleDelete(c)}
                                  hitSlop={6}
                                  style={styles.rowAction}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${t.deleteTask} ${label}`}
                                >
                                  <Trash2 size={14} color={theme.red} strokeWidth={2} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => onPinFilter([catFilter])}
                                  hitSlop={6}
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
                        {orderedVisibleStatuses.map(viewStatusRow)}
                      </View>
                      <Text style={styles.sectionHeader}>PRIORITIES</Text>
                      <View style={styles.listCard}>
                        {orderedPriorities
                          .filter((p) => !p.hidden)
                          .map((p) => viewPriorityRow(p.id))}
                      </View>
                      <Text style={styles.sectionHeader}>CATEGORIES</Text>
                      <View style={styles.listCard}>
                        {categories.map(viewCategoryRow)}
                      </View>
                      <TouchableOpacity
                        style={styles.viewDoneBtn}
                        onPress={onClose}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={t.done}
                      >
                        <Text style={styles.viewDoneText}>{t.done}</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  )}
                </>
              ) : (
                <>
                  {/* Header row matches the unified sheet pattern:
                      Cancel/Back left, title center, Delete icon
                      top-right (only when editing an existing
                      category). Old in-body destructive Text was
                      removed in favor of this icon. */}
                  <View style={styles.editCatHeader}>
                    <TouchableOpacity
                      onPress={() => setMode({ kind: "edit" })}
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
                    {mode.id && categories.length > 1 ? (
                      <TouchableOpacity
                        onPress={() => {
                          const c = categories.find((x) => x.id === mode.id);
                          if (c) handleDelete(c);
                        }}
                        hitSlop={10}
                        style={styles.editCatHeaderSide}
                        accessibilityRole="button"
                        accessibilityLabel={t.deleteCategoryAction}
                      >
                        <Trash2 size={20} color={theme.red} strokeWidth={2} />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.editCatHeaderSide} />
                    )}
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
                      {COLOR_PALETTE.map((cl) => (
                        <TouchableOpacity
                          key={cl}
                          onPress={() => setColor(cl)}
                          style={[
                            styles.swatch,
                            { backgroundColor: cl },
                            color === cl && styles.swatchSelected,
                          ]}
                          accessibilityLabel={cl}
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
                          accessibilityLabel={k}
                        >
                          <CategoryIcon icon={k} size={20} color={color} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {/* Delete moved into the header (top-right trash
                      icon). Bottom is now a single primary Save
                      button — consistent with the Edit Step sheet. */}
                  <TouchableOpacity
                    style={styles.editCatSaveBtn}
                    onPress={handleSave}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t.save}
                  >
                    <Text style={styles.editCatSaveText}>{t.save}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Inline 1/2/3/+ badge rendered in Configure mode next to the Pin button.
 * Shows the slot number (1, 2, 3) when the row is picked as a Home tile,
 * or "+" when not picked. Disabled (no-op + dim) once 3 are picked and
 * this row isn't one of them.
 */
interface HomeTileBadgeProps {
  filter: Filter;
  homeStatTiles: Filter[];
  onToggle: (f: Filter) => void;
  styles: ReturnType<typeof makeStyles>;
  theme: ThemeColors;
  label: string;
}

function HomeTileBadge({
  filter,
  homeStatTiles,
  onToggle,
  styles,
  theme,
  label,
}: HomeTileBadgeProps) {
  const idx = homeStatTiles.indexOf(filter);
  const isPicked = idx >= 0;
  const isFull = !isPicked && homeStatTiles.length >= 3;
  const a11y = isPicked
    ? `Remove ${label} from Home tiles, slot ${idx + 1}`
    : isFull
      ? `Home tiles full, deselect one to add ${label}`
      : `Add ${label} as a Home tile`;
  return (
    <TouchableOpacity
      onPress={() => {
        if (isFull) return;
        onToggle(filter);
      }}
      disabled={isFull}
      hitSlop={6}
      style={[
        styles.tileBadge,
        isPicked && styles.tileBadgePicked,
        isFull && styles.tileBadgeDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isFull, selected: isPicked }}
      accessibilityLabel={a11y}
    >
      <Text
        style={[
          styles.tileBadgeText,
          isPicked && styles.tileBadgeTextPicked,
          isFull && styles.tileBadgeTextDisabled,
        ]}
      >
        {isPicked ? String(idx + 1) : "+"}
      </Text>
    </TouchableOpacity>
  );
  void theme;
}

function makeStyles(c: ThemeColors) {
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
    title: {
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 14,
      color: c.label,
    },
    body: { flex: 1 },
    bodyContent: { paddingTop: 4, paddingBottom: 12 },
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
      color: '#fff',
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
      color: '#fff',
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
      color: "#fff",
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
    btnPrimaryText: { color: "#fff" },
    allCard: {
      marginTop: 14,
    },
    viewRowFlush: {
      borderBottomWidth: 0,
    },
  });
}
