/**
 * Grocery compose sheet — mirrors ComposeSheet (Add a Todo) in
 * structure: bottom-sheet modal with a multiline title input, a
 * grouped field card (Department + Store), and a primary action.
 *
 * Two bottom actions side-by-side:
 * - "Add" (left): save the item and close the sheet.
 * - "Add another" (right): save the item, clear the text, and keep
 *   the sheet open + the input focused so the user can fire off a
 *   string of items without re-opening the sheet each time. The
 *   current department + store carry over between adds.
 *
 * Inline sub-views (not nested modals) are used for the Department
 * and Store pickers — opening another <Modal> on top of this Modal
 * triggers iOS layering bugs.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
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
import { Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import {
  GroceryGroup,
  OTHERS_GROUP_ID,
  resolveGroup,
} from '../groceries'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import GroceryIcon from './GroceryIcon'

type SubView = 'main' | 'department' | 'store'

interface Props {
  visible: boolean
  groups: GroceryGroup[]
  stores: string[]
  /** Initial active store from the parent — used to seed the store
   * field when the sheet opens. */
  initialStore: string | undefined
  /** Initial active department from the parent — used to seed the
   * department field. Defaults to Uncategorized when undefined. */
  initialDepartmentId?: string
  onAdd: (args: { text: string; groupId: string; store: string | undefined }) => void
  onClose: () => void
}

