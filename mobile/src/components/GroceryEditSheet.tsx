/**
 * Edit sheet for a single grocery item. Opens from a tap on the row
 * text (not the checkbox — that toggles checked). Fields: text, group,
 * store. Includes the manual-only Delete button at the bottom; deletion
 * is the only path to permanent removal.
 *
 * Save fires on tap of the Save header button. Delete prompts a
 * confirm Alert before destroying.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  ActionSheetIOS,
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
import { GroceryItem, GroceryGroup, resolveGroup } from '../groceries'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import GroceryIcon from './GroceryIcon'

interface Props {
  visible: boolean
  item: GroceryItem | null
  groups: GroceryGroup[]
  /** Configured store list (from profile.groceryStores ?? seeds). The
   * store field is a picker rather than a text input — letting users
   * type freely encourages typos that hide items behind store
   * filters. Plus "Any store" as an explicit clear option. */
  stores: string[]
  onSave: (id: string, patch: { text?: string; groupId?: string; store?: string | null }) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function GroceryEditSheet({
  visible,
  item,
  groups,
  stores,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [text, setText] = useState('')
  const [groupId, setGroupId] = useState<string>('')
  const [store, setStore] = useState('')

  // Re-seed local state every time a new item opens.
  useEffect(() => {
    if (visible && item) {
      setText(item.text)
      setGroupId(item.groupId)
      setStore(item.store ?? '')
    }
  }, [visible, item])

  const visibleGroups = useMemo(
    () => groups.filter((g) => !g.hidden),
    [groups],
  )

  function handleSave() {
    if (!item) return
    const trimmed = text.trim()
    if (!trimmed) return
    onSave(item.id, {
      text: trimmed,
      groupId,
      store: store.trim() ? store.trim() : null,
    })
    onClose()
  }

  function openGroupPicker() {
    const options = [
      ...visibleGroups.map((g) => `${g.label}${g.id === groupId ? ' ✓' : ''}`),
      t.cancel,
    ]
    const cancelIndex = options.length - 1
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: 'Department' },
        (i) => {
          if (i >= 0 && i < cancelIndex) setGroupId(visibleGroups[i].id)
        },
      )
    } else {
      Alert.alert('Department', undefined, [
        ...visibleGroups.map((g) => ({
          text: g.label,
          onPress: () => setGroupId(g.id),
        })),
        { text: t.cancel, style: 'cancel' as const },
      ])
    }
  }

  function openStorePicker() {
    // "Any" clears the store assignment (item.store = null); each
    // configured store sets it. Free-text was error-prone — typos
    // produced ghost stores that hid items under the filter.
    const ANY = 'Any store'
    const options = [
      `${ANY}${store === '' ? ' ✓' : ''}`,
      ...stores.map((s) => `${s}${s === store ? ' ✓' : ''}`),
      t.cancel,
    ]
    const cancelIndex = options.length - 1
    function pick(i: number) {
      if (i === 0) setStore('')
      else if (i > 0 && i < cancelIndex) setStore(stores[i - 1])
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: 'Store' },
        pick,
      )
    } else {
      Alert.alert('Store', undefined, [
        { text: ANY, onPress: () => setStore('') },
        ...stores.map((s) => ({ text: s, onPress: () => setStore(s) })),
        { text: t.cancel, style: 'cancel' as const },
      ])
    }
  }

  function handleDelete() {
    if (!item) return
    Alert.alert(
      'Delete item',
      `Delete "${item.text}"? This is permanent.`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(item.id)
            onClose()
          },
        },
      ],
    )
  }

  const resolvedGroup = item ? resolveGroup(groupId, groups) : null

  return (
    <Modal
      visible={visible && !!item}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.titleSideBtn}>
                <Text style={styles.cancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Edit item</Text>
              <TouchableOpacity
                onPress={handleSave}
                hitSlop={10}
                style={styles.titleSideBtn}
                disabled={!text.trim()}
              >
                <Text style={[styles.saveText, !text.trim() && styles.saveTextDisabled]}>
                  {t.save}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Item</Text>
                  <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={setText}
                    placeholder="Milk"
                    placeholderTextColor={theme.gray3}
                    autoFocus
                    maxLength={200}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                </View>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.field}
                  onPress={openGroupPicker}
                  accessibilityRole="button"
                  accessibilityLabel={`Department: ${resolvedGroup?.label ?? ''}. Tap to change.`}
                >
                  <Text style={styles.fieldLabel}>Department</Text>
                  <View style={styles.rowValueWrap}>
                    {resolvedGroup && (
                      <GroceryIcon
                        kind="department"
                        id={resolvedGroup.id}
                        size={16}
                      />
                    )}
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {resolvedGroup?.label ?? ''}
                    </Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.field}
                  onPress={openStorePicker}
                  accessibilityRole="button"
                  accessibilityLabel={`Store: ${store || 'Any store'}. Tap to change.`}
                >
                  <Text style={styles.fieldLabel}>Store</Text>
                  <View style={styles.rowValueWrap}>
                    {store ? (
                      <GroceryIcon kind="store" id={store} size={16} />
                    ) : null}
                    <Text
                      style={[
                        styles.rowValue,
                        !store && styles.rowValueMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {store || 'Any store'}
                    </Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.deleteRow}
                onPress={handleDelete}
                accessibilityRole="button"
                accessibilityLabel="Delete item"
              >
                <Text style={styles.deleteText}>Delete item</Text>
              </TouchableOpacity>
              <Text style={styles.deleteHint}>
                Deletion is permanent. Checked items live in Future and can
                always be added back from there.
              </Text>

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
      maxHeight: '90%',
      paddingTop: 6,
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
    cancelText: { fontSize: 15, color: c.blue, fontWeight: '500' },
    saveText: { fontSize: 15, color: c.blue, fontWeight: '700', textAlign: 'right' },
    saveTextDisabled: { color: c.gray3 },
    scroll: { paddingBottom: 24 },
    card: {
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.card,
      overflow: 'hidden',
      marginTop: 8,
    },
    field: { paddingVertical: 12, paddingHorizontal: 14 },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: 6,
    },
    input: {
      fontSize: 15,
      color: c.label,
      paddingVertical: 4,
    },
    rowValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rowValue: { fontSize: 15, color: c.label, flex: 1 },
    rowValueMuted: { color: c.label3, fontStyle: 'italic' },
    rowChevron: { fontSize: 22, color: c.label3, lineHeight: 22 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 14,
    },
    deleteRow: {
      marginHorizontal: 16,
      marginTop: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: 'flex-start',
    },
    deleteText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.red,
    },
    deleteHint: {
      fontSize: 12,
      color: c.label3,
      paddingHorizontal: 22,
      marginTop: 8,
      lineHeight: 16,
    },
  })
}
