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
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from '../../app/theme'
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
    // If the name was blanked, keep the original item name rather than
    // discarding the user's department / store edits. A grocery item
    // can't be nameless, so we fall back to what it was called before.
    const trimmed = text.trim()
    const finalText = trimmed || item.text
    onSave(item.id, {
      text: finalText,
      groupId,
      stores: storesList,
    })
    onClose()
  }

  // Backdrop / swipe dismiss: auto-save edits to this existing item (calm,
  // forgiving) instead of silently dropping the changed department /
  // stores. If the name was blanked, fall back to the original name so a
  // cleared field never loses the other edits.
  function handleDismiss() {
    if (item) {
      const finalText = text.trim() || item.text
      onSave(item.id, { text: finalText, groupId, stores: storesList })
    }
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
      onClose={handleDismiss}
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
            placeholderTextColor={theme.label2}
            maxLength={200}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Department</Text>
          <View style={styles.storeChipRow}>
            {groups
              .filter((g) => !g.hidden || g.id === groupId)
              .map((g) => {
                const on = g.id === groupId
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setGroupId(g.id)}
                    style={[styles.storeChip, on && styles.storeChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Department: ${g.label}`}
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
        Deleting can&apos;t be undone. Checked items rest in Saved — tap one to
        add it back.
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
