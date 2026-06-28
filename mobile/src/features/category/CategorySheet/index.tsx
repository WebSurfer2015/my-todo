import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Check, Pin, Pencil, Eye, EyeOff, Trash2 } from "lucide-react-native";
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
  categoryIdFromFilter,
  isCategoryFilter,
  isPriorityFilter,
  priorityFilter,
  priorityFromFilter,
} from "../../../core-bindings/types";
import CategoryIcon from "../../../ui/CategoryIcon";
import StatusIcon, { statusColor } from "../../../ui/StatusIcon";
import PriorityBars from "../../../ui/PriorityBars";
import { useLang } from "../../../app/LangContext";
import { useTheme, ThemeColors } from "../../../app/theme";
import SheetShell from "../../../ui/SheetShell";

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
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number; notDo: number };
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

  const headerLeft =
    mode.kind === "editCategory"
      ? { label: `‹ ${t.back}`, onPress: () => setMode({ kind: "edit" }) }
      : { label: t.cancel, onPress: onClose };
  const headerTitle =
    mode.kind === "editCategory"
      ? mode.id
        ? t.editCategory
        : t.addCategory
      : isEditing
        ? "Manage Todo's Filter"
        : "Select Filter";
  const headerPrimary =
    mode.kind === "editCategory"
      ? undefined
      : isEditing
        ? { label: t.done, onPress: onClose }
        : { label: "Reset", onPress: onClearFilters };
  const headerRight =
    mode.kind === "editCategory" && mode.id && categories.length > 1 ? (
      <TouchableOpacity
        onPress={() => {
          const c = categories.find((x) => x.id === mode.id);
          if (c) handleDelete(c);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t.deleteCategoryAction}
      >
        <Trash2 size={20} color={theme.red} strokeWidth={2} />
      </TouchableOpacity>
    ) : undefined;
  const footer =
    mode.kind === "view" ? (
      <TouchableOpacity
        style={styles.viewDoneBtn}
        onPress={onClose}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Set Filter"
      >
        <Text style={styles.viewDoneText}>Set Filter</Text>
      </TouchableOpacity>
    ) : undefined;

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      scroll={false}
      heightPct={0.85}
      title={headerTitle}
      left={headerLeft}
      primary={headerPrimary}
      right={headerRight}
      footer={footer}
    >
              {isList ? (
                <>
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
                    </ScrollView>
                    </>
                  )}
                </>
              ) : (
                <>
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
    </SheetShell>
  );
}
