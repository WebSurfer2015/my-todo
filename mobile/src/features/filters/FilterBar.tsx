import React, { useEffect, useMemo, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import { Pin } from 'lucide-react-native'
import {
  Filter,
  Priority,
  PRIORITY_COLORS,
  StatusFilter,
  categoryIdFromFilter,
  isCategoryFilter,
  isPriorityFilter,
  priorityFromFilter,
} from '../../core-bindings/types'
import { CategoryDef, categoryLabel } from '../../core-bindings/categories'
import CategoryIcon from '../../ui/CategoryIcon'
import StatusIcon, { statusColor } from '../../ui/StatusIcon'
import PriorityBars from '../../ui/PriorityBars'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'

interface Props {
  filter: Filter
  /** Multi-select source of truth. Each entry renders as a "selected"
   * pill — tapping removes it from the selection (calls
   * onToggleFilter). Pinned-but-not-selected filters render as
   * "extra" pills — tapping adds them. Empty array = "All"
   * semantics; the All pill becomes the only active visual. */
  selectedFilters: Filter[]
  onToggleFilter: (f: Filter) => void
  /** Replace the entire selection in one shot. Used when activating
   * a pinned composite pill — we don't want N store updates from
   * toggling each constituent filter individually. */
  onSetFilters: (set: Filter[]) => void
  onClearFilters: () => void
  /** Profile.pinnedFilters — ordered list of pinned SETS. Each entry is
   * a Filter[] (single-element for individual pins, multi-element for
   * composite pills like "Done + Work"). Long-press toggles pin/unpin
   * for the long-pressed pill's set. Each pinned pill renders with a
   * small Pin icon next to its label. */
  pinnedFilters: Filter[][]
  onFilter: (f: Filter) => void
  /** Set-aware pin toggle. Pass a single-element array for individual
   * filter pinning, a multi-element array for composite pinning. */
  onPinFilter: (set: Filter[]) => void
  /** Tap-on-active-pill helper. Atomically pins `set` (if not already
   * pinned) and clears the selection, so the pill stays in the row
   * as a quick-switch shortcut even after deactivation. */
  onKeepAndClearFilter: (set: Filter[]) => void
  onOpenSheet: () => void
  categories: CategoryDef[]
  orderedVisibleStatuses: { id: StatusFilter; label: string }[]
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number; notDo: number }
  byCategory: Record<string, number>
  /** Total task counts per priority, used to badge priority pills.
   * Items with no priority don't count toward any bucket. */
  byPriority: Record<Priority, number>
  /** Count of todos matching the AND/OR combined active filter set.
   * Used to badge the composite pill when 2+ filters are selected
   * (e.g., "Done + Work · 3"). Per-filter counts (`systemCounts`,
   * `byCategory`, `byPriority`) are independent and don't reflect the
   * intersection across type groups. */
  combinedCount?: number
  /** Active (unchecked) grocery item count for the Groceries pill badge.
   * The Groceries pill is the leftmost pill in the row when the user has
   * the feature enabled (profile.groceriesEnabled !== false). */
  groceriesActiveCount?: number
  /** When false, hides the Groceries pill entirely (used when the user
   * has turned the feature off in Settings). Defaults to true. */
  groceriesEnabled?: boolean
  /** When > 0, shows a tiny cairn + count at the right end so the user
   * keeps a sense of progress when scrolled past the full pebble strip. */
  scrolledPebbleCount?: number
}

interface ResolvedPill {
  filter: Filter
  icon: React.ReactNode | null
  label: string
  count: number
  /** Status/category accent color, used by the icon and (when pinned)
   * the pin glyph so the cluster reads as one visual unit. */
  color: string
}

/**
 * Filter row: funnel icon (opens the Configure sheet), the always-present
 * "All" pill, every pinned filter as a quick-access pill, and at most one
 * trailing pill for the currently selected filter when it's neither All
 * nor in the pinned list. Long-press any pill to pin/unpin.
 */
