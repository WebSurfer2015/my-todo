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
  StatusFilter,
  categoryFilter,
  categoryIdFromFilter,
  isCategoryFilter,
} from "../types";
import CategoryIcon from "./CategoryIcon";
import StatusIcon, { statusColor } from "./StatusIcon";
import { useLang } from "../LangContext";
import { useTheme, ThemeColors } from "../theme";

export interface StatusEntry {
  id: StatusFilter;
  label: string;
  hidden: boolean;
}

interface Props {
  visible: boolean;
  currentFilter: Filter;
  /** Ordered list of pinned filters (from Profile.pinnedFilters). Inline Pin
   * buttons in Configure mode check this list to render the pinned state. */
  pinnedFilters: Filter[];
  onSelectFilter: (f: Filter) => void;
  onPinFilter: (f: Filter) => void;
  categories: CategoryDef[];
  /** Total task counts per category (used for delete confirm + row badges). */
  taskCounts: Record<string, number>;
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number };
  /** Full status list — used in Edit mode so hidden statuses can be unhidden. */
  orderedStatuses: StatusEntry[];
  /** Visible-only status list — used in View mode picker. */
  orderedVisibleStatuses: { id: StatusFilter; label: string }[];
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
  pinnedFilters,
  onSelectFilter,
  onPinFilter,
  categories,
  taskCounts,
  systemCounts,
  orderedStatuses,
  orderedVisibleStatuses,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  onRenameStatus,
  onToggleStatusHidden,
  onReorderStatuses,
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[5]);
  const [icon, setIcon] = useState<string>("tag");
  // Inline label editing in Configure mode — tap a row's label to rename
  // it in place. `inlineId` is the status/category id being edited (null
  // when no row is open); `inlineText` is the staged new label.
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState("");

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
      onEdit(c.id, { label: trimmed, color: c.color, icon: c.icon });
    }
    setInlineId(null);
  }

  useEffect(() => {
    if (visible) setMode({ kind: "view" });
  }, [visible]);

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

  function pickFilter(f: Filter) {
    onSelectFilter(f);
    onClose();
  }

  // --- Row renderers ----------------------------------------------------

  function viewStatusRow(s: { id: StatusFilter; label: string }) {
    const active = currentFilter === s.id;
    const count = systemCounts[s.id] ?? 0;
    return (
      <TouchableOpacity
        key={s.id}
        style={styles.viewRow}
        onPress={() => pickFilter(s.id)}
        activeOpacity={0.65}
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

  function viewCategoryRow(c: CategoryDef) {
    const active = isCategoryFilter(currentFilter) && categoryIdFromFilter(currentFilter) === c.id;
    const count = taskCounts[c.id] ?? 0;
    return (
      <TouchableOpacity
        key={c.id}
        style={styles.viewRow}
        onPress={() => pickFilter(categoryFilter(c.id))}
        onLongPress={() => startEditCategory(c)}
        delayLongPress={350}
        activeOpacity={0.65}
      >
        <View style={styles.rowIcon}>
          <CategoryIcon icon={c.icon} color={c.color} size={18} />
        </View>
        <Text style={styles.viewRowLabel}>{categoryLabel(c, t)}</Text>
        <Text style={styles.viewRowCount}>{count}</Text>
        {/* Pencil — same action as long-press, gives users a visible
            affordance for editing color/icon/label without bulk-edit. */}
        <TouchableOpacity
          onPress={() => startEditCategory(c)}
          hitSlop={8}
          style={styles.viewRowEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${categoryLabel(c, t)}`}
        >
          <Pencil size={14} color={theme.label3} strokeWidth={2} />
        </TouchableOpacity>
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
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.handle} />

              {isList ? (
                <>
                  <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onClose} hitSlop={8}>
                      <Text style={styles.headerLeft}>{t.cancel}</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{isEditing ? t.configureFilter : 'Select Filter'}</Text>
                    <TouchableOpacity
                      onPress={() => setMode(isEditing ? { kind: "view" } : { kind: "edit" })}
                      hitSlop={8}
                    >
                      <Text style={styles.headerRight}>
                        {isEditing ? t.done : t.configure}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isEditing ? (
                    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                      <Text style={styles.sectionHeader}>STATUSES</Text>
                      <View style={styles.listCard}>
                        <DraggableFlatList
                          data={orderedStatuses}
                          keyExtractor={(s) => s.id}
                          scrollEnabled={false}
                          activationDistance={8}
                          onDragEnd={({ data }) => {
                            onReorderStatuses(data.map((s) => s.id));
                          }}
                          renderItem={({
                            item: s,
                            drag,
                            isActive,
                          }: RenderItemParams<StatusEntry>) => {
                            const isInline = inlineId === s.id;
                            const isPinned = pinnedFilters.includes(s.id);
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
                                  onPress={() => onPinFilter(s.id)}
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

                      <Text style={styles.sectionHeader}>CATEGORIES</Text>
                      <View style={styles.listCard}>
                        <DraggableFlatList
                          data={categories}
                          keyExtractor={(c) => c.id}
                          scrollEnabled={false}
                          activationDistance={8}
                          onDragEnd={({ data }) => {
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
                            const isPinned = pinnedFilters.includes(catFilter);
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
                                  onPress={() => onPinFilter(catFilter)}
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
                          onPress={() => pickFilter("all")}
                          activeOpacity={0.65}
                        >
                          <View style={styles.rowIcon} />
                          <Text style={styles.viewRowLabel}>{t.filters.all}</Text>
                          <Text style={styles.viewRowCount}>{systemCounts.all}</Text>
                          {currentFilter === "all" ? (
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
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
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
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 28,
      maxHeight: "85%",
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
    body: { flexShrink: 1 },
    bodyContent: { paddingTop: 4, paddingBottom: 12 },
    sectionHeader: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 14,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    listCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: "hidden",
    },
    viewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowIcon: { width: 20, alignItems: "center" },
    viewRowLabel: { flex: 1, fontSize: 16, fontWeight: "500", color: c.label },
    viewRowCount: {
      fontSize: 14,
      color: c.label3,
      fontVariant: ["tabular-nums"],
      minWidth: 24,
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
