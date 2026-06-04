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
import { Alert } from 'react-native'
import { Check, Plus, Store as StoreIcon } from 'lucide-react-native'
import MochiThinking from '../mochi/MochiThinking'
import * as Haptics from 'expo-haptics'
import {
  GroceryGroup,
  GroceryItem,
  OTHERS_GROUP_ID,
  resolveGroup,
  inferGroceryGroupLocal,
} from '../../core-bindings/groceries'
import { classifyGroceryDept } from '../../adapters/aiInfer'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'
import GroceryIcon from './GroceryIcon'

type SubView = 'main' | 'department' | 'store'

interface Props {
  visible: boolean
  groups: GroceryGroup[]
  stores: string[]
  /** Live list of every grocery item the user owns. Powers the
   * "same name → reuse linked stores" autofill. Trashed/checked items
   * still count — re-adding a fruit they bought last week should still
   * pre-tag the stores it was last linked to. */
  existingItems: GroceryItem[]
  /** Initial active store from the parent — used to seed the store
   * field when the sheet opens. */
  initialStore: string | undefined
  /** Initial active department from the parent — used to seed the
   * department field. Defaults to Uncategorized when undefined. */
  initialDepartmentId?: string
  onAdd: (args: { text: string; groupId: string; stores: string[] }) => void
  /** Creates a new store name in the user's profile. Tapped from the
   * "+ Create '<name>'" row in the Store sub-view after the user
   * confirms via an Alert. The store is also selected for this add. */
  onCreateStore?: (name: string) => void
  /** Open the Manage Store sheet — surfaced from the "Add stores first"
   * nudge when the user has no stores configured. Parent does the
   * Compose-close + sheet-open handoff (iOS dislikes stacked modals). */
  onOpenManageStore?: () => void
  /** Creates a new grocery dept from a label, returning the new id.
   * Tapped from the "+ Create '<label>'" dept pill after the user
   * confirms via Alert. Optional — when omitted the dept-create pill
   * is hidden and AI-proposed new dept names are ignored client-side. */
  onCreateGroup?: (label: string) => string | undefined
  /** When true, the sheet runs live AI inference on text-change in
   * addition to the always-on local heuristic. Mirrors the todo
   * compose flow. Off → no AI calls, just local. */
  agentEnabled?: boolean
  onClose: () => void
}