export default function FilterBar({
  filter,
  selectedFilters,
  onToggleFilter,
  onSetFilters,
  onClearFilters,
  pinnedFilters,
  onFilter,
  onPinFilter,
  onKeepAndClearFilter,
  onOpenSheet,
  categories,
  orderedVisibleStatuses,
  systemCounts,
  byCategory,
  byPriority,
  combinedCount = 0,
  groceriesActiveCount = 0,
  groceriesEnabled = true,
  scrolledPebbleCount = 0,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Auto-scroll the pill row so the currently-active pill is in view.
  // The trailing "extra" pill for an unpinned current filter sits at the
  // end of a row that can grow longer than the viewport once enough pins
  // accumulate; this keeps it visible without the user having to swipe.
  const scrollRef = useRef<ScrollView>(null)
  const pillXRef = useRef<Record<string, number>>({})
  // When filter or pinned set changes, the scroll's pill order reshuffles
  // (active pill is rendered first, others shift). Cached positions from
  // the prior layout are now stale, so blow them away — the onLayout
  // handler below will re-populate AND scroll to the active pill once
  // the new layout is measured. Without this invalidation, the Done pill
  // ends up clipped after a tile-tap nav-back because we scroll to its
  // old (post-active-shift) x. Tab navigator keeps the screen mounted,
  // so this effect IS the only place that resets pillXRef.
  useEffect(() => {
    pillXRef.current = {}
    if (selectedFilters.length === 0) {
      // No filters selected → rewind the scroll to the start so the
      // user lands cleanly on the "All" pill.
      scrollRef.current?.scrollTo({ x: 0, animated: true })
    }
  }, [selectedFilters, pinnedFilters])

  // Resolve display info (icon/label/count/color) for any Filter. Returns
  // null when the underlying status is hidden or the category was deleted.
  function resolvePill(f: Filter): ResolvedPill | null {
    if (f === 'groceries') {
      return {
        filter: 'groceries',
        icon: null,
        label: t.filters.groceries,
        count: groceriesActiveCount,
        color: theme.primary,
      }
    }
    if (f === 'all') {
      return {
        filter: 'all',
        icon: null,
        label: t.filters.all,
        count: systemCounts.all,
        color: theme.primary,
      }
    }
    if (isCategoryFilter(f)) {
      const id = categoryIdFromFilter(f)
      const c = categories.find((x) => x.id === id)
      if (!c) return null
      return {
        filter: f,
        icon: <CategoryIcon icon={c.icon} size={15} color={c.color} />,
        label: categoryLabel(c, t),
        count: byCategory[c.id] ?? 0,
        color: c.color,
      }
    }
    if (isPriorityFilter(f)) {
      const p = priorityFromFilter(f)
      return {
        filter: f,
        icon: <PriorityBars level={p} size={14} />,
        label: t.priority[p],
        count: byPriority[p] ?? 0,
        color: PRIORITY_COLORS[p],
      }
    }
    const s = orderedVisibleStatuses.find((x) => x.id === f)
    if (!s) return null
    // Carried Over (overdue) is calm-design-sensitive: surfacing a
    // running count on the pill turns it into a guilt counter for
    // users who already feel behind. The actual count is still
    // visible in the section header inside the bucket and in the
    // Defer modal, so we omit it here.
    const count = s.id === 'overdue' ? 0 : (systemCounts[s.id] ?? 0)
    return {
      filter: f,
      icon: <StatusIcon id={s.id} size={15} color={statusColor(s.id, theme)} />,
      label: s.label,
      count,
      color: statusColor(s.id, theme),
    }
  }

  // Set helpers — order-insensitive equality so ['done','cat:work']
  // and ['cat:work','done'] are treated as the same pinned entry.
  const setKey = (set: Filter[]) => [...set].sort().join(' ')
  const isSetPinned = (set: Filter[]) => {
    const key = setKey(set)
    return pinnedFilters.some((s) => setKey(s) === key)
  }

  // Long-press any pill → action sheet with two options:
  //   • Pin / Unpin (toggles the pinned state for THIS pill's set)
  //   • Remove (unpins the set AND clears the selection if it
  //     matches — pill goes away from the strip entirely)
  function promptPin(targetSet: Filter[], label: string) {
    const pinned = isSetPinned(targetSet)
    const pinLabel = pinned ? t.unpin : t.pin
    const removeLabel = 'Remove'
    const selKey = setKey(selectedFilters)
    const tgtKey = setKey(targetSet)
    const onRemove = () => {
      if (pinned) onPinFilter(targetSet)
      if (selKey === tgtKey) onClearFilters()
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [pinLabel, removeLabel, t.cancel],
          title: label,
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
        },
        (i) => {
          if (i === 0) onPinFilter(targetSet)
          else if (i === 1) onRemove()
        },
      )
    } else {
      Alert.alert(label, undefined, [
        { text: pinLabel, onPress: () => onPinFilter(targetSet) },
        { text: removeLabel, style: 'destructive', onPress: onRemove },
        { text: t.cancel, style: 'cancel' },
      ])
    }
  }

  // Tap-on-active-pill delegates to the store's atomic
  // keepAndClearFilter — it pins-if-missing and clears in one
  // setProfile / setFiltersState pair, reading the live profile
  // inside the functional setter so we don't depend on whether
  // `pinnedFilters` props have re-flowed yet.
  const keepAndClear = (activeSet: Filter[]) => onKeepAndClearFilter(activeSet)

  // Build the scrollable pill order. The "All" pill is intentionally
  // rendered OUTSIDE this list (pinned to the left of the row, next to
  // the funnel) so it's always visible no matter how far the user has
  // scrolled through their pinned filters.
  //
  // Each pill in the row represents a Filter[] set. Single-filter sets
  // render like a normal single pill; multi-filter sets render as a
  // composite ("Done + Work"). The active selection is highlighted —
  // if it matches a pinned set, that pinned pill flips to active in
  // place; if it doesn't match any pinned set, an additional transient
  // pill is rendered at the front.
  const allPill = resolvePill('all')!
  // Groceries pill removed in v1.3 — Groceries is its own bottom tab
  // now. The `groceries` filter value + resolver stay for back-compat
  // with any persisted state; they just don't render as a pill.

  interface PillView {
    set: Filter[]
    label: string
    /** Solo count when the set has exactly one filter; combinedCount
     * when the set is the active selection (single or composite);
     * undefined for inactive multi-filter pinned pills (we don't pay
     * for a deriveState per pinned set). */
    count: number | undefined
    pinned: boolean
    active: boolean
  }

  const selectedKey = setKey(selectedFilters)
  const hasActiveSelection = selectedFilters.length > 0
  // While a multi-select composite is active, hide pinned single-
  // filter pills whose filter is already a constituent of the
  // composite — the composite already represents them, so showing
  // "Done + Work" alongside individual "Done" and "Work" pills is
  // redundant. Pinned sets that aren't a subset of the active
  // selection still render as quick-switch shortcuts.
  const inMultiSelect = selectedFilters.length >= 2
  const activeSet = inMultiSelect ? new Set<string>(selectedFilters) : null

  const pinnedViews: PillView[] = []
  for (const set of pinnedFilters) {
    const resolved = set
      .filter((f) => f !== 'all' && f !== 'groceries')
      .map((f) => resolvePill(f))
      .filter((p): p is ResolvedPill => p != null)
    if (resolved.length === 0) continue
    // Skip if every filter in this pinned set is already covered by
    // the active composite. (Single-filter pinned pills land here
    // when their lone filter is part of the composite.)
    if (activeSet && set.every((f) => activeSet.has(f))) continue
    const active = setKey(set as Filter[]) === selectedKey && hasActiveSelection
    const label = resolved.map((p) => p.label).join(' + ')
    const count =
      active
        ? combinedCount
        : resolved.length === 1
          ? resolved[0].count
          : undefined
    pinnedViews.push({
      set: set as Filter[],
      label,
      count,
      pinned: true,
      active,
    })
  }

  const activeMatchesPinned = pinnedViews.some((v) => v.active)
  const transientView: PillView | null =
    hasActiveSelection && !activeMatchesPinned
      ? (() => {
          const resolved = selectedFilters
            .filter((f) => f !== 'all' && f !== 'groceries')
            .map((f) => resolvePill(f))
            .filter((p): p is ResolvedPill => p != null)
          if (resolved.length === 0) return null
          return {
            set: selectedFilters,
            label: resolved.map((p) => p.label).join(' + '),
            count: combinedCount,
            pinned: false,
            active: true,
          }
        })()
      : null

  // onOpenSheet kept in the prop signature (parent still passes it)
  // but the funnel button moved out of FilterBar and into AppHeader
  // on 2026-05-19. Reference it here so noUnusedLocals stays happy
  // on the lint pass without us having to thread a removal through
  // every call site.
  void onOpenSheet

  // Hide the entire filter row when there's nothing meaningful to
  // render: no active selection and no pinned pills.
  if (!hasActiveSelection && pinnedViews.length === 0) return null

  return (
    <View style={styles.row}>
      {/* "All" pill — always shown as long as the filter row is
          rendered (i.e., something else is in the row). Two modes:
            • Nothing selected → renders as ACTIVE (filled): "you
              are here, showing everything." Tap is a no-op.
            • Something selected → renders as the CLEAR affordance.
              Tap calls onClearFilters.
          No long-press menu — All is a system pill, never pinnable
          or removable. */}
      {(() => {
        const isOnAll = selectedFilters.length === 0
        return (
          <TouchableOpacity
            style={[
              styles.pill,
              isOnAll ? styles.pillActive : styles.pillExtra,
            ]}
            onPress={() => onClearFilters()}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: isOnAll }}
            accessibilityLabel={
              isOnAll
                ? `${allPill.label}, showing everything`
                : `${allPill.label} — clear the current selection`
            }
          >
            <Text
              style={[styles.pillLabel, isOnAll && styles.pillLabelActive]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {allPill.label}
            </Text>
            {allPill.count > 0 && (
              <Text
                style={[styles.pillCount, isOnAll && styles.pillCountActive]}
                maxFontSizeMultiplier={1.3}
              >
                {allPill.count}
              </Text>
            )}
          </TouchableOpacity>
        )
      })()}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsScroll}
        keyboardShouldPersistTaps="handled"
      >
        {(transientView ? [transientView, ...pinnedViews] : pinnedViews).map(
          (view) => {
            const { set, label, count, pinned, active } = view
            const key = pinned ? `pin-${setKey(set)}` : '__transient'
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.pill,
                  active ? styles.pillActive : pinned ? styles.pillSticky : styles.pillExtra,
                ]}
                onLayout={(e) => {
                  const x = e.nativeEvent.layout.x
                  pillXRef.current[key] = x
                  if (active) {
                    scrollRef.current?.scrollTo({
                      x: Math.max(0, x - 16),
                      animated: true,
                    })
                  }
                }}
                onPress={() => {
                  // Active pill (whether pinned-and-matched or transient):
                  //   tap clears, and we pin first if it wasn't already
                  //   pinned so the pill stays in the row.
                  // Inactive pinned pill: tap activates that pinned set.
                  if (active) keepAndClear(set)
                  else onSetFilters(set)
                }}
                onLongPress={() => promptPin(set, label)}
                delayLongPress={350}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label}${count != null ? `, ${count}` : ''}${active ? ', selected — tap to clear' : ', tap to apply'}${pinned ? ', pinned' : ''}`}
                accessibilityHint="Long-press for Pin or Remove"
              >
                {pinned && (
                  <Pin
                    size={10}
                    color={active ? '#fff' : theme.label3}
                    strokeWidth={2.5}
                  />
                )}
                <Text
                  style={[styles.pillLabel, active && styles.pillLabelActive]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  {label}
                </Text>
                {count != null && count > 0 && (
                  <Text
                    style={[styles.pillCount, active && styles.pillCountActive]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            )
          },
        )}
      </ScrollView>

      {/* The trailing CairnGlyph hint was removed — the pebble strip
          now lives inside the same sticky container as this filter row
          (see App.tsx stickyHeaderIndices), so a duplicate mini cairn
          here is redundant. scrolledPebbleCount kept on the props
          shape for back-compat but no longer rendered. */}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    iconBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderRadius: 100,
    },
    iconLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.label2,
      letterSpacing: -0.16,
    },
    pillsScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingRight: 4,
    },
    pill: {
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
    pillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    pillSticky: {
      // Inactive pinned pill — visible but de-emphasized.
      backgroundColor: c.card,
      borderColor: c.border,
    },
    pillExtra: {
      // Currently-selected-but-not-pinned filter — mint outline on the
      // default card background, distinct from the filled `pillActive`
      // (filled mint + white text). Reads as "candidate" rather than
      // "canonical default."
      backgroundColor: c.card,
      borderColor: c.primary,
      borderWidth: 1.5,
    },
    pillLabel: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.label,
      maxWidth: 180,
    },
    pillLabelActive: { color: '#fff' },
    // Count chip — bumped up one weight step + tabular-nums so wide
    // counts (e.g. "12") align consistently next to the label.
    pillCount: {
      fontSize: 12,
      fontWeight: '700',
      color: c.label2,
      fontVariant: ['tabular-nums'],
      marginLeft: 2,
    },
    pillCountActive: { color: 'rgba(255,255,255,0.95)' },
    pebbleHint: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 8,
    },
  })
}
