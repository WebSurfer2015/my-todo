/**
 * Bottom-sheet store picker for the grocery view. Two modes:
 *
 * - Pick (default): "All stores" locked row at top, then each
 *   user-configured store. Tapping a row sets the active store and
 *   closes the sheet. The active row has a checkmark.
 * - Manage: same list but each row has rename-inline, eye-toggle hide,
 *   delete, and a drag-handle. "+ Add store" row at the bottom. The
 *   "All stores" row is hidden in Manage mode (it's not modifiable).
 *
 * Toggled via a "Manage" / "Done" button in the sheet header.
 *
 * Split into:
 *   index.tsx  — this file, the sheet shell + state
 *   DeptForm.tsx — the add/edit-department form sub-view
 *   styles.ts  — makeStyles
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Check, Eye, EyeOff, Pencil, Trash2 } from "lucide-react-native";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  GroceryItem,
  GroceryGroup,
  OTHERS_GROUP_ID,
  newGroceryGroup,
  MAX_GROCERY_GROUPS,
  MAX_GROCERY_GROUP_LABEL_LEN,
  MAX_GROCERY_STORE_LEN,
} from "../../../core-bindings/groceries";
import { useLang } from "../../../app/LangContext";
import { useTheme } from "../../../app/theme";
import { useNotify } from "../../../app/notify";
import { linkStoreToItems } from "../../../adapters/aiInfer";
import GroceryIcon from "../GroceryIcon";
import MochiThinking from "../../mochi/MochiThinking";
import EmptyStateCard from "../../../ui/EmptyStateCard";
import { COLOR_PALETTE } from "../../../core-bindings/categories";
import { makeStyles } from "./styles";
import DeptForm from "./DeptForm";

interface Props {
  visible: boolean;
  items: GroceryItem[];
  stores: string[];
  hiddenStores: string[];
  activeStore: string | undefined;
  /** Active dept-id filter from profile (or undefined when no dept
   * narrowing is active). Pick mode renders a check on the matching
   * dept row. */
  activeDept: string | undefined;
  onSelect: (store: string | undefined) => void;
  /** Set the active dept filter. Tapping the active dept again
   * clears the filter (passing undefined). */
  onSelectDept: (deptId: string | undefined) => void;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onReorder: (next: string[]) => void;
  onToggleHidden: (name: string) => void;
  groups: GroceryGroup[];
  onSetGroups: (next: GroceryGroup[]) => void;
  /** When true, the sheet mounts in Manage (edit) mode. */
  defaultEditing?: boolean;
  /** When true, the sheet ALSO opens with the inline "Add store"
   * row already shown. Implies edit mode. */
  defaultAdding?: boolean;
  /** When true, "+ Add store" asks AI to suggest items typically
   * available at the new store and silently links them. */
  agentEnabled?: boolean;
  /** Bulk-append a store name to a set of items. Required when
   * agentEnabled is true; ignored otherwise. */
  onLinkItems?: (storeName: string, itemIds: string[]) => void;
  onClose: () => void;
}