export default function GroceryComposeSheet({
  visible,
  groups,
  stores,
  existingItems,
  initialStore,
  initialDepartmentId,
  onAdd,
  onCreateStore,
  onOpenManageStore,
  onCreateGroup,
  agentEnabled = false,
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
  // Multi-store picks for this item. Always starts empty — chips
  // fill in only via (a) existing-item match for repeat adds,
  // (b) AI store recommendations for new items, or (c) the user
  // manually tapping a chip. The active-store filter is NOT used to
  // seed picks anymore: by request, a brand-new item that doesn't
  // match anything should start with zero chips selected so the
  // user is asked to pick.
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  function toggleSelectedStore(name: string) {
    userPickedStoreRef.current = true
    setSelectedStores((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    )
  }
  // Flips true once the user opens the dept picker, signaling they
  // intend to choose the dept themselves — we stop auto-inferring
  // from the text after that. Reset on each open of the sheet.
  const userPickedDeptRef = useRef(false)
  // Same idea for the store field: once the user picks one manually,
  // stop overriding it from AI/text inference.
  const userPickedStoreRef = useRef(false)
  // AI-only suggestion surfaced as a pill above the field group.
  // Today only used for NEW store proposals — new dept proposals are
  // auto-created silently since the dept row is hidden in the UI.
  const [newStoreProposal, setNewStoreProposal] = useState<string | null>(null)
  // True while a classify-grocery-dept call is in flight. Drives the
  // "Mochi is working…" status text in the input-accessory row so the
  // user knows why chips/dept might shift a moment after they finish
  // typing. Reset whenever the call settles, the sheet closes, or
  // the text falls below AI_MIN_CHARS.
  const [aiBusy, setAiBusy] = useState(false)
  // Search/create text for the Store sub-view. Drives both the
  // filter and the conditional "+ Create '<name>'" row at the
  // bottom of the list. Cleared whenever we leave the sub-view.
  const [storeSearch, setStoreSearch] = useState('')

  // Reset on open so the next launch starts clean. Preserve the
  // current group + store so a serial-add flow ("Add another") keeps
  // the user's working context.
  useEffect(() => {
    if (visible) {
      setSubView('main')
      setText('')
      setGroupId(initialDepartmentId ?? OTHERS_GROUP_ID)
      setSelectedStores([])
      userPickedDeptRef.current = false
      userPickedStoreRef.current = false
      setNewStoreProposal(null)
      setAiBusy(false)
      setStoreSearch('')
      // Slight delay so the modal animation finishes before focusing.
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [visible, initialDepartmentId, initialStore])

  // Clear the store search whenever we leave the store sub-view, so
  // the next open starts at the full list rather than a stale filter.
  useEffect(() => {
    if (subView !== 'store') setStoreSearch('')
  }, [subView])

  // Auto-focus the store search input when the sub-view opens so the
  // affordance is immediately obvious. Without this, users may not
  // notice the inline search/create input above the list.
  const storeSearchRef = useRef<TextInput>(null)
  useEffect(() => {
    if (subView === 'store') {
      const t2 = setTimeout(() => storeSearchRef.current?.focus(), 150)
      return () => clearTimeout(t2)
    }
  }, [subView])

  // Live local dept inference while typing — mirrors the local
  // heuristic that runs at add-time in useTodoStore.addGrocery, but
  // surfaces the result in the Department row of the compose sheet
  // BEFORE the user taps Add. So "Eggs" flips Department from
  // Uncategorized to Dairy as soon as the heuristic matches, giving
  // visible AI feedback. Skipped once the user picks a dept manually.
  useEffect(() => {
    if (userPickedDeptRef.current) return
    const trimmed = text.trim()
    if (trimmed.length < 2) {
      // Too short — reset to the initial / default. Lets the user
      // clear the field and re-type without the dept being sticky.
      setGroupId(initialDepartmentId ?? OTHERS_GROUP_ID)
      return
    }
    const local = inferGroceryGroupLocal(trimmed, groups)
    if (local && groups.some((g) => g.id === local)) {
      setGroupId(local)
    } else {
      setGroupId(initialDepartmentId ?? OTHERS_GROUP_ID)
    }
  }, [text, groups, initialDepartmentId])

  // Existing-item store autofill. When the typed text matches an item
  // already in the user's list (case-insensitive exact match), seed
  // selectedStores from the union of stores those items are linked
  // to. Re-adding "Toilet paper" → checks the same store chips the
  // user picked last time. Free + immediate (no AI roundtrip). Skips
  // once the user has manually toggled a store chip, so we don't
  // fight their choice. Only applies the union; never clears picks
  // the user already had (e.g. seeded from the active store filter).
  useEffect(() => {
    if (userPickedStoreRef.current) return
    const trimmed = text.trim().toLowerCase()
    if (trimmed.length < 2) return
    const matchedStores = new Set<string>()
    for (const it of existingItems) {
      if (it.text.trim().toLowerCase() !== trimmed) continue
      for (const s of it.stores) matchedStores.add(s)
    }
    if (matchedStores.size === 0) return
    // Filter to currently-configured stores so a stale store name
    // from a deleted store doesn't sneak back in as a phantom chip.
    const valid = Array.from(matchedStores).filter((s) => stores.includes(s))
    if (valid.length === 0) return
    setSelectedStores((prev) => {
      // Replace, so the chips reflect the historical truth rather
      // than appending to whatever the seeded initialStore left.
      // Order: keep the configured-stores order for visual stability.
      const set = new Set(valid)
      return stores.filter((s) => set.has(s))
    })
  }, [text, existingItems, stores])

  // Live AI inference — debounced classify-grocery-dept that fires
  // on text-change when local heuristic misses. Existing dept/store
  // hits auto-apply silently (matches the local-heuristic pattern).
  // NEW dept/store proposals surface as pills above the field group
  // so the user can confirm before they're added to their lists.
  // Same token-saving knobs as the todo compose's field-suggest hook.
  // 3 chars covers most short grocery items ("egg", "ham", "tea")
  // while still skipping single typed letters. The earlier 8-char
  // floor missed common words like "Salmon" / "Apples" / "Bread"
  // and was the wrong default for shopping (vs todo titles).
  const AI_MIN_CHARS = 3
  // 800ms debounce — short enough that the Mochi indicator shows up
  // before users assume nothing happened, long enough to absorb a
  // typical short word's typing burst ("Apple", "Eggs") without
  // sending mid-word requests. Earlier 1500ms felt unresponsive.
  const AI_DEBOUNCE_MS = 800
  const aiSeqRef = useRef(0)
  const aiLastQueriedRef = useRef<string>('')
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs so the timer-fired closure reads the latest groups/stores
  // without re-binding the effect on every parent re-render.
  const groupsRef = useRef(groups)
  useEffect(() => { groupsRef.current = groups }, [groups])
  const storesRef = useRef(stores)
  useEffect(() => { storesRef.current = stores }, [stores])

  useEffect(() => {
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = null
    }
    const trimmed = text.trim()
    if (!agentEnabled || trimmed.length < AI_MIN_CHARS) {
      aiSeqRef.current += 1
      setNewStoreProposal(null)
      setAiBusy(false)
      aiLastQueriedRef.current = ''
      return
    }
    if (trimmed === aiLastQueriedRef.current) return

    aiTimerRef.current = setTimeout(() => {
      const seq = ++aiSeqRef.current
      const query = trimmed
      aiLastQueriedRef.current = query
      const departments = groupsRef.current
        .filter((g) => g.id !== OTHERS_GROUP_ID && !g.hidden)
        .slice(0, 10)
        .map((g) => ({ id: g.id, label: g.label }))
      if (departments.length === 0) return
      setAiBusy(true)
      void classifyGroceryDept({
        text: query,
        departments,
        stores: storesRef.current,
      }).then((res) => {
        // Only clear the busy flag for the most-recent dispatch.
        // Stale resolves from earlier keystrokes shouldn't flip the
        // indicator off while a newer call is still pending.
        if (seq === aiSeqRef.current) setAiBusy(false)
        if (seq !== aiSeqRef.current) return
        // Existing dept → silent auto-apply (only if user hasn't
        // picked one manually).
        if (res.groupId && !userPickedDeptRef.current) {
          const dept = groupsRef.current.find((g) => g.id === res.groupId)
          if (dept) setGroupId(dept.id)
        } else if (res.newGroupLabel && onCreateGroup && !userPickedDeptRef.current) {
          // New dept proposal → create + assign silently. The
          // department row is no longer visible in the compose UI,
          // so a confirm pill would be the only signal that something
          // changed — invisible to the user. Just trust the AI and
          // assign; if the user wants to recategorize later they can
          // do it from Manage Departments. Re-check live state in
          // case a duplicate was created between dispatch and response.
          const existing = groupsRef.current.find(
            (g) => g.id !== OTHERS_GROUP_ID && g.label.toLowerCase() === res.newGroupLabel!.toLowerCase(),
          )
          if (existing) {
            setGroupId(existing.id)
          } else {
            const newId = onCreateGroup(res.newGroupLabel)
            if (newId) setGroupId(newId)
          }
        }
        // Store hint: existing → silent setStore, new → pill.
        if (res.storeHint && !userPickedStoreRef.current) {
          const liveStores = storesRef.current
          const matching = liveStores.find(
            (s) => s.toLowerCase() === res.storeHint!.name.toLowerCase(),
          )
          if (matching) {
            // Append the AI-matched store to the picks (dedupe).
            setSelectedStores((prev) =>
              prev.includes(matching) ? prev : [...prev, matching],
            )
            setNewStoreProposal(null)
          } else if (res.storeHint.isNew && onCreateStore) {
            setNewStoreProposal(res.storeHint.name)
          } else {
            setNewStoreProposal(null)
          }
        } else {
          setNewStoreProposal(null)
        }
        // Multi-store recommendation: MERGE recs into the current
        // selection (deduped) so AI can augment whatever the
        // existing-item match / active-filter seed / storeHint
        // already filled. Skips entirely once the user picks a
        // chip manually — at that point we trust their choices.
        // The server already filters recommendedStores to names
        // that exist in the user's live store list, so we can
        // trust them directly.
        if (
          !userPickedStoreRef.current &&
          res.recommendedStores.length > 0
        ) {
          setSelectedStores((prev) => {
            const liveStores = storesRef.current
            const union = new Set([...prev, ...res.recommendedStores])
            // Render in liveStores order for visual stability.
            return liveStores.filter((s) => union.has(s))
          })
        }
      })
    }, AI_DEBOUNCE_MS)

    return () => {
      if (aiTimerRef.current !== null) {
        clearTimeout(aiTimerRef.current)
        aiTimerRef.current = null
      }
    }
  }, [text, agentEnabled, onCreateGroup, onCreateStore])

  function confirmCreateStore(name: string) {
    if (!onCreateStore) return
    Alert.alert(
      `Create new store '${name}'?`,
      '',
      [
        { text: t.cancel, style: 'cancel', onPress: () => setNewStoreProposal(null) },
        {
          text: t.create,
          onPress: () => {
            onCreateStore(name)
            setSelectedStores((prev) =>
              prev.includes(name) ? prev : [...prev, name],
            )
            setNewStoreProposal(null)
            Haptics.selectionAsync().catch(() => {})
          },
        },
      ],
    )
  }

  const activeGroup = resolveGroup(groupId, groups)
  const visibleGroups = useMemo(
    () => groups.filter((g) => !g.hidden),
    [groups],
  )

  function commit(): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd({ text: trimmed, groupId, stores: selectedStores })
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

  // Require at least one store pick. When the user has no configured
  // stores at all, the in-sheet "Add stores first" nudge handles that
  // edge — the buttons stay disabled because there's nothing to pick.
  const canSubmit = text.trim().length > 0 && selectedStores.length > 0

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
                  <TouchableOpacity
                    onPress={handleAdd}
                    disabled={!canSubmit}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSubmit }}
                    accessibilityLabel="Add item"
                  >
                    <Text style={[styles.headerDoneText, !canSubmit && styles.headerDoneTextDisabled]}>
                      {t.done}
                    </Text>
                  </TouchableOpacity>
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

                  {/* Mochi-thinking status — only while an AI call is
                      in flight. Done button promoted to the header
                      (top-right), so the accessory row is just the
                      status now. */}
                  {aiBusy && agentEnabled && (
                    <View style={styles.inputAccessoryRow}>
                      <MochiThinking />
                    </View>
                  )}

                  {/* Store picker — multi-select chips. Tap each store
                      to include / exclude. Pre-seeded with the active
                      store filter when one's set so adding while
                      filtering Trader Joe's auto-tags TJ.  */}
                  {stores.length > 0 && (
                    <View style={styles.storeBlock}>
                      <Text style={styles.storeBlockLabel}>Stores</Text>
                      <View style={styles.storeChipRow}>
                        {stores.map((s) => {
                          const on = selectedStores.includes(s)
                          return (
                            <TouchableOpacity
                              key={s}
                              onPress={() => toggleSelectedStore(s)}
                              style={[
                                styles.storeChip,
                                on && styles.storeChipOn,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={`${on ? 'Remove' : 'Add'} ${s}`}
                            >
                              <Text
                                style={[
                                  styles.storeChipText,
                                  on && styles.storeChipTextOn,
                                ]}
                              >
                                {s}
                              </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )}

                  {/* No-stores nudge — when the user hasn't configured
                      any stores yet, surface a friendly prompt with a
                      CTA to open Manage Store. Items added here will
                      land storeless and the user can tag them later
                      from the Edit sheet. */}
                  {stores.length === 0 && onOpenManageStore && (
                    <TouchableOpacity
                      style={styles.noStoresHint}
                      onPress={() => {
                        onClose()
                        // Same iOS modal-handoff delay used by every
                        // sheet-to-sheet transition in this app.
                        setTimeout(() => onOpenManageStore(), 280)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Add stores first — opens Manage Store"
                    >
                      <Text style={styles.noStoresHintText}>
                        Add stores first to organize this item ›
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.actionRow}>
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

            {/* Department + Store sub-view pickers were removed in
                Phase 1 — Add Item is now name-only. Inferred dept +
                inherited active-store filter handle the rest. */}
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
      // Two visible rows at fontSize 18 / lineHeight ~24 + vertical
      // padding. Keeps the field tall enough for longer items
      // ("vegetable oil for stir fry") without the cursor jumping.
      minHeight: 96,
      fontSize: 18,
      color: c.label,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: c.card,
      borderRadius: 12,
    },
    inputAccessoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 10,
      minHeight: 22,
    },
    aiBusyText: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    aiBusyLabel: {
      fontSize: 12,
      fontStyle: 'italic',
      color: c.label3,
      letterSpacing: -0.1,
    },
    // Top-right "Done" header button — primary save action. Same
    // weight as the iOS standard right-side commit button. Disabled
    // styling dims when the form isn't valid (no text or no store).
    headerDoneText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.primary,
      textAlign: 'right',
    },
    headerDoneTextDisabled: {
      color: c.label3,
      opacity: 0.5,
    },
    fieldGroup: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    aiPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 8,
    },
    aiPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 6,
    },
    aiPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
    noStoresHint: {
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
    },
    noStoresHintText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.primary,
    },
    storeBlock: {
      marginTop: 12,
    },
    storeBlockLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
      color: c.label3,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    storeChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    storeChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
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
    storeChipTextOn: { color: '#fff' },
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
    // Inline search input pinned at the top of the Store sub-view.
    // Doubles as the buffer for the conditional "+ Create '<name>'"
    // row that appears when no existing store matches.
    storeSearchWrap: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.gray3,
      backgroundColor: c.surface,
    },
    storeSearchInput: {
      fontSize: 16,
      color: c.label,
      paddingVertical: 6,
    },
    subRowCheckSpacer: { width: 18 },
  })
}
