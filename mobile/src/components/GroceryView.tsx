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
import { ChevronDown, ChevronRight, Filter as FunnelIcon, Pin } from 'lucide-react-native'
import { ActionSheetIOS, Alert } from 'react-native'
import { GroceryItem, GroceryGroup } from '../groceries'
import { useTheme, ThemeColors } from '../theme'
import GroceryEditSheet from './GroceryEditSheet'
import GroceryComposeSheet from './GroceryComposeSheet'
import StorePicker from './StorePicker'
import GroceryIcon from './GroceryIcon'
import Fab from './Fab'
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
  onAdd: (args: { text: string; groupId?: string; store?: string }) => void
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
  onRenameStore: (oldName: string, newName: string) => void
  onDeleteStore: (name: string) => void
  onReorderStores: (next: string[]) => void
  onToggleStoreHidden: (name: string) => void
  onTogglePinnedStore: (name: string) => void
  onTogglePinnedDept: (deptId: string) => void
  // Department management — wired through to StorePicker (manage
  // section) and GroceryComposeSheet (pick).
  onSetGroceryGroups: (next: GroceryGroup[]) => void
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
  searchQuery,
  searchPillVisible,
  onSearchPillPress,
  onSearchClear,
  onAdd,
  onToggleChecked,
  onEdit,
  onDelete,
  onSetActiveStore,
  onSetActiveDept,
  onAddStore,
  onRenameStore,
  onDeleteStore,
  onReorderStores,
  onToggleStoreHidden,
  onTogglePinnedStore,
  onTogglePinnedDept,
  onSetGroceryGroups,
}: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Compose-sheet visibility — opened by the bottom-right FAB,
  // mirrors the Todos compose flow.
  const [composeOpen, setComposeOpen] = useState(false)

  // Edit-sheet state — tap a row's text opens this for the underlying item.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bottom-sheet picker visibility — each picker has its own pick/manage
  // modes internally.
  const [storePickerOpen, setStorePickerOpen] = useState(false)
  // Per-department + Past-items collapse state. PAST_KEY is a synthetic
  // id so the Past Items bucket can share the same Set. Past Items
  // defaults to collapsed because it's history the user rarely scans.
  const PAST_KEY = '__past__'
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
        const storeVal = g.store ?? ''
        // Empty store = "Any" — always included. Otherwise must match.
        if (storeVal !== '' && storeVal !== activeStore) return false
      }
      if (effectiveDept !== undefined && g.groupId !== effectiveDept) return false
      if (searchNeedle) {
        if (g.text.toLowerCase().includes(searchNeedle)) return true
        if (g.store && g.store.toLowerCase().includes(searchNeedle)) return true
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
  // Per-store active counts include items with no store tag, because
  // tapping the store pill also surfaces those (see `filteredItems`).
  // The count answers "how many items will I see if I tap this pill?"
  // rather than "how many are tagged exactly this store?".
  const perStoreActiveCount = useMemo(() => {
    const m = new Map<string, number>()
    // Seed every configured store with 0 so untagged-only-stores still
    // appear with a count, then add Any items at the end.
    for (const s of configuredStores) m.set(s, 0)
    let anyStoreActive = 0
    for (const it of groceries) {
      if (it.checked) continue
      if (!it.store) {
        anyStoreActive += 1
      } else if (m.has(it.store)) {
        m.set(it.store, (m.get(it.store) ?? 0) + 1)
      }
    }
    if (anyStoreActive > 0) {
      for (const s of m.keys()) m.set(s, (m.get(s) ?? 0) + anyStoreActive)
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

  // Same idiom as the Todos FilterBar: All + each pinned store (in
  // pin order) + the currently active store when it's neither All nor
  // already pinned (so the active filter is always visible). Hidden
  // stores never appear here; they live in Manage Filter.
  const pillStores = useMemo(() => {
    const visible = configuredStores.filter((s) => !hiddenStores.includes(s))
    const pinned = pinnedStores.filter((s) => visible.includes(s))
    const out: string[] = [...pinned]
    if (
      activeStore !== undefined &&
      visible.includes(activeStore) &&
      !out.includes(activeStore)
    ) {
      out.push(activeStore)
    }
    return out
  }, [configuredStores, hiddenStores, pinnedStores, activeStore])

  // Pinned dept ids that still resolve to a visible (non-hidden) group.
  // Stale ids (deleted / hidden) drop silently — the pill row should
  // never render a phantom dept.
  const pillDepts = useMemo(() => {
    const visibleIds = new Set(visibleGroups.map((g) => g.id))
    return pinnedDepts.filter((id) => visibleIds.has(id))
  }, [pinnedDepts, visibleGroups])

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
      {/* Store filter row — mirrors the Todos FilterBar chrome: a funnel
          button on the left, then a horizontal scrolling row of pills.
          The first pill is always "All" (clears every filter). Pinned
          stores follow in pin order. When a dept filter is set, an
          extra dept pill renders trailing so the user sees the
          narrowing and can tap to clear. */}
      <View style={styles.pillsRow}>
        <TouchableOpacity
          onPress={openStoreSwitcher}
          style={styles.funnelBtn}
          hitSlop={8}
          accessibilityLabel="Manage stores"
          accessibilityRole="button"
        >
          <FunnelIcon size={16} color={theme.label2} strokeWidth={2} />
          <Text style={styles.funnelLabel} maxFontSizeMultiplier={1.3}>Filter</Text>
        </TouchableOpacity>
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
          <StorePill
            label="All"
            count={allActiveCount}
            active={activeStore === undefined && effectiveDept === undefined}
            pinned={false}
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
          {activeDeptGroup && !pinnedDepts.includes(activeDeptGroup.id) && (
            <StorePill
              key={`dept-active-${activeDeptGroup.id}`}
              label={activeDeptGroup.label}
              count={activeDeptCount}
              active
              pinned={false}
              deptIcon={
                <GroceryIcon
                  kind="department"
                  id={activeDeptGroup.id}
                  customIcon={activeDeptGroup.icon}
                  customColor={activeDeptGroup.color}
                  size={14}
                  color="#fff"
                />
              }
              onPress={() => onSetActiveDept(undefined)}
              onLongPress={() =>
                promptPin(activeDeptGroup.id, 'dept', activeDeptGroup.label)
              }
              onLayoutX={(x) => {
                pillXRef.current[`dept-${activeDeptGroup.id}`] = x
              }}
              styles={styles}
            />
          )}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
      onClose={() => setStorePickerOpen(false)}
    />
    <GroceryComposeSheet
      visible={composeOpen}
      groups={groceryGroups}
      stores={configuredStores.filter((s) => !hiddenStores.includes(s))}
      initialStore={activeStore}
      initialDepartmentId={effectiveDept}
      onAdd={({ text, groupId, store }) => onAdd({ text, groupId, store })}
      onClose={() => setComposeOpen(false)}
    />
    <Fab
      onPress={() => setComposeOpen(true)}
      accessibilityLabel="Add an item"
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
}: StorePillProps) {
  const pinColor =
    pinIconColor ?? (active ? '#fff' : (styles.storePillLabel.color as string))
  return (
    <TouchableOpacity
      style={[styles.storePill, active && styles.storePillActive]}
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
        onPress={onOpenEdit}
        onLongPress={onOpenEdit}
        accessibilityRole="button"
        accessibilityLabel={`${item.text}. Tap to edit.`}
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
        {item.store && (
          <Text style={styles.rowStore} numberOfLines={1}>
            {item.store}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    // Filter row — mirrors the Todos FilterBar idiom: a funnel button
    // on the left, then a horizontal scrolling pill row.
    pillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      paddingTop: 8,
      paddingBottom: 8,
    },
    funnelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    funnelLabel: { fontSize: 12, color: c.label2, fontWeight: '600' },
    pillsScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: 16,
      paddingLeft: 4,
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
    scroll: { paddingBottom: 96 },
    groupBlock: {
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