export default function GroceryComposeSheet({
  visible,
  groups,
  stores,
  initialStore,
  initialDepartmentId,
  onAdd,
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const inputRef = useRef<TextInput>(null)

  const [subView, setSubView] = useState<SubView>('main')
  const [text, setText] = useState('')
  const [groupId, setGroupId] = useState<string>(
    initialDepartmentId ?? OTHERS_GROUP_ID,
  )
  const [store, setStore] = useState<string | undefined>(initialStore)

  // Reset on open so the next launch starts clean. Preserve the
  // current group + store so a serial-add flow ("Add another") keeps
  // the user's working context.
  useEffect(() => {
    if (visible) {
      setSubView('main')
      setText('')
      setGroupId(initialDepartmentId ?? OTHERS_GROUP_ID)
      setStore(initialStore)
      // Slight delay so the modal animation finishes before focusing.
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [visible, initialDepartmentId, initialStore])

  const activeGroup = resolveGroup(groupId, groups)
  const visibleGroups = useMemo(
    () => groups.filter((g) => !g.hidden),
    [groups],
  )

  function commit(): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd({ text: trimmed, groupId, store })
    return true
  }

  function handleAdd() {
    if (commit()) onClose()
  }

  function handleAddAnother() {
    if (commit()) {
      setText('')
      // Re-focus on the next frame so the keyboard stays up and the
      // user can keep typing without re-tapping.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const canSubmit = text.trim().length > 0

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />

            {subView === 'main' && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerSideBtn}>
                    <Text style={styles.cancelText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Add Item</Text>
                  <View style={styles.headerSideBtn} />
                </View>

                <View style={styles.body}>
                  <TextInput
                    ref={inputRef}
                    style={styles.textInput}
                    placeholder="Item"
                    placeholderTextColor={theme.gray3}
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={200}
                    textAlignVertical="top"
                    blurOnSubmit={false}
                    returnKeyType="done"
                    onSubmitEditing={handleAddAnother}
                  />

                  <View style={styles.fieldGroup}>
                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('department')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Department, ${activeGroup.label}. Tap to change.`}
                    >
                      <GroceryIcon
                        kind="department"
                        id={activeGroup.id}
                        customIcon={activeGroup.icon}
                        customColor={activeGroup.color}
                        size={18}
                      />
                      <Text style={styles.fieldLabel}>Department</Text>
                      <Text style={styles.fieldValue} numberOfLines={1}>
                        {activeGroup.label}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('store')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Store, ${store ?? 'any'}. Tap to change.`}
                    >
                      <GroceryIcon kind="store" id={store ?? '_'} size={18} />
                      <Text style={styles.fieldLabel}>Store</Text>
                      <Text
                        style={[styles.fieldValue, !store && styles.fieldValueMuted]}
                        numberOfLines={1}
                      >
                        {store ?? 'Any'}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.actionBtnSecondary,
                        !canSubmit && styles.actionBtnDisabled,
                      ]}
                      onPress={handleAdd}
                      disabled={!canSubmit}
                      accessibilityRole="button"
                      accessibilityLabel="Add this item and close"
                    >
                      <Text
                        style={[
                          styles.actionTextSecondary,
                          !canSubmit && styles.actionTextDisabled,
                        ]}
                      >
                        Add
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.actionBtnPrimary,
                        !canSubmit && styles.actionBtnDisabled,
                      ]}
                      onPress={handleAddAnother}
                      disabled={!canSubmit}
                      accessibilityRole="button"
                      accessibilityLabel="Add this item and keep adding"
                    >
                      <Text
                        style={[
                          styles.actionTextPrimary,
                          !canSubmit && styles.actionTextDisabled,
                        ]}
                      >
                        Add another
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            {subView === 'department' && (
              <SubViewList
                title="Department"
                onBack={() => setSubView('main')}
                styles={styles}
              >
                {visibleGroups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={styles.subRow}
                    onPress={() => {
                      setGroupId(g.id)
                      setSubView('main')
                    }}
                    activeOpacity={0.65}
                  >
                    <GroceryIcon
                      kind="department"
                      id={g.id}
                      customIcon={g.icon}
                      customColor={g.color}
                      size={20}
                    />
                    <Text style={styles.subRowLabel}>{g.label}</Text>
                    {groupId === g.id ? (
                      <Check size={18} color={theme.primary} strokeWidth={2.5} />
                    ) : (
                      <View style={styles.subRowCheckSpacer} />
                    )}
                  </TouchableOpacity>
                ))}
              </SubViewList>
            )}

            {subView === 'store' && (
              <SubViewList
                title="Store"
                onBack={() => setSubView('main')}
                styles={styles}
              >
                <TouchableOpacity
                  style={styles.subRow}
                  onPress={() => {
                    setStore(undefined)
                    setSubView('main')
                  }}
                  activeOpacity={0.65}
                >
                  <View style={{ width: 20 }} />
                  <Text style={styles.subRowLabel}>Any</Text>
                  {store === undefined ? (
                    <Check size={18} color={theme.primary} strokeWidth={2.5} />
                  ) : (
                    <View style={styles.subRowCheckSpacer} />
                  )}
                </TouchableOpacity>
                {stores.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={styles.subRow}
                    onPress={() => {
                      setStore(s)
                      setSubView('main')
                    }}
                    activeOpacity={0.65}
                  >
                    <GroceryIcon kind="store" id={s} size={20} />
                    <Text style={styles.subRowLabel}>{s}</Text>
                    {store === s ? (
                      <Check size={18} color={theme.primary} strokeWidth={2.5} />
                    ) : (
                      <View style={styles.subRowCheckSpacer} />
                    )}
                  </TouchableOpacity>
                ))}
              </SubViewList>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function SubViewList({
  title,
  onBack,
  children,
  styles,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.headerSideBtn}>
          <Text style={styles.cancelText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSideBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.subBody} keyboardShouldPersistTaps="handled">
        <View style={styles.fieldGroup}>{children}</View>
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
      paddingBottom: 24,
      maxHeight: '92%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginVertical: 6,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    headerSideBtn: { width: 64 },
    title: { fontSize: 17, fontWeight: '700', color: c.label, textAlign: 'center' },
    cancelText: { fontSize: 15, fontWeight: '500', color: c.primary },
    body: { paddingHorizontal: 16, paddingBottom: 12 },
    textInput: {
      minHeight: 80,
      fontSize: 18,
      color: c.label,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: c.card,
      borderRadius: 12,
      marginBottom: 14,
    },
    fieldGroup: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    fieldLabel: { fontSize: 15, color: c.label },
    fieldValue: {
      flex: 1,
      fontSize: 14,
      color: c.label3,
      textAlign: 'right',
    },
    fieldValueMuted: { fontStyle: 'italic' },
    chevron: { fontSize: 22, color: c.label3, lineHeight: 22 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 44,
    },
    actionRow: {
      marginTop: 20,
      flexDirection: 'row',
      gap: 10,
    },
    actionBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    actionBtnPrimary: { backgroundColor: c.primary },
    actionBtnSecondary: {
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    actionBtnDisabled: {
      backgroundColor: c.card,
      borderColor: c.border,
    },
    actionTextPrimary: {
      color: c.primaryOn,
      fontSize: 16,
      fontWeight: '700',
    },
    actionTextSecondary: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    actionTextDisabled: { color: c.gray3 },
    subBody: { paddingHorizontal: 16, paddingBottom: 24 },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    subRowLabel: { flex: 1, fontSize: 16, color: c.label, fontWeight: '500' },
    subRowCheckSpacer: { width: 18 },
  })
}
