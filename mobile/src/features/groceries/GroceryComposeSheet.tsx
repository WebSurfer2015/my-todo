/**
 * Grocery compose sheet — mirrors ComposeSheet (Add a Todo) in
 * structure: bottom-sheet modal with a multiline title input, a
 * grouped field card (Department + Store), and a primary action.
 *
 * Single primary action, serial by default: the header "Add" saves
 * the item, clears the text, and keeps the sheet open + the input
 * focused so the user can fire off a string of items without
 * re-opening the sheet. Department + store carry over between adds.
 * Cancel / backdrop / swipe-down closes — each add is already
 * committed, so there is no separate "done" step.
 *
 * Inline sub-views (not nested modals) are used for the Department
 * and Store pickers — opening another <Modal> on top of this Modal
 * triggers iOS layering bugs.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Alert } from 'react-native'
import SheetShell from '../../ui/SheetShell'
import { Check, Plus, Store as StoreIcon } from 'lucide-react-native'
import MochiThinking from '../mochi/MochiThinking'
import * as Haptics from 'expo-haptics'
import {
  GroceryGroup,
  GroceryItem,
  OTHERS_GROUP_ID,
  resolveGroup,
  inferGroceryGroupLocal,
  groceryMatches,
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
      }).catch(() => {
        // Dept classify is a silent background enhancement — on failure just
        // clear the indicator (don't leave "Sorting into aisles…" hanging).
        if (seq === aiSeqRef.current) setAiBusy(false)
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

  // Partial-label match list. As the user types, surface grocery items
  // (current + past) whose LABEL contains the typed text so a known
  // item can be re-added with one tap — no AI roundtrip, the saved
  // dept + stores ride along. Mirrors the todo reference-pick flow.
  //   • onList = true  → an unchecked item is already on the active
  //                      list; tapping does nothing (per spec).
  //   • onList = false → only checked/past entries exist; tapping
  //                      re-adds it.
  // Pure matching logic lives in core (groceryMatches) so it's
  // unit-testable; this just memoizes it against the live text + items.
  const matches = useMemo(
    () => groceryMatches(text, existingItems),
    [text, existingItems],
  )

  function commit(): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd({ text: trimmed, groupId, stores: selectedStores })
    return true
  }

  // Serial add: commit the item, clear the field, and keep the
  // keyboard up so the user can keep firing off items. Each add is
  // already saved — closing is Cancel / backdrop / swipe-down.
  function handleAdd() {
    if (commit()) {
      setText('')
      // Re-focus on the next frame so the keyboard stays up and the
      // user can keep typing without re-tapping.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  // Tap a match row: re-add a known item (skipping AI) or, if it's
  // already on the active list, do nothing.
  function pickMatch(m: (typeof matches)[number]) {
    // Cancel any pending AI classify — the user picked a known item, so
    // we skip the AI roundtrip entirely (mirrors the todo reference pick).
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = null
    }
    aiSeqRef.current += 1
    setAiBusy(false)
    if (m.onList) {
      // Already on the active list → do nothing (per spec). A light tap
      // confirms the gesture registered without adding a duplicate.
      Haptics.selectionAsync().catch(() => {})
      return
    }
    // Re-add a past item with its saved dept + stores (filtered to ones
    // that still exist). Falls back to whatever stores are already
    // picked if none of the saved stores survive.
    const validStores = stores.filter((s) => m.stores.includes(s))
    const finalStores = validStores.length > 0 ? validStores : selectedStores
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd({ text: m.label, groupId: m.groupId, stores: finalStores })
    // Keep the sheet open (serial-add) and reset for the next item.
    setText('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // Require at least one store pick. When the user has no configured
  // stores at all, the in-sheet "Add stores first" nudge handles that
  // edge — the buttons stay disabled because there's nothing to pick.
  const canSubmit = text.trim().length > 0 && selectedStores.length > 0

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      scroll={false}
      padded={false}
      title="Add Item"
      primary={{ label: t.add, onPress: handleAdd, disabled: !canSubmit }}
    >

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
                    onSubmitEditing={handleAdd}
                  />

                  {/* Match list — known items (current + past) whose
                      label contains the typed text. Tap to re-add with
                      saved dept/stores (no AI); on-list items show a
                      badge and don't re-add. */}
                  {matches.length > 0 && (
                    <View style={styles.matchList}>
                      <Text style={styles.matchHeader}>Saved items · tap to add</Text>
                      {matches.map((m) => {
                        const saved = m.stores
                        const valid = saved.filter((s) => stores.includes(s))
                        const storesText = (valid.length > 0 ? valid : saved).join(', ')
                        return (
                          <TouchableOpacity
                            key={m.label.toLowerCase()}
                            style={styles.matchRow}
                            onPress={() => pickMatch(m)}
                            activeOpacity={m.onList ? 1 : 0.6}
                            accessibilityRole="button"
                            accessibilityLabel={
                              m.onList
                                ? `${m.label}, already on your list`
                                : `Add ${m.label}${storesText ? `, at ${storesText}` : ''}`
                            }
                          >
                            <View style={styles.matchTextCol}>
                              <Text style={styles.matchLabel} numberOfLines={1}>
                                {m.label}
                              </Text>
                              {storesText ? (
                                <View style={styles.matchStoreRow}>
                                  <StoreIcon size={11} color={theme.label3} />
                                  <Text style={styles.matchStore} numberOfLines={1}>
                                    {storesText}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            {m.onList ? (
                              <Text style={styles.matchOnList}>On list</Text>
                            ) : (
                              <Plus size={16} color={theme.primary} />
                            )}
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )}

                  {/* Mochi-thinking status — only while an AI call is
                      in flight. Done button promoted to the header
                      (top-right), so the accessory row is just the
                      status now. */}
                  {aiBusy && agentEnabled && (
                    <View style={styles.inputAccessoryRow}>
                      <MochiThinking label="Sorting into aisles…" />
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
                </View>
    </SheetShell>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
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
    // Distinct "suggestions" panel — tinted + accent-bordered so it
    // reads as a separate affordance from the white page fields.
    matchList: {
      marginTop: 8,
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
      overflow: 'hidden',
    },
    matchHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: c.primary,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 2,
    },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    matchTextCol: { flex: 1 },
    matchLabel: { fontSize: 15, fontWeight: '500', color: c.label },
    matchStoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    matchStore: { fontSize: 12, color: c.label3 },
    matchOnList: {
      fontSize: 11,
      fontWeight: '600',
      color: c.label3,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
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
