import React, { useState, useEffect, useMemo, ReactNode } from "react";
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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { CategoryDef, COLOR_PALETTE, categoryLabel } from "../categories";
import { ICON_KEYS, IconKey } from "../icons";
import { StatusFilter, ViewMode } from "../types";
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
  categories: CategoryDef[];
  taskCounts: Record<string, number>;
  view: ViewMode;
  onChangeView: (v: ViewMode) => void;
  viewIcons: { status: ReactNode; category: ReactNode };
  onAdd: (data: { label: string; color: string; icon: string }) => void;
  onEdit: (
    id: string,
    data: { label: string; color: string; icon: string },
  ) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  orderedStatuses: StatusEntry[];
  onRenameStatus: (id: StatusFilter, label: string) => void;
  onToggleStatusHidden: (id: StatusFilter) => void;
  onReorderStatuses: (newOrder: StatusFilter[]) => void;
  onClose: () => void;
}

type Mode =
  | { kind: "list" }
  | { kind: "edit"; id: string | null }
  | { kind: "editStatus"; id: StatusFilter };

export default function CategorySheet({
  visible,
  categories,
  taskCounts,
  view,
  onChangeView,
  viewIcons,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  orderedStatuses,
  onRenameStatus,
  onToggleStatusHidden,
  onReorderStatuses,
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[5]);
  const [icon, setIcon] = useState<string>("tag");
  const [statusLabel, setStatusLabel] = useState("");

  useEffect(() => {
    if (visible) setMode({ kind: "list" });
  }, [visible]);

  function startEditStatus(s: StatusEntry) {
    setStatusLabel(s.label);
    setMode({ kind: "editStatus", id: s.id });
  }

  function saveStatusLabel() {
    if (mode.kind !== "editStatus") return;
    onRenameStatus(mode.id, statusLabel.trim());
    setMode({ kind: "list" });
  }

  function startAdd() {
    setName("");
    setColor(COLOR_PALETTE[5]);
    setIcon("tag");
    setMode({ kind: "edit", id: null });
  }

  function startEdit(c: CategoryDef) {
    setName(categoryLabel(c, t));
    setColor(c.color);
    setIcon(c.icon);
    setMode({ kind: "edit", id: c.id });
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode.kind === "edit" && mode.id) {
      onEdit(mode.id, { label: trimmed, color, icon });
    } else {
      onAdd({ label: trimmed, color, icon });
    }
    setMode({ kind: "list" });
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
            {mode.kind === "edit" && (
              <Text style={styles.title}>
                {mode.id ? t.editCategory : t.addCategory}
              </Text>
            )}
            {mode.kind === "editStatus" && (
              <Text style={styles.title}>{t.editStatus}</Text>
            )}

            {mode.kind === "list" ? (
              <>
                <Text style={styles.sectionHeader}>VIEW</Text>
                <View style={styles.viewPicker}>
                  {(["status", "category"] as ViewMode[]).map((v, i) => (
                    <TouchableOpacity
                      key={v}
                      style={[
                        styles.viewPickerRow,
                        i === 0 && styles.viewPickerRowBorder,
                      ]}
                      onPress={() => onChangeView(v)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: view === v }}
                    >
                      {viewIcons[v]}
                      <Text style={styles.viewPickerLabel}>{t.views[v]}</Text>
                      {view === v && (
                        <Text style={styles.viewPickerCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {view === "category" ? (
                  <>
                    <Text style={styles.sectionHeader}>CATEGORIES</Text>
                    <View style={styles.listCard}>
                      <DraggableFlatList
                        data={categories}
                        keyExtractor={(c) => c.id}
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
                        }: RenderItemParams<CategoryDef>) => (
                          <View
                            style={[styles.row, isActive && styles.rowActive]}
                          >
                            <CategoryIcon
                              icon={c.icon}
                              color={c.color}
                              size={18}
                            />
                            <Text style={styles.rowLabel}>
                              {categoryLabel(c, t)}
                            </Text>
                            <TouchableOpacity
                              onPress={() => startEdit(c)}
                              style={styles.rowBtn}
                            >
                              <Text style={styles.rowBtnText}>
                                {t.editTask}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDelete(c)}
                              style={styles.rowBtn}
                              disabled={categories.length <= 1}
                            >
                              <Text
                                style={[
                                  styles.rowBtnText,
                                  {
                                    color:
                                      categories.length <= 1
                                        ? "#C7C7CC"
                                        : "#FF3B30",
                                  },
                                ]}
                              >
                                {t.deleteCategoryAction}
                              </Text>
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
                        )}
                      />
                      <TouchableOpacity
                        style={styles.addRow}
                        onPress={startAdd}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.addRowText}>
                          + {t.addCategory}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionHeader}>STATUSES</Text>
                    <View style={styles.listCard}>
                      <DraggableFlatList
                        data={orderedStatuses}
                        keyExtractor={(s) => s.id}
                        onDragEnd={({ data }) => {
                          onReorderStatuses(data.map((s) => s.id));
                        }}
                        renderItem={({
                          item: s,
                          drag,
                          isActive,
                        }: RenderItemParams<StatusEntry>) => (
                          <View
                            style={[styles.row, isActive && styles.rowActive]}
                          >
                            <StatusIcon
                              id={s.id}
                              size={18}
                              color={statusColor(s.id, theme)}
                            />
                            <Text
                              style={[
                                styles.rowLabel,
                                s.hidden && styles.rowLabelHidden,
                              ]}
                            >
                              {s.label}
                            </Text>
                            <TouchableOpacity
                              onPress={() => startEditStatus(s)}
                              style={styles.rowBtn}
                            >
                              <Text style={styles.rowBtnText}>
                                {t.editTask}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => onToggleStatusHidden(s.id)}
                              style={styles.rowBtn}
                            >
                              <Text style={styles.rowBtnText}>
                                {s.hidden ? t.showStatus : t.hideStatus}
                              </Text>
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
                        )}
                      />
                    </View>
                  </>
                )}
              </>
            ) : mode.kind === "editStatus" ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>{t.categoryNameLabel}</Text>
                  <TextInput
                    style={styles.input}
                    value={statusLabel}
                    onChangeText={setStatusLabel}
                    autoFocus
                    maxLength={40}
                  />
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => setMode({ kind: "list" })}
                  >
                    <Text style={styles.btnText}>{t.back}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={saveStatusLabel}
                  >
                    <Text style={[styles.btnText, styles.btnPrimaryText]}>
                      {t.save}
                    </Text>
                  </TouchableOpacity>
                </View>
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
                    {COLOR_PALETTE.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setColor(c)}
                        style={[
                          styles.swatch,
                          { backgroundColor: c },
                          color === c && styles.swatchSelected,
                        ]}
                        accessibilityLabel={c}
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
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => setMode({ kind: "list" })}
                  >
                    <Text style={styles.btnText}>
                      {t.back}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={handleSave}
                  >
                    <Text style={[styles.btnText, styles.btnPrimaryText]}>
                      {t.save}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {mode.kind === "list" && (
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>
                  {t.done}
                </Text>
              </TouchableOpacity>
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
      paddingTop: 8,
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
    title: {
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 14,
      color: c.label,
    },
    sectionHeader: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 8,
      marginBottom: 8,
    },
    viewPicker: {
      backgroundColor: c.bg,
      borderRadius: 10,
      marginBottom: 4,
      overflow: "hidden",
    },
    viewPickerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    viewPickerRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    viewPickerLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
      color: c.label,
    },
    viewPickerCheck: {
      fontSize: 16,
      fontWeight: "700",
      color: c.blue,
    },
    list: {
      maxHeight: 320,
      marginBottom: 8,
    },
    listCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: "hidden",
      marginBottom: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowActive: {
      backgroundColor: c.surface,
      borderRadius: 8,
      borderBottomWidth: 0,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 4,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      fontWeight: "500",
    },
    rowLabelHidden: {
      color: c.label3,
      textDecorationLine: "line-through",
    },
    rowBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    rowBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.blue,
    },
    dragHandle: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    dragHandleIcon: {
      fontSize: 18,
      color: c.label3,
      fontWeight: "500",
    },
    addRow: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      alignItems: "center",
    },
    addRowText: {
      fontSize: 15,
      fontWeight: "600",
      color: c.blue,
    },
    closeBtn: {
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: "center",
      justifyContent: "center",
    },
    closeBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: -0.16,
    },
    field: {
      marginBottom: 12,
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "none",
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
    swatchRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchSelected: {
      borderColor: c.label,
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
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
    btnPrimary: {
      backgroundColor: c.blue,
    },
    btnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.label,
    },
    btnPrimaryText: {
      color: "#fff",
    },
  });
}
