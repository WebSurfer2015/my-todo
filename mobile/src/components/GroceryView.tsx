/**
 * Grocery tab body — pill row (store + dept filters), grouped list
 * (by department, narrowed by active store + dept), Past Items
 * bucket for checked items, and a bottom-right FAB that opens the
 * compose sheet for new items.
 *
 * Lifecycle (different from Todo's bin model):
 * - Check an item: it slides into Past Items, never into Trash,
 *   never auto-deletes. Re-add from Past Items bounces it back to
 *   its group.
 * - Permanent delete is manual-only via the edit sheet.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { ChevronDown, ChevronRight, Pin } from 'lucide-react-native'
import { ActionSheetIOS, Alert } from 'react-native'
import { GroceryItem, GroceryGroup, frequentGroceries } from '../groceries'
import { useTheme, ThemeColors } from '../theme'
import GroceryEditSheet from './GroceryEditSheet'
import GroceryComposeSheet from './GroceryComposeSheet'
import StorePicker from './StorePicker'
import GroceryIcon from './GroceryIcon'
import Fab from './Fab'
import EmptyStateCard from './EmptyStateCard'
import { Analytics } from '../analytics'
import SearchPill from './SearchPill'

interface Props {
  groceries: GroceryItem[]
  groceryGroups: GroceryGroup[]
  /** Explicit configured store list (profile.groceryStores ?? seeds).
   * Used to populate the StorePicker even when no items reference
   * those stores yet. */
  configuredStores: string[]
  hiddenStores: string[]
  pinnedStores: string[]
  /** Department-ids the user has pinned to the pill row. Long-press
   * any dept pill to toggle. Mirrors `pinnedStores`. */
  pinnedDepts: string[]
  activeStore: string | undefined
  /** Optional active department-id filter from profile. When set,
   * the visible list narrows to items in that department (combined
   * with activeStore). Undefined = all departments. */
  activeDept: string | undefined
  /** Last-picked store on the Add Item sheet (from profile). Seeds
   * the local `lastAddedStore` state so a fresh launch's compose
   * sheet starts where the user left off, then in-session adds keep
   * updating without waiting for the Firestore round-trip. */
  initialAddStore: string | undefined
  /** Live search text. While the search top-sheet is open this
   * mirrors the input; once committed it's the trimmed query that
   * keeps narrowing the list. Empty = no search filter. */
  searchQuery: string
  /** Whether the persistent search pill should render in the pill
   * row. Parent toggles this off while the top-sheet is open (the
   * sheet's input is the active indicator then). */
  searchPillVisible: boolean
  /** Tap the search pill body → re-open the top-sheet to edit. */
  onSearchPillPress: () => void
  /** Tap the X on the search pill → clear the query. */
  onSearchClear: () => void
  onAdd: (args: { text: string; groupId?: string; stores?: string[] }) => void
  /** When true, the grocery FAB shows a small Sparkles badge —
   * matches the to-do FAB and signals that AI dept inference runs
   * silently on add. */
  agentEnabled?: boolean
  onToggleChecked: (id: string) => void
  onEdit: (
    id: string,
    patch: { text?: string; groupId?: string; store?: string | null },
  ) => void
  onDelete: (id: string) => void
  // Store management — wired through to StorePicker.
  onSetActiveStore: (store: string | undefined) => void
  onSetActiveDept: (deptId: string | undefined) => void
  onAddStore: (name: string) => void
  /** Bulk-append a store to many items at once. Called by the AI
   * link-store-to-items flow after a new store is added. */
  onLinkItemsToStore?: (storeName: string, itemIds: string[]) => void
  /** Create a new grocery department from a label. Returns the new
   * group id, or undefined when the cap is reached / label invalid. */
  onAddGroup: (label: string) => string | undefined
  onRenameStore: (oldName: string, newName: string) => void
  onDeleteStore: (name: string) => void
  onReorderStores: (next: string[]) => void
  onToggleStoreHidden: (name: string) => void
  onTogglePinnedStore: (name: string) => void
  onTogglePinnedDept: (deptId: string) => void
  // Department management — wired through to StorePicker (manage
  // section) and GroceryComposeSheet (pick).
  onSetGroceryGroups: (next: GroceryGroup[]) => void
  /** Optional controlled state for the StorePicker sheet, so a parent
   * (e.g. GroceriesScreen) can open it from the AppHeader filter
   * icon. When omitted, GroceryView falls back to its internal
   * inline funnel state. */
  storePickerOpen?: boolean
  onStorePickerOpenChange?: (open: boolean) => void
  /** When true, StorePicker mounts in Manage (edit) mode. Used by
   * the Groceries AppHeader gear icon and the Settings → Manage
   * Groceries entry. Default false (Pick mode). */
  storePickerEditing?: boolean
  /** Forwarded to GroceryComposeSheet — surfaces a "Add stores first"
   * nudge when the user has no stores configured. Owner navigates +
   * promotes the Manage Store sheet. */
  onOpenManageStore?: () => void
}


