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
import { CategoryDef, COLOR_PALETTE, categoryLabel } from "../categories";
import { ICON_KEYS, IconKey } from "../icons";
import CategoryIcon from "./CategoryIcon";
import { useLang } from "../LangContext";
import { useTheme, ThemeColors } from "../theme";

interface Props {
  visible: boolean;
  categories: CategoryDef[];
  taskCounts: Record<string, number>;
  onAdd: (data: { label: string; color: string; icon: string }) => void;
  onEdit: (
    id: string,
    data: { label: string; color: string; icon: string },
  ) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

type Mode = { kind: "list" } | { kind: "edit"; id: string | null };

export default function CategorySheet({
  visible,
  categories,
  taskCounts,
  onAdd,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const { t, lang } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[5]);
  const [icon, setIcon] = useState<string>("tag");

  useEffect(() => {
    if (visible) setMode({ kind: "list" });
  }, [visible]);

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
      { text: lang === "en" ? "Cancel" : "取消", style: "cancel" },
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>
              {mode.kind === "list"
                ? t.manageCategories
                : mode.id
                  ? t.editCategory
                  : t.addCategory}
            </Text>

            {mode.kind === "list" ? (
              <>
                <ScrollView style={styles.list}>
                  {categories.map((c) => (
                    <View key={c.id} style={styles.row}>
                      <CategoryIcon icon={c.icon} color={c.color} size={18} />
                      <Text style={styles.rowLabel}>{categoryLabel(c, t)}</Text>
                      <TouchableOpacity
                        onPress={() => startEdit(c)}
                        style={styles.rowBtn}
                      >
                        <Text style={styles.rowBtnText}>{t.editTask}</Text>
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
                                categories.length <= 1 ? "#C7C7CC" : "#FF3B30",
                            },
                          ]}
                        >
                          {t.deleteCategoryAction}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.addBtn} onPress={startAdd}>
                  <Text style={styles.addBtnText}>+ {t.addCategory}</Text>
                </TouchableOpacity>
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
                      {lang === "en" ? "Back" : "返回"}
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
                  {lang === "en" ? "Done" : "完成"}
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
      paddingHorizontal: 20,
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
    list: {
      maxHeight: 320,
      marginBottom: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      fontWeight: "500",
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
    addBtn: {
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: c.bg,
      borderRadius: 8,
      marginTop: 8,
    },
    addBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.blue,
    },
    closeBtn: {
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    closeBtnText: {
      fontSize: 15,
      fontWeight: "600",
      color: c.blue,
    },
    field: {
      marginBottom: 12,
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
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
