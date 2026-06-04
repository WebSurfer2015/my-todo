/**
 * Bottom-sheet department picker for the grocery view. Two modes:
 *
 * - Pick (default): each visible department row with themed icon + label +
 *   active-checkmark. Tap to select + close.
 * - Manage: each row gets rename-inline, eye-toggle hide, delete, and a
 *   drag-handle. Uncategorized (OTHERS_GROUP_ID) is pinned at the end as
 *   a locked footer — renamable but never hide/delete/reorder. + Add
 *   department row at the bottom of the draggable list.
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
  GroceryGroup,
  OTHERS_GROUP_ID,
  newGroceryGroup,
  MAX_GROCERY_GROUPS,
  MAX_GROCERY_GROUP_LABEL_LEN,
} from '../../core-bindings/groceries'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'
import GroceryIcon from './GroceryIcon'

interface Props {
  visible: boolean
  groups: GroceryGroup[]
  selectedId: string
  onSelect: (id: string) => void
  onSetGroups: (next: GroceryGroup[]) => void
  onClose: () => void
}

export default function DepartmentPicker({
  visible,
  groups,
  selectedId,
  onSelect,
  onSetGroups,
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [editing, setEditing] = useState(false)
  const [inlineId, setInlineId] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const visibleGroups = editing ? groups : groups.filter((g) => !g.hidden)
  const draggable = groups.filter((g) => g.id !== OTHERS_GROUP_ID)
  const others = groups.find((g) => g.id === OTHERS_GROUP_ID)

  function commit(next: GroceryGroup[]) {
    const o = next.find((g) => g.id === OTHERS_GROUP_ID)
    const rest = next.filter((g) => g.id !== OTHERS_GROUP_ID)
    onSetGroups(o ? [...rest, o] : rest)
  }

  function renameAt(id: string, label: string) {
    const i = groups.findIndex((g) => g.id === id)
    if (i < 0) return
    const next = [...groups]
    next[i] = { ...next[i], label: label.slice(0, MAX_GROCERY_GROUP_LABEL_LEN) }
    commit(next)
  }

  function commitRename(g: GroceryGroup) {
    const next = inlineDraft.trim()
    if (next && next !== g.label) renameAt(g.id, next)
    setInlineId(null)
  }

  function toggleHide(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return
    const i = groups.findIndex((x) => x.id === g.id)
    if (i < 0) return
    const next = [...groups]
    next[i] = { ...g, hidden: !g.hidden }
    commit(next)
  }

  function deleteGroup(g: GroceryGroup) {
    if (g.id === OTHERS_GROUP_ID) return
    Alert.alert(
      'Delete department',
      `Delete "${g.label}"? Items in this department will fall back to Uncategorized.`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => commit(groups.filter((x) => x.id !== g.id)),
        },
      ],
    )
  }

  function addGroup() {
    const label = newLabel.trim()
    if (!label) return
    if (groups.length >= MAX_GROCERY_GROUPS) return
    const fresh = newGroceryGroup(label)
    const idx = groups.findIndex((g) => g.id === OTHERS_GROUP_ID)
    const next = [...groups]
    if (idx >= 0) next.splice(idx, 0, fresh)
    else next.push(fresh)
    commit(next)
    setNewLabel('')
  }

  function pickDept(id: string) {
    onSelect(id)
    onClose()
  }

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
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <View style={styles.titleSideBtn} />
              <Text style={styles.title}>Select a Department</Text>
              <TouchableOpacity
                onPress={() => setEditing((v) => !v)}
                hitSlop={10}
                style={styles.titleSideBtn}
              >
                <Text style={styles.manageText}>{editing ? t.done : 'Manage'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <View style={styles.card}>
                {editing ? (
                  <>
                    <DraggableFlatList
                      data={draggable}
                      keyExtractor={(g) => `dept-${g.id}`}
                      scrollEnabled={false}
                      activationDistance={20}
                      onDragEnd={({ data }) => commit(data)}
                      renderItem={({
                        item: g,
                        drag,
                        isActive,
                      }: RenderItemParams<GroceryGroup>) => {
                        const isInline = inlineId === g.id
                        return (
                          <View style={[styles.editRow, isActive && styles.editRowActive]}>
                            <GroceryIcon
                              kind="department"
                              id={g.id}
                              size={18}
                              color={g.hidden ? theme.label3 : undefined}
                            />
                            {isInline ? (
                              <TextInput
                                style={[styles.editRowLabel, styles.inlineInput]}
                                value={inlineDraft}
                                onChangeText={setInlineDraft}
                                autoFocus
                                selectTextOnFocus
                                onBlur={() => commitRename(g)}
                                onSubmitEditing={() => commitRename(g)}
                                returnKeyType="done"
                                maxLength={MAX_GROCERY_GROUP_LABEL_LEN}
                              />
                            ) : (
                              <TouchableOpacity
                                style={styles.editRowLabelTap}
                                onPress={() => {
                                  setInlineId(g.id)
                                  setInlineDraft(g.label)
                                }}
                                activeOpacity={0.6}
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
                            )}
                            <TouchableOpacity
                              onPress={() => toggleHide(g)}
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
                              onPress={() => deleteGroup(g)}
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
                    {others && (
                      <View style={[styles.editRow, styles.editRowLocked]}>
                        <GroceryIcon kind="department" id={others.id} size={18} />
                        {inlineId === others.id ? (
                          <TextInput
                            style={[styles.editRowLabel, styles.inlineInput]}
                            value={inlineDraft}
                            onChangeText={setInlineDraft}
                            autoFocus
                            selectTextOnFocus
                            onBlur={() => commitRename(others)}
                            onSubmitEditing={() => commitRename(others)}
                            returnKeyType="done"
                            maxLength={MAX_GROCERY_GROUP_LABEL_LEN}
                          />
                        ) : (
                          <TouchableOpacity
                            style={styles.editRowLabelTap}
                            onPress={() => {
                              setInlineId(others.id)
                              setInlineDraft(others.label)
                            }}
                          >
                            <View style={styles.editRowLabelInner}>
                              <Text style={styles.editRowLabel} numberOfLines={1}>
                                {others.label}
                              </Text>
                              <Pencil size={11} color={theme.label3} strokeWidth={2} />
                            </View>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.lockedHint}>locked</Text>
                      </View>
                    )}
                    <View style={styles.addRow}>
                      <TextInput
                        style={styles.addRowInput}
                        value={newLabel}
                        onChangeText={setNewLabel}
                        placeholder="+ Add department"
                        placeholderTextColor={theme.primary}
                        maxLength={MAX_GROCERY_GROUP_LABEL_LEN}
                        returnKeyType="done"
                        onSubmitEditing={addGroup}
                      />
                      {newLabel.trim() && (
                        <TouchableOpacity onPress={addGroup} style={styles.addPill}>
                          <Text style={styles.addPillText}>+</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                ) : (
                  visibleGroups.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={styles.viewRow}
                      onPress={() => pickDept(g.id)}
                      activeOpacity={0.65}
                    >
                      <GroceryIcon kind="department" id={g.id} size={20} />
                      <Text style={styles.viewRowLabel}>{g.label}</Text>
                      {selectedId === g.id ? (
                        <Check size={18} color={theme.primary} strokeWidth={2.5} />
                      ) : (
                        <View style={styles.checkPlaceholder} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
    scroll: { flexShrink: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    viewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    viewRowLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: c.label },
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
    editRowLocked: { opacity: 0.8 },
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
    lockedHint: { fontSize: 12, color: c.label3, fontStyle: 'italic' },
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
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    addRowInput: { flex: 1, fontSize: 15, color: c.label, paddingVertical: 6 },
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
