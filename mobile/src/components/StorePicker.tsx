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
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  Check,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
} from 'lucide-react-native'
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist'
import {
  GroceryItem,
  GroceryGroup,
  OTHERS_GROUP_ID,
  newGroceryGroup,
  MAX_GROCERY_GROUPS,
  MAX_GROCERY_GROUP_LABEL_LEN,
  MAX_GROCERY_STORE_LEN,
} from '../groceries'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { useNotify } from '../notify'
import { linkStoreToItems } from '../aiInfer'
import GroceryIcon from './GroceryIcon'
import MochiThinking from './MochiThinking'
import EmptyStateCard from './EmptyStateCard'
import { GROCERY_DEPT_ICONS } from './groceryDeptIcons'
import { COLOR_PALETTE } from '../categories'

interface Props {
  visible: boolean
  items: GroceryItem[]
  stores: string[]
  hiddenStores: string[]
  activeStore: string | undefined
  /** Active dept-id filter from profile (or undefined when no dept
   * narrowing is active). Pick mode renders a check on the matching
   * dept row. */
  activeDept: string | undefined
  onSelect: (store: string | undefined) => void
  /** Set the active dept filter. Tapping the active dept again
   * clears the filter (passing undefined). */
  onSelectDept: (deptId: string | undefined) => void
  onAdd: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string) => void
  onReorder: (next: string[]) => void
  onToggleHidden: (name: string) => void
  // Departments — second section on the filter sheet, same manage UX
  // as the stores section. DepartmentPicker (the dept-chip target)
  // stays as a separate component for the in-line pick experience.
  groups: GroceryGroup[]
  onSetGroups: (next: GroceryGroup[]) => void
  /** When true, the sheet mounts in Manage (edit) mode. Used by the
   * Groceries AppHeader gear icon and Settings → Manage Groceries.
   * Default false (Pick mode). Resets on every open. */
  defaultEditing?: boolean
  /** When true, the sheet ALSO opens with the inline "Add store"
   * row already shown (skips the user tapping "+ Add store"). Used
   * by the no-stores empty state on the Shopping screen so the
   * first-time user lands directly on the name input. Implies edit
   * mode. Resets on every open. */
  defaultAdding?: boolean
  /** When true, the "+ Add store" flow asks the AI to suggest which
   * existing items would typically be available at the new store and
   * silently appends the store to their `stores` arrays. Off → the
   * new store is created but no items are linked. */
  agentEnabled?: boolean
  /** Bulk-append a store name to a set of items. Called after the
   * AI link-store-to-items dispatch resolves. Required when
   * agentEnabled is true; ignored otherwise. */
  onLinkItems?: (storeName: string, itemIds: string[]) => void
  onClose: () => void
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
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { showSnackbar } = useNotify()
  // 30% of screen height — per the global "min sheet height" design
  // rule. Keeps low-content states (e.g. opened straight into "Add
  // store") from collapsing into a tiny floater that reads as broken.
  const { height: screenH } = useWindowDimensions()

  // Inline banner state for the AI link-items flow. Renders inside
  // this sheet so the user can see "Mochi is working…" even while
  // the modal is open (snackbars render at the React root, which on
  // iOS sits BELOW any native Modal — invisible to the user while
  // this sheet is up). We ALSO fire a snackbar for the final state
  // so it lands after the user closes the sheet.
  const [linkingMessage, setLinkingMessage] = useState<string | null>(null)
  const linkingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (linkingClearRef.current) clearTimeout(linkingClearRef.current)
    }
  }, [])
  function clearLinkingLater() {
    if (linkingClearRef.current) clearTimeout(linkingClearRef.current)
    linkingClearRef.current = setTimeout(() => setLinkingMessage(null), 4000)
  }

  // After creating a new store, dispatch the AI link-items call and
  // silently append the store to every item the model judges would
  // be available there. Gated on agentEnabled so opted-out users
  // never spend tokens.
  function maybeLinkExistingItems(name: string) {
    if (!agentEnabled || !onLinkItems) return
    if (items.length === 0) return
    const payload = items.slice(0, 50).map((it) => ({ id: it.id, text: it.text }))
    setLinkingMessage(t.suggestStepsThinking)
    void linkStoreToItems({ storeName: name, items: payload }).then((res) => {
      if (res.linkedItemIds.length === 0) {
        setLinkingMessage(`No matching items for ${name}.`)
        showSnackbar({ message: `No matching items for ${name}.` })
        clearLinkingLater()
        return
      }
      onLinkItems(name, res.linkedItemIds)
      const n = res.linkedItemIds.length
      const msg = `Linked ${n} ${n === 1 ? 'item' : 'items'} to ${name}.`
      setLinkingMessage(msg)
      showSnackbar({ message: msg })
      clearLinkingLater()
    })
  }

  const [editing, setEditing] = useState(defaultEditing)
  // On every open, snap to the caller's requested mode (matches the
  // pattern CategorySheet uses for its funnel/gear split). When
  // defaultAdding is on, also imply edit mode — Manage is the only
  // mode where the inline "+ Add store" row makes sense.
  useEffect(() => {
    if (visible) setEditing(defaultEditing || defaultAdding)
  }, [visible, defaultEditing, defaultAdding])
  const [inlineName, setInlineName] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState('')
  const [newName, setNewName] = useState('')
  // True while the inline "+ Add store" row is in edit mode (an empty
  // input row above the Add button). Separated from `newName` so the
  // input text doesn't double as a visibility flag.
  const [addingNew, setAddingNew] = useState(false)
  // Auto-open the inline "Add store" row when the sheet was opened
  // from the no-stores empty state (defaultAdding=true). Resets on
  // every visibility change so a re-open without the flag goes back
  // to the standard list view.
  useEffect(() => {
    if (!visible) return
    if (defaultAdding) {
      setAddingNew(true)
      setNewName('')
    }
  }, [visible, defaultAdding])
  // True while the user is actively dragging a row's reorder handle.
  // We freeze the outer ScrollView during a drag so the sheet doesn't
  // appear to "scroll up" along with the dragged row — DraggableFlatList
  // and the ScrollView were competing for the vertical pan gesture.
  const [dragActive, setDragActive] = useState(false)

  // Per-department active-item counts shown in pick mode.
  const deptCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      if (it.checked) continue
      m.set(it.groupId, (m.get(it.groupId) ?? 0) + 1)
    }
    return m
  }, [items])

  function commitGroups(next: GroceryGroup[]) {
    const o = next.find((g) => g.id === OTHERS_GROUP_ID)
    const rest = next.filter((g) => g.id !== OTHERS_GROUP_ID)
    onSetGroups(o ? [...rest, o] : rest)
  }

  function toggleDeptHidden(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return
    const i = groups.findIndex((x) => x.id === g.id)
    if (i < 0) return
    const nextHidden = !g.hidden
    const updated = [...groups]
    updated[i] = { ...g, hidden: nextHidden }
    commitGroups(updated)
    // Hiding the currently-active dept would leave an orphan filter
    // pointing at an invisible bucket — clear it so the pill row
    // doesn't dangle and the list shows everything again.
    if (nextHidden && activeDept === g.id) onSelectDept(undefined)
  }

  function deleteDept(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return
    Alert.alert(
      'Delete department',
      `Delete "${g.label}"? Items in this department will fall back to Miscellaneous.`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            commitGroups(groups.filter((x) => x.id !== g.id))
            // Clear the active filter if it was pointing at the just-
            // deleted dept (otherwise profile.activeGroceryDept keeps
            // a stale id forever).
            if (activeDept === g.id) onSelectDept(undefined)
          },
        },
      ],
    )
  }


  const draggableDepts = groups.filter((g) => g.id !== OTHERS_GROUP_ID)
  const othersDept = groups.find((g) => g.id === OTHERS_GROUP_ID)
  const visibleDepts = editing ? groups : groups.filter((g) => !g.hidden)

  // Department edit-form mode. When non-null, the sheet body renders
  // the form (label + color + icon picker) instead of the list view.
  type DeptFormMode = { kind: 'add' } | { kind: 'edit'; id: string }
  const [deptFormMode, setDeptFormMode] = useState<DeptFormMode | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[3])
  const [formIcon, setFormIcon] = useState<string>('tag')

  function openAddDept() {
    setFormLabel('')
    setFormColor(COLOR_PALETTE[3])
    setFormIcon('tag')
    setDeptFormMode({ kind: 'add' })
  }

  function openEditDept(g: GroceryGroup) {
    setFormLabel(g.label)
    setFormColor(g.color ?? COLOR_PALETTE[3])
    setFormIcon(g.icon ?? 'tag')
    setDeptFormMode({ kind: 'edit', id: g.id })
  }

  function saveDeptForm() {
    const label = formLabel.trim()
    if (!label) return
    if (!deptFormMode) return
    if (deptFormMode.kind === 'add') {
      if (groups.length >= MAX_GROCERY_GROUPS) {
        setDeptFormMode(null)
        return
      }
      const fresh: GroceryGroup = {
        ...newGroceryGroup(label),
        color: formColor,
        icon: formIcon,
      }
      const idx = groups.findIndex((g) => g.id === OTHERS_GROUP_ID)
      const updated = [...groups]
      if (idx >= 0) updated.splice(idx, 0, fresh)
      else updated.push(fresh)
      commitGroups(updated)
    } else {
      const i = groups.findIndex((g) => g.id === deptFormMode.id)
      if (i >= 0) {
        const updated = [...groups]
        updated[i] = {
          ...groups[i],
          label: label.slice(0, MAX_GROCERY_GROUP_LABEL_LEN),
          color: formColor,
          icon: formIcon,
        }
        commitGroups(updated)
      }
    }
    setDeptFormMode(null)
  }

  // Per-store active-item counts shown next to each row in pick mode.
  // Includes items with no store tag (the "Any" bucket) since picking
  // a specific store also surfaces those — keeps the count consistent
  // with what the user will actually see after tap.
  const counts = useMemo(() => {
    // Multi-store semantics: an item tagged with N stores contributes
    // +1 to each of those stores' counts. Untagged items don't count
    // toward any specific store filter (they appear in All only).
    const tagged = new Map<string, number>()
    for (const it of items) {
      if (it.checked) continue
      for (const s of it.stores) {
        tagged.set(s, (tagged.get(s) ?? 0) + 1)
      }
    }
    const m = new Map<string, number>()
    for (const s of stores) {
      m.set(s, tagged.get(s) ?? 0)
    }
    return m
  }, [items, stores])

  const totalActive = useMemo(
    () => items.filter((it) => !it.checked).length,
    [items],
  )

  function commitRename(oldName: string) {
    const next = inlineDraft.trim()
    if (next && next !== oldName) onRename(oldName, next)
    setInlineName(null)
  }

  function confirmDelete(name: string) {
    Alert.alert(
      'Delete store',
      `Remove "${name}"? Any items tagged with this store keep their text but lose the store hint.`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(name),
        },
      ],
    )
  }

  function pickStore(s: string | undefined) {
    onSelect(s)
    onClose()
  }

  const visibleStores = editing
    ? stores
    : stores.filter((s) => !hiddenStores.includes(s))

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (editing) setEditing(false)
        onClose()
      }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (editing) setEditing(false)
            onClose()
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
                {editing ? 'Manage Store' : 'Select Store'}
              </Text>
              <TouchableOpacity
                // Both modes: "Done" closes the sheet. The two flows
                // are reached from separate entry-points (funnel →
                // Select, gear → Manage); we no longer let the user
                // toggle modes from within the sheet so each one
                // stays purely-pick or purely-manage.
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
                // Vertically center the no-stores empty state. When
                // there's content, flexGrow:1 still lets the card
                // sit at the top naturally (the children just fill
                // the natural height).
                editing && stores.length === 0 && !addingNew && styles.scrollContentCenter,
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEnabled={!dragActive}
            >
              {/* Centered empty state for the Manage Store screen
                  when the user has zero stores configured (and isn't
                  already typing a name). The unified EmptyStateCard
                  reads "No stores yet." with an "+ Add store" pill
                  action — same visual family as the other empties. */}
              {editing && stores.length === 0 && !addingNew ? (
                <EmptyStateCard
                  title="No stores yet."
                  actionLabel="+ Add store"
                  onAction={() => {
                    setNewName('')
                    setAddingNew(true)
                  }}
                />
              ) : (
              <View style={styles.card}>
                {/* "Any" row — clears the store filter (dept filter
                    unchanged) so the user can drop the store narrowing
                    independently. Symmetric with how tapping the active
                    dept row clears the dept filter. */}
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
                      <Check size={18} color={theme.primary} strokeWidth={2.5} />
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
                      setDragActive(false)
                      onReorder(data)
                    }}
                    renderItem={({ item: s, drag, isActive }: RenderItemParams<string>) => {
                      const isInline = inlineName === s
                      const hidden = hiddenStores.includes(s)
                      return (
                        <View style={[styles.editRow, isActive && styles.editRowActive]}>
                          <GroceryIcon kind="store" id={s} size={18} />
                          {isInline ? (
                            <TextInput
                              style={[styles.editRowLabel, styles.inlineInput]}
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
                                setInlineName(s)
                                setInlineDraft(s)
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
                                <Pencil size={11} color={theme.label3} strokeWidth={2} />
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
                              <EyeOff size={16} color={theme.label3} strokeWidth={2} />
                            ) : (
                              <Eye size={16} color={theme.label2} strokeWidth={2} />
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => confirmDelete(s)}
                            hitSlop={6}
                            style={styles.rowAction}
                          >
                            <Trash2 size={14} color={theme.red} strokeWidth={2} />
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
                      )
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
                      <Text style={styles.viewRowLabel} numberOfLines={1}>{s}</Text>
                      <Text style={styles.viewRowCount}>{counts.get(s) ?? 0}</Text>
                      {activeStore === s ? (
                        <Check size={18} color={theme.primary} strokeWidth={2.5} />
                      ) : (
                        <View style={styles.checkPlaceholder} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
                {/* New-store row — appears INSIDE the stores list
                    (above the "+ Add store" button) when the user
                    taps Add. Mirrors the existing edit-row chrome
                    so the new line reads as part of the list, not
                    a popup. */}
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
                        const name = newName.trim()
                        if (name) {
                          onAdd(name)
                          maybeLinkExistingItems(name)
                        }
                        setNewName('')
                        setAddingNew(false)
                      }}
                      onBlur={() => {
                        const name = newName.trim()
                        if (name) {
                          onAdd(name)
                          maybeLinkExistingItems(name)
                        }
                        setNewName('')
                        setAddingNew(false)
                      }}
                    />
                    <View style={styles.rowAction} />
                    <View style={styles.rowAction} />
                    <View style={styles.dragHandle} />
                  </View>
                )}
                {/* Mochi-thinking + result banner — sits BELOW the
                    last store row and ABOVE the "+ Add store"
                    action. After the user adds a new store and the
                    AI link-items flow runs, the message reads in
                    the same area where the user just typed, not at
                    the top of the sheet. */}
                {linkingMessage && (
                  <View style={styles.linkingBanner}>
                    {linkingMessage === t.suggestStepsThinking ? (
                      <MochiThinking />
                    ) : (
                      <Text style={styles.linkingBannerText}>{linkingMessage}</Text>
                    )}
                  </View>
                )}
                {editing && !addingNew && (
                  <TouchableOpacity
                    style={[styles.addRow, styles.addRowBtn]}
                    onPress={() => {
                      setNewName('')
                      setAddingNew(true)
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Add a store"
                  >
                    <Text style={styles.addRowBtnText}>+ Add store</Text>
                  </TouchableOpacity>
                )}
              </View>
              )}

              {/* DEPARTMENTS section removed in Phase 1 — Manage
                  Store is store-only. Departments are AI-managed and
                  appear as grouping headers in the filtered list. */}
              <View style={{ height: 24 }} />
            </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

interface DeptFormProps {
  mode: 'add' | 'edit'
  label: string
  color: string
  icon: string
  onLabel: (v: string) => void
  onColor: (v: string) => void
  onIcon: (v: string) => void
  onCancel: () => void
  onSave: () => void
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
  t: ReturnType<typeof useLang>['t']
}

function DeptForm({
  mode,
  label,
  color,
  icon,
  onLabel,
  onColor,
  onIcon,
  onCancel,
  onSave,
  styles,
  theme,
  t,
}: DeptFormProps) {
  const trimmed = label.trim()
  const canSave = trimmed.length > 0
  return (
    <>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={onCancel} hitSlop={10} style={styles.titleSideBtn}>
          <Text style={{ fontSize: 15, fontWeight: '500', color: theme.primary }}>
            {t.cancel}
          </Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {mode === 'add' ? 'Add Department' : 'Edit Department'}
        </Text>
        <TouchableOpacity
          onPress={onSave}
          disabled={!canSave}
          hitSlop={10}
          style={styles.titleSideBtn}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: canSave ? theme.primary : theme.gray3,
              textAlign: 'right',
            }}
          >
            {t.save}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.formBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.formFieldLabel}>NAME</Text>
        <TextInput
          style={styles.formInput}
          value={label}
          onChangeText={onLabel}
          maxLength={MAX_GROCERY_GROUP_LABEL_LEN}
          placeholder="e.g. Health & Beauty"
          placeholderTextColor={theme.gray3}
          returnKeyType="done"
          autoFocus
        />

        <Text style={styles.formFieldLabel}>COLOR</Text>
        <View style={styles.formSwatchGrid}>
          {COLOR_PALETTE.map((hex) => (
            <TouchableOpacity
              key={hex}
              style={[
                styles.formSwatch,
                { backgroundColor: hex },
                color === hex && styles.formSwatchSelected,
              ]}
              onPress={() => onColor(hex)}
              accessibilityLabel={`Color ${hex}`}
              accessibilityRole="button"
              accessibilityState={{ selected: color === hex }}
            />
          ))}
        </View>

        <Text style={styles.formFieldLabel}>ICON</Text>
        <View style={styles.formIconGrid}>
          {GROCERY_DEPT_ICONS.map(({ key, Icon }) => {
            const selected = icon === key
            return (
              <TouchableOpacity
                key={key}
                style={[styles.formIconTile, selected && styles.formIconTileSelected]}
                onPress={() => onIcon(key)}
                accessibilityLabel={`Icon ${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Icon size={20} color={color} strokeWidth={2} />
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 6,
      maxHeight: '85%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginVertical: 6,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    titleSideBtn: { width: 64 },
    linkingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primarySoft,
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    linkingBannerText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
      flexShrink: 1,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.label, textAlign: 'center' },
    manageText: { fontSize: 15, fontWeight: '600', color: c.primary, textAlign: 'right' },
    cancelText: { fontSize: 15, fontWeight: '500', color: c.primary, textAlign: 'left' },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },
    // Stretch + center the scroll content so an empty state (the
    // no-stores EmptyStateCard) sits vertically mid-sheet instead of
    // pinned to the top with empty space below.
    scrollContentCenter: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionHeaderSpaced: { marginTop: 18 },
    viewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    viewRowLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: c.label },
    viewRowCount: {
      fontSize: 13,
      color: c.label3,
      fontVariant: ['tabular-nums'],
      minWidth: 24,
      textAlign: 'right',
    },
    deptIconSpacer: { width: 18 },
    checkPlaceholder: { width: 18 },
    editRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      minHeight: 48,
      width: '100%',
    },
    editRowActive: { backgroundColor: c.primarySoft },
    editRowLabelTap: { flex: 1, justifyContent: 'center', paddingVertical: 4 },
    editRowLabelInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    editRowLabel: {
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
      flexShrink: 1,
    },
    editRowLabelHidden: { color: c.label3, textDecorationLine: 'line-through' },
    inlineInput: {
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      flex: 1,
    },
    rowAction: {
      paddingHorizontal: 6,
      paddingVertical: 4,
      minWidth: 28,
      alignItems: 'center',
    },
    dragHandle: { width: 28, alignItems: 'center' },
    dragHandleIcon: { fontSize: 18, color: c.label3, fontWeight: '600' },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    addRowBtn: { paddingVertical: 14 },
    addRowBtnText: { fontSize: 15, fontWeight: '600', color: c.primary },
    // Form view chrome — used when adding/editing a department.
    formBody: { paddingHorizontal: 16, paddingBottom: 24 },
    formFieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    formInput: {
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.label,
    },
    formSwatchGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    formSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    formSwatchSelected: {
      borderColor: c.label,
    },
    formIconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    formIconTile: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    formIconTileSelected: {
      borderColor: c.primary,
    },
    addRowInput: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      paddingVertical: 6,
      textAlign: 'center',
    },
    addPill: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPillText: { color: c.primaryOn, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  })
}