export default function GroceryView({
  groceries,
  groceryGroups,
  configuredStores,
  hiddenStores,
  pinnedStores,
  pinnedDepts,
  activeStore,
  activeDept,
  initialAddStore,
  searchQuery,
  searchPillVisible,
  onSearchPillPress,
  onSearchClear,
  onAdd,
  agentEnabled = false,
  onToggleChecked,
  onEdit,
  onDelete,
  onSetActiveStore,
  onSetActiveDept,
  onAddStore,
  onLinkItemsToStore,
  onAddGroup,
  onRenameStore,
  onDeleteStore,
  onReorderStores,
  onToggleStoreHidden,
  onTogglePinnedStore,
  onTogglePinnedDept,
  onSetGroceryGroups,
  storePickerOpen: storePickerOpenProp,
  onStorePickerOpenChange,
  storePickerEditing,
  onOpenManageStore,
}: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Compose-sheet visibility — opened by the bottom-right FAB,
  // mirrors the Todos compose flow.
  const [composeOpen, setComposeOpen] = useState(false)
  // Sticky default for the Add Item sheet's store field. Seeded from
  // profile.lastAddedGroceryStore so a fresh launch picks up where the
  // user left off; in-session adds update this local mirror first
  // (snappy) and the store then debounces the profile write.
  const [lastAddedStore, setLastAddedStore] = useState<string | undefined>(
    initialAddStore,
  )

  // Edit-sheet state — tap a row's text opens this for the underlying item.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bottom-sheet picker visibility. Either controlled by the parent
  // (GroceriesScreen, so the AppHeader filter icon can open it) or
  // an internal fallback when no controlled props are passed.
  const [storePickerOpenInternal, setStorePickerOpenInternal] = useState(false)
  const storePickerOpen = storePickerOpenProp ?? storePickerOpenInternal
  const setStorePickerOpen = (v: boolean) => {
    if (onStorePickerOpenChange) onStorePickerOpenChange(v)
    else setStorePickerOpenInternal(v)
  }
  // True when the user tapped the no-stores empty-state CTA so we
  // want the StorePicker to mount with its inline "Add store" row
  // already showing. Resets on every close.
  const [storePickerAutoAdd, setStorePickerAutoAdd] = useState(false)
  // Per-department + Past-items + Often-picked-up collapse state.
  // PAST_KEY / OFTEN_KEY are synthetic ids so both synthetic buckets
  // share the same Set. Past Items defaults to collapsed (rarely
  // scanned history); Often Picked Up defaults to expanded because
  // its whole point is one-tap re-add visibility.
  const PAST_KEY = '__past__'
  const OFTEN_KEY = '__often__'
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set([PAST_KEY]),
  )
  function toggleCollapsed(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const editingItem = useMemo(
    () => (editingId ? groceries.find((g) => g.id === editingId) ?? null : null),
    [editingId, groceries],
  )

  // Filter items by active store and active department. Store:
  //   undefined  → all items
  //   "Costco"   → items tagged with Costco AND items with no store tag.
  // Including the no-store items is intentional: items the user kept
  // store-agnostic (e.g. "milk", "batteries") should follow them into
  // any store list — they need it everywhere they shop.
  // Dept: undefined means "all departments"; otherwise narrow to items
  // whose groupId matches. A hidden / unknown dept id falls back to "all"
  // so a stale filter never empties the list.
  const visibleGroups = useMemo(
    () => groceryGroups.filter((g) => !g.hidden),
    [groceryGroups],
  )
  const effectiveDept =
    activeDept && visibleGroups.some((g) => g.id === activeDept)
      ? activeDept
      : undefined
  // Search narrows the same set as store + dept — case-insensitive
  // substring match against item text, store name, or department label.
  // We resolve the group label inside the loop only when needed so the
  // common no-search path stays fast.
  const searchNeedle = searchQuery.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    return groceries.filter((g) => {
      if (activeStore !== undefined) {
        // Multi-store: item must explicitly include the active store.
        // Items with an empty stores list don't appear under any
        // specific store filter — they live in the All view only.
        if (!g.stores.includes(activeStore)) return false
      }
      if (effectiveDept !== undefined && g.groupId !== effectiveDept) return false
      if (searchNeedle) {
        if (g.text.toLowerCase().includes(searchNeedle)) return true
        if (g.stores.some((s) => s.toLowerCase().includes(searchNeedle))) return true
        const group = groceryGroups.find((x) => x.id === g.groupId)
        if (group && group.label.toLowerCase().includes(searchNeedle)) return true
        return false
      }
      return true
    })
  }, [groceries, activeStore, effectiveDept, searchNeedle, groceryGroups])

  // Per-store active-item counts — used for the pill counters. "All"
  // counts every unchecked item; per-store counts only those tagged
  // with that store. We compute these from the raw groceries list (not
  // filteredItems) so the counts reflect "what would appear if I
  // tapped this pill", not "what's currently in view".
  const allActiveCount = useMemo(
    () => groceries.filter((g) => !g.checked).length,
    [groceries],
  )
  // Per-store active counts — count of active items tagged with each
  // store. A multi-store item contributes +1 to each of its stores'
  // counts. Untagged items don't appear under any store filter, so
  // they aren't counted here (they only show in the All view).
  const perStoreActiveCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of configuredStores) m.set(s, 0)
    for (const it of groceries) {
      if (it.checked) continue
      for (const s of it.stores) {
        if (m.has(s)) m.set(s, (m.get(s) ?? 0) + 1)
      }
    }
    return m
  }, [groceries, configuredStores])

  const deptActiveCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of groceries) {
      if (it.checked) continue
      m.set(it.groupId, (m.get(it.groupId) ?? 0) + 1)
    }
    return m
  }, [groceries])

  const activeDeptGroup = effectiveDept
    ? visibleGroups.find((g) => g.id === effectiveDept) ?? null
    : null
  const activeDeptCount = useMemo(() => {
    if (!effectiveDept) return 0
    return groceries.filter((g) => !g.checked && g.groupId === effectiveDept).length
  }, [groceries, effectiveDept])

  // Group items by group id. Future bucket = checked items, regardless of group.
  const { byGroup, future } = useMemo(() => {
    const by: Map<string, GroceryItem[]> = new Map()
    const fut: GroceryItem[] = []
    for (const it of filteredItems) {
      if (it.checked) {
        fut.push(it)
      } else {
        const id = it.groupId
        const arr = by.get(id) ?? []
        arr.push(it)
        by.set(id, arr)
      }
    }
    // Sort within each group: most-recently-added first (addedAt desc).
    for (const arr of by.values()) {
      arr.sort((a, b) => b.addedAt - a.addedAt)
    }
    // Future: most-recently-checked first.
    fut.sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0))
    return { byGroup: by, future: fut }
  }, [filteredItems])

  // "Often picked up" — items whose purchase log shows ≥5 check-offs
  // in the last ~6 months. Restricted to currently-checked items so
  // this section only ever surfaces re-add candidates (items already
  // active sit in their dept group above and shouldn't double-up).
  // Respects the same store + dept + search filter as the rest of the
  // list (uses filteredItems, not raw groceries) so the section stays
  // contextual.
  const often = useMemo(
    () => frequentGroceries(filteredItems.filter((it) => it.checked)),
    [filteredItems],
  )


  const openStoreSwitcher = () => setStorePickerOpen(true)

  // Auto-scroll the pill row so the just-chosen filter is in view.
  // Mirrors the behavior in FilterBar: each pill reports its layout X
  // into a ref, and an effect on (activeStore, activeDept) looks up the
  // active pill's X and scrolls to it, landing the pill 16pt from the
  // leading edge to match the row's leading padding.
  const pillScrollRef = useRef<ScrollView>(null)
  const pillXRef = useRef<Record<string, number>>({})
  // Resolve which pill counts as "active right now" — prefer the dept
  // pill (more specific narrowing, also rendered later in the row) over
  // the store pill, falling back to "All" when nothing is set.
  const activePillKey = effectiveDept
    ? `dept-${effectiveDept}`
    : activeStore !== undefined
      ? `store-${activeStore}`
      : '_all'
  useEffect(() => {
    const x = pillXRef.current[activePillKey]
    if (x === undefined || !pillScrollRef.current) return
    pillScrollRef.current.scrollTo({ x: Math.max(0, x - 16), animated: true })
  }, [activePillKey])

  // Pills row contents — only stores with at least one unchecked
  // item ("active stores"). Pinned active stores render FIRST (to
  // preserve the user's curation), then non-pinned active stores
  // in configured-list order. Pinned-but-empty stores are hidden;
  // they reappear automatically as soon as an item lands in them.
  // Excludes the currently active store (it renders as the leading
  // pill). Hidden stores never appear here.
  const pillStores = useMemo(() => {
    const visible = configuredStores.filter((s) => !hiddenStores.includes(s))
    const seen = new Set<string>()
    const out: string[] = []
    const hasItems = (s: string) => (perStoreActiveCount.get(s) ?? 0) > 0
    // 1. Pinned + has items.
    for (const s of pinnedStores) {
      if (!visible.includes(s)) continue
      if (s === activeStore) continue
      if (!hasItems(s)) continue
      if (seen.has(s)) continue
      seen.add(s)
      out.push(s)
    }
    // 2. Non-pinned + has items.
    for (const s of visible) {
      if (s === activeStore) continue
      if (seen.has(s)) continue
      if (!hasItems(s)) continue
      seen.add(s)
      out.push(s)
    }
    return out
  }, [configuredStores, hiddenStores, pinnedStores, activeStore, perStoreActiveCount])

  // Pinned-only depts, excluding the currently active one. Same idea as
  // pillStores: the active dept is rendered as a SEPARATE leading pill
  // so the selected filter (whether store or dept) always sits next to
  // "All". Stale ids (deleted / hidden) drop silently.
  const pillDepts = useMemo(() => {
    const visibleIds = new Set(visibleGroups.map((g) => g.id))
    const out: string[] = []
    for (const id of pinnedDepts) {
      if (!visibleIds.has(id)) continue
      if (id === effectiveDept) continue
      out.push(id)
    }
    return out
  }, [pinnedDepts, visibleGroups, effectiveDept])

  // The active store pill renders ahead of all pinned pills (right
  // after "All") when one is selected and visible — even if it isn't
  // pinned. Lifted out of pillStores so it sits before pillDepts/
  // pillStores rather than interleaving with them.
  const leadingActiveStore = useMemo(() => {
    if (activeStore === undefined) return null
    if (hiddenStores.includes(activeStore)) return null
    if (!configuredStores.includes(activeStore)) return null
    return activeStore
  }, [activeStore, configuredStores, hiddenStores])

  // The active dept pill renders right after the active store (or right
  // after "All" if no store is selected) so the user's most recent
  // filter choice always sits adjacent to "All".
  const leadingActiveDept = useMemo(() => {
    if (!effectiveDept) return null
    const g = visibleGroups.find((x) => x.id === effectiveDept)
    return g ?? null
  }, [effectiveDept, visibleGroups])

  function promptPin(name: string, kind: 'store' | 'dept', label: string) {
    const isPinned =
      kind === 'store' ? pinnedStores.includes(name) : pinnedDepts.includes(name)
    const actionLabel = isPinned ? 'Unpin' : 'Pin'
    const toggle = () =>
      kind === 'store' ? onTogglePinnedStore(name) : onTogglePinnedDept(name)
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [actionLabel, 'Cancel'], title: label, cancelButtonIndex: 1 },
        (i) => {
          if (i === 0) toggle()
        },
      )
    } else {
      Alert.alert(label, undefined, [
        { text: actionLabel, onPress: toggle },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  return (
    <>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Store filter row — All pinned on the left (no horizontal
          scroll touches it), then a horizontal scrolling group for
          selected + pinned pills. Same layout idiom Todos' FilterBar
          uses for its All pill: TouchableOpacity sibling, no inner
          wrapper, parent row provides gap + horizontal padding.
          Hidden entirely when there's no active store/dept filter
          AND no pinned store / dept pills would render — keeps the
          empty-state view clean. */}
      {(activeStore !== undefined ||
        effectiveDept !== undefined ||
        pillStores.length > 0 ||
        pillDepts.length > 0) && (
      <View style={styles.pillsRow}>
        <StorePill
          label="All"
          count={allActiveCount}
          active={activeStore === undefined && effectiveDept === undefined}
          pinned={false}
          // When unselected, render the "candidate" outline style
          // (mint border on white card bg) so the All pill matches
          // Todos' FilterBar `pillExtra` look exactly.
          inactiveOutline
          onPress={() => {
            onSetActiveStore(undefined)
            onSetActiveDept(undefined)
          }}
          onLongPress={undefined}
          onLayoutX={(x) => {
            pillXRef.current['_all'] = x
          }}
          styles={styles}
        />
        <ScrollView
          ref={pillScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
        >
          {searchPillVisible && (
            <SearchPill
              query={searchQuery.trim()}
              onPress={onSearchPillPress}
              onClear={onSearchClear}
            />
          )}
          {/* Leading active filters — whichever filter the user just
              picked (store, dept, or both) sits IMMEDIATELY after "All"
              before any pinned-only pills. This is the rule the user
              explicitly asked for: "selected filter moves to the front
              next to All even if it is not pinned." */}
          {leadingActiveStore !== null && (
            <StorePill
              key={`store-${leadingActiveStore}`}
              label={leadingActiveStore}
              count={perStoreActiveCount.get(leadingActiveStore) ?? 0}
              active
              pinned={pinnedStores.includes(leadingActiveStore)}
              onPress={() => onSetActiveStore(leadingActiveStore)}
              onLongPress={() =>
                promptPin(leadingActiveStore, 'store', leadingActiveStore)
              }
              onLayoutX={(x) => {
                pillXRef.current[`store-${leadingActiveStore}`] = x
              }}
              styles={styles}
            />
          )}
          {leadingActiveDept !== null && (
            <StorePill
              key={`dept-${leadingActiveDept.id}`}
              label={leadingActiveDept.label}
              count={deptActiveCounts.get(leadingActiveDept.id) ?? 0}
              active
              pinned={pinnedDepts.includes(leadingActiveDept.id)}
              deptIcon={
                <GroceryIcon
                  kind="department"
                  id={leadingActiveDept.id}
                  customIcon={leadingActiveDept.icon}
                  customColor={leadingActiveDept.color}
                  size={14}
                  color="#fff"
                />
              }
              pinIconColor="#fff"
              onPress={() => onSetActiveDept(undefined)}
              onLayoutX={(x) => {
                pillXRef.current[`dept-${leadingActiveDept.id}`] = x
              }}
              onLongPress={() =>
                promptPin(leadingActiveDept.id, 'dept', leadingActiveDept.label)
              }
              styles={styles}
            />
          )}
          {pillStores.map((s) => (
            <StorePill
              key={`store-${s}`}
              label={s}
              count={perStoreActiveCount.get(s) ?? 0}
              active={activeStore === s}
              pinned={pinnedStores.includes(s)}
              onPress={() => onSetActiveStore(s)}
              onLongPress={() => promptPin(s, 'store', s)}
              onLayoutX={(x) => {
                pillXRef.current[`store-${s}`] = x
              }}
              styles={styles}
            />
          ))}
          {pillDepts.map((id) => {
            const g = visibleGroups.find((x) => x.id === id)
            if (!g) return null
            const isActive = effectiveDept === g.id
            const pinIconColor = isActive ? '#fff' : (g.color ?? theme.label2)
            return (
              <StorePill
                key={`dept-${g.id}`}
                label={g.label}
                count={deptActiveCounts.get(g.id) ?? 0}
                active={isActive}
                pinned
                deptIcon={
                  <GroceryIcon
                    kind="department"
                    id={g.id}
                    customIcon={g.icon}
                    customColor={g.color}
                    size={14}
                    color={isActive ? '#fff' : undefined}
                  />
                }
                pinIconColor={pinIconColor}
                onPress={() => onSetActiveDept(isActive ? undefined : g.id)}
                onLayoutX={(x) => {
                  pillXRef.current[`dept-${g.id}`] = x
                }}
                onLongPress={() => promptPin(g.id, 'dept', g.label)}
                styles={styles}
              />
            )
          })}
          {/* Active-dept-not-pinned trailing pill removed — pillDepts
              now prepends the active dept (whether pinned or not),
              keeping the row order: All, active store, pinned stores,
              active dept, pinned depts. */}
        </ScrollView>
      </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Two empty states layered by priority: first set up a
            store, then add an item. Both use the shared
            EmptyStateCard so they read as members of the same UI
            family as the Home "Nothing pending." card. */}
        {configuredStores.length === 0 ? (
          <EmptyStateCard
            title="No stores yet."
            hint="Add the stores you shop at."
            actionLabel="Add Store"
            actionAccessibilityLabel="Add a store"
            onAction={() => {
              void Analytics.emptyStateCtaTapped('shopping-no-store')
              // Open StorePicker straight into the inline-add row
              // so the user lands on the name input — saves a
              // redundant tap on "+ Add store" inside the picker.
              setStorePickerAutoAdd(true)
              setStorePickerOpen(true)
            }}
          />
        ) : groceries.length === 0 ? (
          <EmptyStateCard
            title="Start shopping."
            hint="Add an item to get started."
            actionLabel="Add your first item"
            onAction={() => {
              void Analytics.emptyStateCtaTapped('shopping-no-item')
              setComposeOpen(true)
            }}
          />
        ) : null}

        {visibleGroups.map((g) => {
          const items = byGroup.get(g.id) ?? []
          if (items.length === 0) return null
          const collapsed = collapsedGroups.has(g.id)
          return (
            <View key={g.id} style={styles.groupBlock}>
              <TouchableOpacity
                style={styles.groupHeaderRow}
                onPress={() => toggleCollapsed(g.id)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`${g.label}, ${items.length} items, ${collapsed ? 'collapsed' : 'expanded'}. Tap to toggle.`}
              >
                {collapsed ? (
                  <ChevronRight size={14} color={theme.label3} strokeWidth={2} />
                ) : (
                  <ChevronDown size={14} color={theme.label3} strokeWidth={2} />
                )}
                <Text style={styles.groupHeader}>
                  {g.label.toUpperCase()}
                  <Text style={styles.groupCount}>  {items.length}</Text>
                </Text>
              </TouchableOpacity>
              {!collapsed && (
                <View style={styles.groupCard}>
                  {items.map((it, i) => (
                    <View key={it.id}>
                      {i > 0 && <View style={styles.divider} />}
                      <Row
                        item={it}
                        onToggle={() => onToggleChecked(it.id)}
                        onOpenEdit={() => setEditingId(it.id)}
                        styles={styles}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        })}

        {/* Often Picked Up — items checked ≥5 times in the last
            ~6 months. Quiet header (no per-item count badge) per the
            calm-app positioning. Sits above Past Items so the user's
            steady-state staples are one tap away. */}
        {often.length > 0 && (() => {
          const collapsed = collapsedGroups.has(OFTEN_KEY)
          return (
            <View style={styles.groupBlock}>
              <TouchableOpacity
                style={styles.groupHeaderRow}
                onPress={() => toggleCollapsed(OFTEN_KEY)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Often picked up, ${often.length}, ${collapsed ? 'collapsed' : 'expanded'}. Tap to toggle.`}
              >
                {collapsed ? (
                  <ChevronRight size={14} color={theme.label3} strokeWidth={2} />
                ) : (
                  <ChevronDown size={14} color={theme.label3} strokeWidth={2} />
                )}
                <Text style={[styles.groupHeader, styles.groupHeaderFuture]}>
                  OFTEN PICKED UP
                  <Text style={styles.groupCount}>  {often.length}</Text>
                </Text>
              </TouchableOpacity>
              {!collapsed && (
                <>
                  <Text style={styles.futureHint}>
                    Tap any item to add it back to its group.
                  </Text>
                  <View style={styles.groupCard}>
                    {often.map((it, i) => (
                      <View key={it.id}>
                        {i > 0 && <View style={styles.divider} />}
                        <Row
                          item={it}
                          onToggle={() => onToggleChecked(it.id)}
                          onOpenEdit={() => setEditingId(it.id)}
                          styles={styles}
                          futureMode
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )
        })()}

        {/* Past Items bucket — checked items waiting for a re-add. */}
        {future.length > 0 && (() => {
          const collapsed = collapsedGroups.has(PAST_KEY)
          return (
            <View style={styles.groupBlock}>
              <TouchableOpacity
                style={styles.groupHeaderRow}
                onPress={() => toggleCollapsed(PAST_KEY)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Past items, ${future.length}, ${collapsed ? 'collapsed' : 'expanded'}. Tap to toggle.`}
              >
                {collapsed ? (
                  <ChevronRight size={14} color={theme.label3} strokeWidth={2} />
                ) : (
                  <ChevronDown size={14} color={theme.label3} strokeWidth={2} />
                )}
                <Text style={[styles.groupHeader, styles.groupHeaderFuture]}>
                  PAST ITEMS
                  <Text style={styles.groupCount}>  {future.length}</Text>
                </Text>
              </TouchableOpacity>
              {!collapsed && (
                <>
                  <Text style={styles.futureHint}>
                    Tap any item to add it back to its group.
                  </Text>
                  <View style={styles.groupCard}>
                    {future.map((it, i) => (
                      <View key={it.id}>
                        {i > 0 && <View style={styles.divider} />}
                        <Row
                          item={it}
                          onToggle={() => onToggleChecked(it.id)}
                          onOpenEdit={() => setEditingId(it.id)}
                          styles={styles}
                          futureMode
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )
        })()}

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
    <GroceryEditSheet
      visible={editingId !== null}
      item={editingItem}
      groups={groceryGroups}
      stores={configuredStores}
      onSave={onEdit}
      onDelete={onDelete}
      onClose={() => setEditingId(null)}
    />
    <StorePicker
      visible={storePickerOpen}
      defaultEditing={storePickerEditing}
      defaultAdding={storePickerAutoAdd}
      items={groceries}
      stores={configuredStores}
      hiddenStores={hiddenStores}
      activeStore={activeStore}
      activeDept={activeDept}
      onSelect={onSetActiveStore}
      onSelectDept={onSetActiveDept}
      onAdd={onAddStore}
      onRename={onRenameStore}
      onDelete={onDeleteStore}
      onReorder={onReorderStores}
      onToggleHidden={onToggleStoreHidden}
      groups={groceryGroups}
      onSetGroups={onSetGroceryGroups}
      agentEnabled={agentEnabled}
      onLinkItems={onLinkItemsToStore}
      onClose={() => {
        setStorePickerOpen(false)
        setStorePickerAutoAdd(false)
      }}
    />
    <GroceryComposeSheet
      visible={composeOpen}
      groups={groceryGroups}
      stores={configuredStores.filter((s) => !hiddenStores.includes(s))}
      existingItems={groceries}
      initialStore={activeStore ?? lastAddedStore}
      initialDepartmentId={effectiveDept}
      onAdd={({ text, groupId, stores }) => {
        // Stamp lastAddedGroceryStore from the first pick so "Add
        // another" can re-pre-select it; falls back to undefined
        // when the user submitted with no stores attached.
        setLastAddedStore(stores[0])
        onAdd({ text, groupId, stores })
      }}
      onCreateStore={onAddStore}
      onCreateGroup={onAddGroup}
      onOpenManageStore={onOpenManageStore}
      agentEnabled={agentEnabled}
      onClose={() => setComposeOpen(false)}
    />
    <Fab
      onPress={() => {
        void Analytics.fabTapped('shopping')
        setComposeOpen(true)
      }}
      accessibilityLabel="Add an item"
      agentEnabled={agentEnabled}
    />
    </>
  )
}

interface RowProps {
  item: GroceryItem
  onToggle: () => void
  onOpenEdit: () => void
  styles: ReturnType<typeof makeStyles>
  futureMode?: boolean
}

/**
 * Row tap targets split iOS-Reminders-style:
 * - Checkbox area (left) → toggle checked / re-add from Future
 * - Text + store (rest of the row) → open edit sheet
 * Long-press anywhere → also opens edit (alternative discovery path).
 */
interface StorePillProps {
  label: string
  count: number
  active: boolean
  pinned: boolean
  /** Optional leading icon (used by the dept pill so the user can
   * tell it's a department filter rather than a store). */
  deptIcon?: React.ReactNode
  /** Tint for the pin glyph when the pill is pinned. Defaults to the
   * label color so it matches the surrounding text. */
  pinIconColor?: string
  /** Reports the pill's X position within the scroll content. Parent
   * uses these to scroll the active pill into view on filter change. */
  onLayoutX?: (x: number) => void
  onPress: () => void
  onLongPress: (() => void) | undefined
  styles: ReturnType<typeof makeStyles>
  /** When true and `active` is false, render the mint-outline
   * "candidate" style — mirrors Todos FilterBar's `pillExtra` look
   * for the unselected All pill. */
  inactiveOutline?: boolean
}

function StorePill({
  label,
  count,
  active,
  pinned,
  deptIcon,
  pinIconColor,
  onLayoutX,
  onPress,
  onLongPress,
  styles,
  inactiveOutline,
}: StorePillProps) {
  const pinColor =
    pinIconColor ?? (active ? '#fff' : (styles.storePillLabel.color as string))
  return (
    <TouchableOpacity
      style={[
        styles.storePill,
        active && styles.storePillActive,
        !active && inactiveOutline && styles.storePillExtra,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      onLayout={
        onLayoutX
          ? (e) => onLayoutX(e.nativeEvent.layout.x)
          : undefined
      }
      delayLongPress={350}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}${active ? ', selected' : ''}${pinned ? ', pinned' : ''}`}
      accessibilityHint={onLongPress ? 'Long-press to pin or unpin' : undefined}
    >
      {pinned && (
        <Pin size={10} color={pinColor} strokeWidth={2.4} fill={pinColor} />
      )}
      {deptIcon}
      <Text
        style={[styles.storePillLabel, active && styles.storePillLabelActive]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
      {count > 0 && (
        <Text
          style={[styles.storePillCount, active && styles.storePillCountActive]}
          maxFontSizeMultiplier={1.3}
        >
          {count}
        </Text>
      )}
    </TouchableOpacity>
  )
}

function Row({ item, onToggle, onOpenEdit, styles, futureMode }: RowProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={
          futureMode
            ? `Add ${item.text} back to list`
            : `Check off ${item.text}`
        }
      >
        <View
          style={[
            styles.checkbox,
            item.checked && styles.checkboxChecked,
            futureMode && styles.checkboxFuture,
          ]}
        >
          {futureMode ? (
            <Text style={styles.checkboxPlus}>+</Text>
          ) : item.checked ? (
            <Text style={styles.checkboxCheck}>✓</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowBody}
        activeOpacity={0.6}
        onPress={onToggle}
        onLongPress={onOpenEdit}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={
          futureMode
            ? `${item.text}. Tap to add back, long-press to edit.`
            : item.checked
              ? `${item.text}, checked. Tap to un-check, long-press to edit.`
              : `${item.text}. Tap to check off, long-press to edit.`
        }
      >
        <Text
          style={[
            styles.rowText,
            item.checked && !futureMode && styles.rowTextChecked,
          ]}
          numberOfLines={2}
        >
          {item.text}
        </Text>
        {item.stores.length > 0 && (
          <Text style={styles.rowStore} numberOfLines={1}>
            {item.stores.join(' · ')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    // Filter row — mirrors the Todos FilterBar idiom exactly: no
    // background fill (sits on the canvas / AppBackground), no
    // separator line. Same 16px horizontal padding + 8px gap so
    // the All pill aligns visually with Todos between tabs.
    pillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    pillsScroll: {
      flexDirection: 'row',
      gap: 8,
      // Right padding only — left padding + spacing-to-All are
      // provided by the parent pillsRow's paddingHorizontal + gap.
      paddingRight: 0,
      paddingLeft: 0,
    },
    storePill: {
      // Chrome mirrors the Todos FilterBar pill: round, slim padding,
      // hairline border, soft card background. The pin glyph overlays
      // the top-left corner (absolute) instead of consuming inline
      // horizontal space, so the pill body stays narrow when many
      // pinned pills crowd the row.
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 100,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    storePillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    // Unselected "candidate" outline — mirrors Todos FilterBar's
    // pillExtra so the unselected All pill reads identically across
    // the two tabs (white card bg + mint 1.5px border).
    storePillExtra: {
      backgroundColor: c.card,
      borderColor: c.primary,
      borderWidth: 1.5,
    },
    storePillLabel: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.label,
      maxWidth: 180,
    },
    storePillLabelActive: { color: '#fff' },
    storePillCount: {
      fontSize: 12,
      fontWeight: '700',
      color: c.label2,
      fontVariant: ['tabular-nums'],
      marginLeft: 2,
    },
    storePillCountActive: { color: 'rgba(255,255,255,0.95)' },
    scroll: {
      paddingBottom: 96,
      // 16px horizontal so the EmptyStateCard sits at the same
      // page-edge inset as the App.tsx body padding — empty states
      // across tabs must look the same width. groupBlock children
      // explicitly negate this with their own marginHorizontal so
      // pre-existing list layouts aren't double-padded.
      paddingHorizontal: 16,
    },
    groupBlock: {
      // ScrollView already supplies 16px horizontal so EmptyStateCard
      // matches App.tsx's inset. Negate it here so the existing list
      // layout stays exactly where it was — group headers + cards
      // were already aligned right at the screen edge minus 16.
      marginHorizontal: -16,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
      paddingVertical: 6,
      marginBottom: 2,
    },
    groupHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
    },
    groupHeaderFuture: { color: c.label2 },
    groupCount: { fontWeight: '500', color: c.gray3 },
    futureHint: {
      fontSize: 12,
      color: c.label3,
      paddingHorizontal: 4,
      marginBottom: 6,
      marginTop: -2,
    },
    groupCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 50,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      // Pad vertically so the tap target stays at least 44pt for HIG
      // even when the text is short.
      paddingVertical: 4,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
    checkboxFuture: { borderColor: c.label3, borderStyle: 'dashed' },
    checkboxCheck: { color: c.primaryOn, fontSize: 14, fontWeight: '700', lineHeight: 16 },
    checkboxPlus: { color: c.label2, fontSize: 16, fontWeight: '700', lineHeight: 16 },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: c.label,
    },
    rowTextChecked: {
      textDecorationLine: 'line-through',
      color: c.label3,
    },
    rowStore: {
      fontSize: 12,
      color: c.label3,
      marginLeft: 'auto',
      maxWidth: 100,
    },
  })
}
