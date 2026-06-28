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
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { GroceryItem, GroceryGroup } from '../../core-bindings/groceries'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'
import SheetShell from '../../ui/SheetShell'

interface Props {
  visible: boolean
  item: GroceryItem | null
  groups: GroceryGroup[]
  /** Configured store list (from profile.groceryStores ?? seeds). The
   * store field is a picker rather than a text input — letting users
   * type freely encourages typos that hide items behind store
   * filters. Plus "Any store" as an explicit clear option. */
  stores: string[]
  onSave: (id: string, patch: { text?: string; groupId?: string; stores?: string[] }) => void
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
  const [storesList, setStoresList] = useState<string[]>([])

  // Re-seed local state every time a new item opens.
  useEffect(() => {
    if (visible && item) {
      setText(item.text)
      setGroupId(item.groupId)
      setStoresList(item.stores)
    }
  }, [visible, item])

  function toggleStore(name: string) {
    setStoresList((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    )
  }

  function handleSave() {
    if (!item) return
    const trimmed = text.trim()
    if (!trimmed) return
    onSave(item.id, {
      text: trimmed,
      groupId,
      stores: storesList,
    })
    onClose()
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


  return (
    <SheetShell
      visible={visible && !!item}
      onClose={onClose}
      title="Edit item"
      primary={{ label: t.save, onPress: handleSave, disabled: !text.trim() }}
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
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Stores</Text>
          {stores.length === 0 ? (
            <Text style={[styles.rowValue, styles.rowValueMuted]}>
              No stores configured
            </Text>
          ) : (
            <View style={styles.storeChipRow}>
              {stores.map((s) => {
                const on = storesList.includes(s)
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => toggleStore(s)}
                    style={[styles.storeChip, on && styles.storeChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${on ? 'Remove' : 'Add'} ${s}`}
                  >
                    <Text style={[styles.storeChipText, on && styles.storeChipTextOn]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>
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
        Deletion is permanent. Checked items live in Future and can always be
        added back from there.
      </Text>
    </SheetShell>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      backgroundColor: c.card,
      overflow: 'hidden',
      marginTop: 8,
    },
    field: { paddingVertical: 12, paddingHorizontal: 16 },
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
      marginTop: 18,
      paddingVertical: 12,
      paddingHorizontal: 16,
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
      paddingHorizontal: 6,
      marginTop: 8,
      lineHeight: 16,
    },
    storeChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    storeChip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    storeChipOn: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    storeChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.label,
    },
    storeChipTextOn: { color: c.primaryOn },
  })
}
