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
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, Eye, EyeOff, Pencil, Trash2 } from "lucide-react-native";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  GroceryItem,
  GroceryGroup,
  MAX_GROCERY_STORE_LEN,
} from "../../../core-bindings/groceries";
import { useLang } from "../../../app/LangContext";
import { useTheme } from "../../../app/theme";
import { useNotify } from "../../../app/notify";
import { linkStoreToItems } from "../../../adapters/aiInfer";
import GroceryIcon from "../GroceryIcon";
import MochiThinking from "../../mochi/MochiThinking";
import EmptyStateCard from "../../../ui/EmptyStateCard";
import { makeStyles } from "./styles";
import SheetShell from "../../../ui/SheetShell";

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

  // Inline banner state for the AI link-items flow. Snackbars
  // render at the React root which on iOS sits BELOW a native
  // Modal — invisible while this sheet is up — so we ALSO render
  // inside the sheet. The final state fires a snackbar too so it
  // lands after the user closes the sheet.
  const [linkingMessage, setLinkingMessage] = useState<string | null>(null);
  // The store being matched — surfaced in the thinking line ("Matching items
  // to <store>…") so the user sees what Mochi is actually doing.
  const [linkingStore, setLinkingStore] = useState("");
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
    setLinkingStore(name);
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
    }).catch(() => {
      // Network / rate-limit (429) — don't leave the "thinking" banner hanging.
      setLinkingMessage(`Couldn't match items for ${name}. Try again.`);
      showSnackbar({ message: `Couldn't match items for ${name}.` });
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

  const closeAndReset = () => {
    setEditing(false);
    onClose();
  };

  return (
    <SheetShell
      visible={visible}
      onClose={closeAndReset}
      scroll={false}
      padded={false}
      title={editing ? "Manage Store" : "Select Store"}
      primary={{ label: t.done, onPress: closeAndReset }}
    >
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
                                  hitSlop={12}
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
                                  hitSlop={12}
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
                            // Single commit path: blur. Return dismisses the
                            // keyboard (blurOnSubmit) → onBlur fires, so we
                            // don't commit twice. Blur = commit (matches inline
                            // rename, which also blur-saves) so a typed store
                            // name isn't silently dropped when the user taps
                            // Done / away. To back out, clear the field first —
                            // an empty name adds nothing.
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
                            <MochiThinking label={`Matching items to ${linkingStore}…`} />
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
    </SheetShell>
  );
}