export default function StorePicker({
  visible,
  items,
  stores,
  hiddenStores,
  activeStore,
  activeDept,
  onSelect,
  onSelectDept,
  onAdd,
  onRename,
  onDelete,
  onReorder,
  onToggleHidden,
  groups,
  onSetGroups,
  defaultEditing = false,
  defaultAdding = false,
  agentEnabled = false,
  onLinkItems,
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { showSnackbar } = useNotify();
  const { height: screenH } = useWindowDimensions();

  // Inline banner state for the AI link-items flow. Snackbars
  // render at the React root which on iOS sits BELOW a native
  // Modal — invisible while this sheet is up — so we ALSO render
  // inside the sheet. The final state fires a snackbar too so it
  // lands after the user closes the sheet.
  const [linkingMessage, setLinkingMessage] = useState<string | null>(null);
  const linkingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (linkingClearRef.current) clearTimeout(linkingClearRef.current);
    };
  }, []);
  function clearLinkingLater() {
    if (linkingClearRef.current) clearTimeout(linkingClearRef.current);
    linkingClearRef.current = setTimeout(() => setLinkingMessage(null), 4000);
  }

  function maybeLinkExistingItems(name: string) {
    if (!agentEnabled || !onLinkItems) return;
    if (items.length === 0) return;
    const payload = items
      .slice(0, 50)
      .map((it) => ({ id: it.id, text: it.text }));
    setLinkingMessage(t.suggestStepsThinking);
    void linkStoreToItems({ storeName: name, items: payload }).then((res) => {
      if (res.linkedItemIds.length === 0) {
        setLinkingMessage(`No matching items for ${name}.`);
        showSnackbar({ message: `No matching items for ${name}.` });
        clearLinkingLater();
        return;
      }
      onLinkItems(name, res.linkedItemIds);
      const n = res.linkedItemIds.length;
      const msg = `Linked ${n} ${n === 1 ? "item" : "items"} to ${name}.`;
      setLinkingMessage(msg);
      showSnackbar({ message: msg });
      clearLinkingLater();
    });
  }

  const [editing, setEditing] = useState(defaultEditing);
  useEffect(() => {
    if (visible) setEditing(defaultEditing || defaultAdding);
  }, [visible, defaultEditing, defaultAdding]);
  const [inlineName, setInlineName] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  useEffect(() => {
    if (!visible) return;
    if (defaultAdding) {
      setAddingNew(true);
      setNewName("");
    }
  }, [visible, defaultAdding]);
  const [dragActive, setDragActive] = useState(false);

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (it.checked) continue;
      m.set(it.groupId, (m.get(it.groupId) ?? 0) + 1);
    }
    return m;
  }, [items]);
  void deptCounts; // currently unused after the dept section was removed; kept for parity.

  function commitGroups(next: GroceryGroup[]) {
    const o = next.find((g) => g.id === OTHERS_GROUP_ID);
    const rest = next.filter((g) => g.id !== OTHERS_GROUP_ID);
    onSetGroups(o ? [...rest, o] : rest);
  }

  function toggleDeptHidden(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return;
    const i = groups.findIndex((x) => x.id === g.id);
    if (i < 0) return;
    const nextHidden = !g.hidden;
    const updated = [...groups];
    updated[i] = { ...g, hidden: nextHidden };
    commitGroups(updated);
    if (nextHidden && activeDept === g.id) onSelectDept(undefined);
  }
  void toggleDeptHidden;

  function deleteDept(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return;
    Alert.alert(
      "Delete department",
      `Delete "${g.label}"? Items in this department will fall back to Miscellaneous.`,
      [
        { text: t.cancel, style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            commitGroups(groups.filter((x) => x.id !== g.id));
            if (activeDept === g.id) onSelectDept(undefined);
          },
        },
      ],
    );
  }
  void deleteDept;

  const draggableDepts = groups.filter((g) => g.id !== OTHERS_GROUP_ID);
  void draggableDepts;
  const othersDept = groups.find((g) => g.id === OTHERS_GROUP_ID);
  void othersDept;
  const visibleDepts = editing ? groups : groups.filter((g) => !g.hidden);
  void visibleDepts;

  // Department edit-form mode. When non-null, the sheet body renders
  // the form instead of the list view.
  type DeptFormMode = { kind: "add" } | { kind: "edit"; id: string };
  const [deptFormMode, setDeptFormMode] = useState<DeptFormMode | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[3]);
  const [formIcon, setFormIcon] = useState<string>("tag");

  function openAddDept() {
    setFormLabel("");
    setFormColor(COLOR_PALETTE[3]);
    setFormIcon("tag");
    setDeptFormMode({ kind: "add" });
  }
  void openAddDept;

  function openEditDept(g: GroceryGroup) {
    setFormLabel(g.label);
    setFormColor(g.color ?? COLOR_PALETTE[3]);
    setFormIcon(g.icon ?? "tag");
    setDeptFormMode({ kind: "edit", id: g.id });
  }
  void openEditDept;

  function saveDeptForm() {
    const label = formLabel.trim();
    if (!label) return;
    if (!deptFormMode) return;
    if (deptFormMode.kind === "add") {
      if (groups.length >= MAX_GROCERY_GROUPS) {
        setDeptFormMode(null);
        return;
      }
      const fresh: GroceryGroup = {
        ...newGroceryGroup(label),
        color: formColor,
        icon: formIcon,
      };
      const idx = groups.findIndex((g) => g.id === OTHERS_GROUP_ID);
      const updated = [...groups];
      if (idx >= 0) updated.splice(idx, 0, fresh);
      else updated.push(fresh);
      commitGroups(updated);
    } else {
      const i = groups.findIndex((g) => g.id === deptFormMode.id);
      if (i >= 0) {
        const updated = [...groups];
        updated[i] = {
          ...groups[i],
          label: label.slice(0, MAX_GROCERY_GROUP_LABEL_LEN),
          color: formColor,
          icon: formIcon,
        };
        commitGroups(updated);
      }
    }
    setDeptFormMode(null);
  }

  const counts = useMemo(() => {
    const tagged = new Map<string, number>();
    for (const it of items) {
      if (it.checked) continue;
      for (const s of it.stores) {
        tagged.set(s, (tagged.get(s) ?? 0) + 1);
      }
    }
    const m = new Map<string, number>();
    for (const s of stores) {
      m.set(s, tagged.get(s) ?? 0);
    }
    return m;
  }, [items, stores]);

  const totalActive = useMemo(
    () => items.filter((it) => !it.checked).length,
    [items],
  );

  function commitRename(oldName: string) {
    const next = inlineDraft.trim();
    if (next && next !== oldName) onRename(oldName, next);
    setInlineName(null);
  }

  function confirmDelete(name: string) {
    Alert.alert(
      "Delete store",
      `Remove "${name}"? Any items tagged with this store keep their text but lose the store hint.`,
      [
        { text: t.cancel, style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(name),
        },
      ],
    );
  }

  function pickStore(s: string | undefined) {
    onSelect(s);
    onClose();
  }

  const visibleStores = editing
    ? stores
    : stores.filter((s) => !hiddenStores.includes(s));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (editing) setEditing(false);
        onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (editing) setEditing(false);
            onClose();
          }}
        >
          <Pressable
            style={[styles.sheet, { minHeight: screenH * 0.3 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            {deptFormMode ? (
              <DeptForm
                mode={deptFormMode.kind}
                label={formLabel}
                color={formColor}
                icon={formIcon}
                onLabel={setFormLabel}
                onColor={setFormColor}
                onIcon={setFormIcon}
                onCancel={() => setDeptFormMode(null)}
                onSave={saveDeptForm}
                styles={styles}
                theme={theme}
                t={t}
              />
            ) : (
              <>
                <View style={styles.titleRow}>
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={10}
                    style={styles.titleSideBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.cancelText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>
                    {editing ? "Manage Store" : "Select Store"}
                  </Text>
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={10}
                    style={styles.titleSideBtn}
                  >
                    <Text style={styles.manageText}>{t.done}</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={[
                    styles.scrollContent,
                    editing &&
                      stores.length === 0 &&
                      !addingNew &&
                      styles.scrollContentCenter,
                  ]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  scrollEnabled={!dragActive}
                >
                  {editing && stores.length === 0 && !addingNew ? (
                    <EmptyStateCard
                      title="No stores yet."
                      actionLabel="+ Add store"
                      onAction={() => {
                        setNewName("");
                        setAddingNew(true);
                      }}
                    />
                  ) : (
                    <View style={styles.card}>
                      {!editing && (
                        <TouchableOpacity
                          style={styles.viewRow}
                          onPress={() => pickStore(undefined)}
                          activeOpacity={0.65}
                          accessibilityRole="button"
                          accessibilityLabel={`Any store, ${totalActive} items`}
                        >
                          <Text style={styles.viewRowLabel}>Any</Text>
                          <Text style={styles.viewRowCount}>{totalActive}</Text>
                          {activeStore === undefined ? (
                            <Check
                              size={18}
                              color={theme.primary}
                              strokeWidth={2.5}
                            />
                          ) : (
                            <View style={styles.checkPlaceholder} />
                          )}
                        </TouchableOpacity>
                      )}
                      {editing ? (
                        <DraggableFlatList
                          data={stores}
                          keyExtractor={(s) => `store-${s}`}
                          scrollEnabled={false}
                          activationDistance={20}
                          onDragBegin={() => setDragActive(true)}
                          onDragEnd={({ data }) => {
                            setDragActive(false);
                            onReorder(data);
                          }}
                          renderItem={({
                            item: s,
                            drag,
                            isActive,
                          }: RenderItemParams<string>) => {
                            const isInline = inlineName === s;
                            const hidden = hiddenStores.includes(s);
                            return (
                              <View
                                style={[
                                  styles.editRow,
                                  isActive && styles.editRowActive,
                                ]}
                              >
                                <GroceryIcon kind="store" id={s} size={18} />
                                {isInline ? (
                                  <TextInput
                                    style={[
                                      styles.editRowLabel,
                                      styles.inlineInput,
                                    ]}
                                    value={inlineDraft}
                                    onChangeText={setInlineDraft}
                                    autoFocus
                                    selectTextOnFocus
                                    onBlur={() => commitRename(s)}
                                    onSubmitEditing={() => commitRename(s)}
                                    returnKeyType="done"
                                    maxLength={MAX_GROCERY_STORE_LEN}
                                  />
                                ) : (
                                  <TouchableOpacity
                                    style={styles.editRowLabelTap}
                                    onPress={() => {
                                      setInlineName(s);
                                      setInlineDraft(s);
                                    }}
                                    activeOpacity={0.6}
                                    accessibilityLabel={`Rename ${s}`}
                                  >
                                    <View style={styles.editRowLabelInner}>
                                      <Text
                                        style={[
                                          styles.editRowLabel,
                                          hidden && styles.editRowLabelHidden,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {s}
                                      </Text>
                                      <Pencil
                                        size={11}
                                        color={theme.label3}
                                        strokeWidth={2}
                                      />
                                    </View>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => onToggleHidden(s)}
                                  hitSlop={6}
                                  style={styles.rowAction}
                                  accessibilityRole="switch"
                                  accessibilityState={{ checked: !hidden }}
                                >
                                  {hidden ? (
                                    <EyeOff
                                      size={16}
                                      color={theme.label3}
                                      strokeWidth={2}
                                    />
                                  ) : (
                                    <Eye
                                      size={16}
                                      color={theme.label2}
                                      strokeWidth={2}
                                    />
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => confirmDelete(s)}
                                  hitSlop={6}
                                  style={styles.rowAction}
                                >
                                  <Trash2
                                    size={14}
                                    color={theme.red}
                                    strokeWidth={2}
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
                      ) : (
                        visibleStores.map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={styles.viewRow}
                            onPress={() => pickStore(s)}
                            activeOpacity={0.65}
                          >
                            <GroceryIcon kind="store" id={s} size={18} />
                            <Text
                              style={styles.viewRowLabel}
                              numberOfLines={1}
                            >
                              {s}
                            </Text>
                            <Text style={styles.viewRowCount}>
                              {counts.get(s) ?? 0}
                            </Text>
                            {activeStore === s ? (
                              <Check
                                size={18}
                                color={theme.primary}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <View style={styles.checkPlaceholder} />
                            )}
                          </TouchableOpacity>
                        ))
                      )}
                      {editing && addingNew && (
                        <View style={[styles.editRow, styles.editRowActive]}>
                          <GroceryIcon kind="store" id="_" size={18} />
                          <TextInput
                            style={[styles.editRowLabel, styles.inlineInput]}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Store name"
                            placeholderTextColor={theme.label3}
                            autoFocus
                            returnKeyType="done"
                            maxLength={MAX_GROCERY_STORE_LEN}
                            onSubmitEditing={() => {
                              const name = newName.trim();
                              if (name) {
                                onAdd(name);
                                maybeLinkExistingItems(name);
                              }
                              setNewName("");
                              setAddingNew(false);
                            }}
                            onBlur={() => {
                              const name = newName.trim();
                              if (name) {
                                onAdd(name);
                                maybeLinkExistingItems(name);
                              }
                              setNewName("");
                              setAddingNew(false);
                            }}
                          />
                          <View style={styles.rowAction} />
                          <View style={styles.rowAction} />
                          <View style={styles.dragHandle} />
                        </View>
                      )}
                      {linkingMessage && (
                        <View style={styles.linkingBanner}>
                          {linkingMessage === t.suggestStepsThinking ? (
                            <MochiThinking />
                          ) : (
                            <Text style={styles.linkingBannerText}>
                              {linkingMessage}
                            </Text>
                          )}
                        </View>
                      )}
                      {editing && !addingNew && (
                        <TouchableOpacity
                          style={[styles.addRow, styles.addRowBtn]}
                          onPress={() => {
                            setNewName("");
                            setAddingNew(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Add a store"
                        >
                          <Text style={styles.addRowBtnText}>+ Add store</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <View style={{ height: 24 }} />
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
