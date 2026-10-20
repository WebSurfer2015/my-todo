/**
 * Edit sheet for a single grocery item. Opens from a tap on the row
 * text (not the checkbox — that toggles checked). Fields: text, group,
 * store. Includes the manual-only Delete button at the bottom; deletion
 * is the only path to permanent removal.
 *
 * Autosaves like the to-do details sheet: a department / store tap saves at
 * once, the name saves when the field is left (a blanked name keeps the old
 * one). Close (header, backdrop or swipe) shows a calm "Changes saved · Undo"
 * when anything changed; Undo puts the item's name / department / stores back
 * exactly as they were when the sheet opened. Delete prompts a confirm Alert.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react'
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
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from '../../app/theme'
import SheetShell from '../../ui/SheetShell'
import { useNotify } from '../../app/notify'
import {
  type GroceryEditFields,
  groceryEditChanged,
  groceryEditSnapshot,
  groceryEditText,
  groceryEditToggleStore,
} from './groceryEditSession'

interface Props {
  visible: boolean
  item: GroceryItem | null
  groups: GroceryGroup[]
  /** Configured store list (from profile.groceryStores ?? seeds). The
   * store field is a picker rather than a text input — letting users
   * type freely encourages typos that hide items behind store
   * filters. No stores selected = the item shows under any store. */
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
  const { showSnackbar } = useNotify()
  // The item as it was when this sheet opened — the Undo target. Seeded once
  // per open (keyed by id): every autosave hands back a new `item` object,
  // which must not re-seed the fields mid-edit.
  const openedRef = useRef<{ id: string; before: GroceryEditFields } | null>(null)

  useEffect(() => {
    if (!visible || !item) {
      if (!visible) openedRef.current = null
      return
    }
    if (openedRef.current?.id === item.id) return
    openedRef.current = { id: item.id, before: groceryEditSnapshot(item) }
    setText(item.text)
    setGroupId(item.groupId)
    setStoresList(item.stores)
  }, [visible, item])

  function pickGroup(id: string) {
    if (!item || id === groupId) return
    setGroupId(id)
    onSave(item.id, { groupId: id })
  }

  function toggleStore(name: string) {
    if (!item) return
    const next = groceryEditToggleStore(storesList, name)
    setStoresList(next)
    onSave(item.id, { stores: next })
  }

  // Leaving the name field saves it; a blanked name keeps the old one (and
  // the field shows it again).
  function commitText() {
    if (!item) return
    const finalText = groceryEditText(text, item.text)
    if (finalText !== text) setText(finalText)
    if (finalText !== item.text) onSave(item.id, { text: finalText })
  }

  // Header Close, backdrop and swipe all land here.
  function handleClose() {
    const opened = openedRef.current
    if (item && opened) {
      const after: GroceryEditFields = {
        text: groceryEditText(text, item.text),
        groupId,
        stores: storesList,
      }
      if (after.text !== item.text) onSave(item.id, { text: after.text })
      if (groceryEditChanged(opened.before, after)) {
        const { id, before } = opened
        showSnackbar({
          message: t.changesSaved,
          actionLabel: t.undo,
          onAction: () => onSave(id, before),
        })
      }
    }
    openedRef.current = null
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
            openedRef.current = null
            onClose()
          },
        },
      ],
    )
  }


  return (
    <SheetShell
      visible={visible && !!item}
      onClose={handleClose}
      title="Edit item"
      left={null}
      primary={{ label: 'Close', onPress: handleClose }}
    >
      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>ITEM</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Milk"
            placeholderTextColor={theme.label2}
            maxLength={200}
            returnKeyType="done"
            onEndEditing={commitText}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>DEPARTMENT</Text>
          <View style={styles.storeChipRow}>
            {groups
              .filter((g) => !g.hidden || g.id === groupId)
              .map((g) => {
                const on = g.id === groupId
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => pickGroup(g.id)}
                    style={[styles.storeChip, on && styles.storeChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${g.label}, department`}
                  >
                    <Text style={[styles.storeChipText, on && styles.storeChipTextOn]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>STORES</Text>
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
                    accessibilityLabel={s}
                    accessibilityHint={on ? 'Removes this store' : 'Adds this store'}
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
        Deleting can&apos;t be undone. Checked items rest in Bought recently —
        tap one to add it back.
      </Text>
    </SheetShell>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: RADIUS.card,
      backgroundColor: c.card,
      overflow: 'hidden',
      marginTop: SPACING.sm,
    },
    field: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
    fieldLabel: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: SPACING.sm,
    },
    input: {
      fontSize: TYPE.body,
      color: c.label,
      paddingVertical: SPACING.xs,
    },
    rowValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    rowValue: { fontSize: TYPE.body, color: c.label, flex: 1 },
    rowValueMuted: { color: c.label3, fontStyle: 'italic' },
    rowChevron: { fontSize: TYPE.h2, color: c.label3, lineHeight: 22 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: SPACING.lg,
    },
    deleteRow: {
      marginTop: SPACING.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.control,
      backgroundColor: c.card,
      alignItems: 'flex-start',
    },
    deleteText: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.red,
    },
    deleteHint: {
      fontSize: TYPE.caption,
      color: c.label3,
      paddingHorizontal: SPACING.sm,
      marginTop: SPACING.sm,
      lineHeight: 16,
    },
    storeChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    storeChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    storeChipOn: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    storeChipText: {
      fontSize: TYPE.footnote,
      fontWeight: '500',
      color: c.label,
    },
    storeChipTextOn: { color: c.primaryOn },
  })
}
