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

import React, { useMemo, useState } from 'react'
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
import GroceryIcon from './GroceryIcon'
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
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [editing, setEditing] = useState(false)
  const [inlineName, setInlineName] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState('')
  const [newName, setNewName] = useState('')

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
    const updated = [...groups]
    updated[i] = { ...g, hidden: !g.hidden }
    commitGroups(updated)
  }

  function deleteDept(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return
    Alert.alert(
      'Delete department',
      `Delete "${g.label}"? Items in this department will fall back to Uncategorized.`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => commitGroups(groups.filter((x) => x.id !== g.id)),
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
    let anyStoreActive = 0
    const tagged = new Map<string, number>()
    for (const it of items) {
      if (it.checked) continue
      if (!it.store) anyStoreActive += 1
      else tagged.set(it.store, (tagged.get(it.store) ?? 0) + 1)
    }
    const m = new Map<string, number>()
    for (const s of stores) {
      m.set(s, (tagged.get(s) ?? 0) + anyStoreActive)
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
            style={styles.sheet}
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
                onPress={() => {
                  // In Manage mode, Cancel exits the edit affordances
                  // without dismissing the sheet so the user can keep
                  // picking a filter; outside Manage, Cancel closes.
                  if (editing) setEditing(false)
                  else onClose()
                }}
                hitSlop={10}
                style={styles.titleSideBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Select Filter</Text>
              <TouchableOpacity
                onPress={() => setEditing((v) => !v)}
                hitSlop={10}
                style={styles.titleSideBtn}
              >
                <Text style={styles.manageText}>
                  {editing ? t.done : 'Manage'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {/* STORES section header. Mirrors the DEPARTMENTS header
                  below so the two sections read as siblings. */}
              {!editing && <Text style={styles.sectionHeader}>STORES</Text>}

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
                    onDragEnd={({ data }) => onReorder(data)}
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
                {editing && (
                  <View style={styles.addRow}>
                    <TextInput
                      style={styles.addRowInput}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="+ Add store"
                      placeholderTextColor={theme.primary}
                      maxLength={MAX_GROCERY_STORE_LEN}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        onAdd(newName)
                        setNewName('')
                      }}
                    />
                    {newName.trim() && (
                      <TouchableOpacity
                        onPress={() => {
                          onAdd(newName)
                          setNewName('')
                        }}
                        style={styles.addPill}
                      >
                        <Text style={styles.addPillText}>+</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* DEPARTMENTS */}
              <Text style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>DEPARTMENTS</Text>
              <View style={styles.card}>
                {/* "Any" — pick mode only. Mirrors the stores section
                    so the user has a clear "drop the dept narrowing"
                    row without having to remember the tap-active-to-
                    clear gesture. */}
                {!editing && (
                  <TouchableOpacity
                    style={styles.viewRow}
                    onPress={() => {
                      onSelectDept(undefined)
                      onClose()
                    }}
                    activeOpacity={0.65}
                    accessibilityRole="button"
                    accessibilityLabel="Any department"
                  >
                    <View style={styles.deptIconSpacer} />
                    <Text style={styles.viewRowLabel}>Any</Text>
                    <Text style={styles.viewRowCount}>
                      {items.filter((it) => !it.checked).length}
                    </Text>
                    {activeDept === undefined ? (
                      <Check size={18} color={theme.primary} strokeWidth={2.5} />
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </TouchableOpacity>
                )}
                {editing ? (
                  <>
                    <DraggableFlatList
                      data={draggableDepts}
                      keyExtractor={(g) => `dept-${g.id}`}
                      scrollEnabled={false}
                      activationDistance={20}
                      onDragEnd={({ data }) => commitGroups(data)}
                      renderItem={({
                        item: g,
                        drag,
                        isActive,
                      }: RenderItemParams<GroceryGroup>) => {
                        return (
                          <View style={[styles.editRow, isActive && styles.editRowActive]}>
                            <GroceryIcon
                              kind="department"
                              id={g.id}
                              customIcon={g.icon}
                              customColor={g.color}
                              size={18}
                              color={g.hidden ? theme.label3 : undefined}
                            />
                            <TouchableOpacity
                              style={styles.editRowLabelTap}
                              onPress={() => openEditDept(g)}
                              activeOpacity={0.6}
                              accessibilityLabel={`Edit ${g.label}`}
                            >
                              <View style={styles.editRowLabelInner}>
                                <Text
                                  style={[
                                    styles.editRowLabel,
                                    g.hidden && styles.editRowLabelHidden,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {g.label}
                                </Text>
                                <Pencil size={11} color={theme.label3} strokeWidth={2} />
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => toggleDeptHidden(g)}
                              hitSlop={6}
                              style={styles.rowAction}
                              accessibilityRole="switch"
                              accessibilityState={{ checked: !g.hidden }}
                            >
                              {g.hidden ? (
                                <EyeOff size={16} color={theme.label3} strokeWidth={2} />
                              ) : (
                                <Eye size={16} color={theme.label2} strokeWidth={2} />
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => deleteDept(g)}
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
                            >
                              <Text style={styles.dragHandleIcon}>≡</Text>
                            </TouchableOpacity>
                          </View>
                        )
                      }}
                    />
                    {othersDept && (
                      <View style={[styles.editRow, { opacity: 0.8 }]}>
                        <GroceryIcon kind="department" id={othersDept.id} size={18} />
                        <Text style={styles.editRowLabel} numberOfLines={1}>
                          {othersDept.label}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.label3, fontStyle: 'italic' }}>
                          locked
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.addRow, styles.addRowBtn]}
                      onPress={openAddDept}
                      accessibilityRole="button"
                      accessibilityLabel="Add a department"
                    >
                      <Text style={styles.addRowBtnText}>+ Add department</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  visibleDepts.map((g) => {
                    const selected = activeDept === g.id
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={styles.viewRow}
                        activeOpacity={0.65}
                        onPress={() => {
                          // Tapping the already-active dept clears the
                          // filter; otherwise switch to that dept.
                          onSelectDept(selected ? undefined : g.id)
                          onClose()
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Filter by ${g.label}, ${deptCounts.get(g.id) ?? 0} items${selected ? ', currently active. Tap to clear.' : ''}`}
                      >
                        <GroceryIcon
                          kind="department"
                          id={g.id}
                          customIcon={g.icon}
                          customColor={g.color}
                          size={18}
                          color={g.hidden ? theme.label3 : undefined}
                        />
                        <Text
                          style={[
                            styles.viewRowLabel,
                            g.hidden && styles.editRowLabelHidden,
                          ]}
                          numberOfLines={1}
                        >
                          {g.label}
                        </Text>
                        <Text style={styles.viewRowCount}>
                          {deptCounts.get(g.id) ?? 0}
                        </Text>
                        {selected ? (
                          <Check size={18} color={theme.primary} strokeWidth={2.5} />
                        ) : (
                          <View style={styles.checkPlaceholder} />
                        )}
                      </TouchableOpacity>
                    )
                  })
                )}
              </View>
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
    title: { fontSize: 17, fontWeight: '700', color: c.label, textAlign: 'center' },
    manageText: { fontSize: 15, fontWeight: '600', color: c.primary, textAlign: 'right' },
    cancelText: { fontSize: 15, fontWeight: '500', color: c.primary, textAlign: 'left' },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },
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
