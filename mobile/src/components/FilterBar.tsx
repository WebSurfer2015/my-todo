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
} from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import CategoryIcon from './CategoryIcon'
import StatusIcon, { statusColor } from './StatusIcon'
import PriorityBars from './PriorityBars'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  filter: Filter
  /** Multi-select source of truth. Each entry renders as a "selected"
   * pill — tapping removes it from the selection (calls
   * onToggleFilter). Pinned-but-not-selected filters render as
   * "extra" pills — tapping adds them. Empty array = "All"
   * semantics; the All pill becomes the only active visual. */
  selectedFilters: Filter[]
  onToggleFilter: (f: Filter) => void
  onClearFilters: () => void
  /** Profile.pinnedFilters — ordered list of quick-access pills the user
   * has pinned. Long-pressing any pill toggles its pin status. Each pinned
   * pill renders with a small Pin icon next to its label. */
  pinnedFilters: Filter[]
  onFilter: (f: Filter) => void
  onPinFilter: (f: Filter) => void
  onOpenSheet: () => void
  categories: CategoryDef[]
  orderedVisibleStatuses: { id: StatusFilter; label: string }[]
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number }
  byCategory: Record<string, number>
  /** Total task counts per priority, used to badge priority pills.
   * Items with no priority don't count toward any bucket. */
  byPriority: Record<Priority, number>
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
  onClearFilters,
  pinnedFilters,
  onFilter,
  onPinFilter,
  onOpenSheet,
  categories,
  orderedVisibleStatuses,
  systemCounts,
  byCategory,
  byPriority,
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

  // Long-press any pill → action sheet to pin or unpin it as a quick-access
  // pill in the filter bar. Toggle based on current pin state.
  function promptPin(target: Filter, label: string) {
    const isPinned = pinnedFilters.includes(target)
    const actionLabel = isPinned ? t.unpin : t.pin
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [actionLabel, t.cancel], title: label, cancelButtonIndex: 1 },
        (i) => { if (i === 0) onPinFilter(target) },
      )
    } else {
      Alert.alert(label, undefined, [
        { text: actionLabel, onPress: () => onPinFilter(target) },
        { text: t.cancel, style: 'cancel' },
      ])
    }
  }

  // Build the scrollable pill order. The "All" pill is intentionally
  // rendered OUTSIDE this list (pinned to the left of the row, next to
  // the funnel) so it's always visible no matter how far the user has
  // scrolled through their pinned filters.
  //
  // Multi-select semantics: every entry in `selectedFilters` renders
  // as an "active" pill at the front of the row (tap to deselect via
  // onToggleFilter). Pinned filters that aren't currently selected
  // render after as "extra" pills (tap to add). Same long-press →
  // pin/unpin contract as before.
  const visiblePills: { pill: ResolvedPill; pinned: boolean; selected: boolean }[] = []
  const allPill = resolvePill('all')!
  // Groceries pill removed in v1.3 — Groceries is its own bottom tab
  // now. The `groceries` filter value + resolver stay for back-compat
  // with any persisted state; they just don't render as a pill.

  // Selected filters first — preserve the order the user picked them
  // in (matches the order returned by the multi-select sheet, which
  // tracks insertion order).
  for (const f of selectedFilters) {
    if (f === 'all' || f === 'groceries') continue
    const p = resolvePill(f)
    if (p) {
      visiblePills.push({
        pill: p,
        pinned: pinnedFilters.includes(f),
        selected: true,
      })
    }
  }
  // Pinned-but-not-selected filters follow as quick-add shortcuts.
  for (const f of pinnedFilters) {
    if (f === 'all' || f === 'groceries' || selectedFilters.includes(f)) continue
    const p = resolvePill(f)
    if (p) visiblePills.push({ pill: p, pinned: true, selected: false })
  }

  // onOpenSheet kept in the prop signature (parent still passes it)
  // but the funnel button moved out of FilterBar and into AppHeader
  // on 2026-05-19. Reference it here so noUnusedLocals stays happy
  // on the lint pass without us having to thread a removal through
  // every call site.
  void onOpenSheet

  // Hide the entire filter row when there's nothing meaningful to
  // render: no selected filters AND no pinned pills to surface.
  // Removes a useless strip from the empty-state view.
  if (selectedFilters.length === 0 && visiblePills.length === 0) return null

  return (
    <View style={styles.row}>
      {/* "All" pill — always shown as long as the filter row is
          rendered (i.e., something else is in the row). Two modes:
            • Nothing selected → renders as ACTIVE (filled), reading
              as "you are here: showing everything." Tap is a no-op
              (already on All); long-press still pins/unpins.
            • Something selected → renders as the CLEAR affordance
              (extra style). Tap calls onClearFilters.
          The earlier "hide unless something selected" rule made the
          pinned-only state read as "where do I get back to All?" */}
      {(() => {
        const isOnAll = selectedFilters.length === 0
        return (
          <TouchableOpacity
            style={[
              styles.pill,
              isOnAll ? styles.pillActive : pinnedFilters.includes('all') ? styles.pillSticky : styles.pillExtra,
            ]}
            onPress={() => onClearFilters()}
            onLongPress={() => promptPin(allPill.filter, allPill.label)}
            delayLongPress={350}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: isOnAll }}
            accessibilityLabel={
              isOnAll
                ? `${allPill.label}, showing everything`
                : `${allPill.label} — clear ${selectedFilters.length} selected filter${selectedFilters.length === 1 ? '' : 's'}`
            }
            accessibilityHint="Long-press to pin or unpin"
          >
            {pinnedFilters.includes('all') && (
              <Pin size={10} color={isOnAll ? '#fff' : theme.label3} strokeWidth={2.5} />
            )}
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
        {visiblePills.map(({ pill, pinned, selected }) => {
          // Selected (in the multi-select set): filled primary
          //   "current" look. Tap removes (toggle off).
          // Pinned-but-not-selected: dim shortcut. Tap adds (toggle on).
          // Same long-press → pin/unpin contract for both.
          return (
            <TouchableOpacity
              key={pill.filter}
              style={[
                styles.pill,
                selected ? styles.pillActive : pinned ? styles.pillSticky : styles.pillExtra,
              ]}
              onLayout={(e) => {
                const x = e.nativeEvent.layout.x
                pillXRef.current[pill.filter] = x
                // Auto-scroll to the first selected pill so the user
                // always sees their current scope without swiping.
                if (selected && selectedFilters[0] === pill.filter) {
                  scrollRef.current?.scrollTo({
                    x: Math.max(0, x - 16),
                    animated: true,
                  })
                }
              }}
              onPress={() => onToggleFilter(pill.filter)}
              onLongPress={() => promptPin(pill.filter, pill.label)}
              delayLongPress={350}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${pill.label}, ${pill.count}${selected ? ', selected — tap to remove' : ', tap to add'}${pinned ? ', pinned' : ''}`}
              accessibilityHint="Long-press to pin or unpin"
            >
              {pinned && (
                <Pin
                  size={10}
                  color={selected ? '#fff' : theme.label3}
                  strokeWidth={2.5}
                />
              )}
              {pill.icon}
              <Text
                style={[styles.pillLabel, selected && styles.pillLabelActive]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {pill.label}
              </Text>
              {pill.count > 0 && (
                <Text
                  style={[styles.pillCount, selected && styles.pillCountActive]}
                  maxFontSizeMultiplier={1.3}
                >
                  {pill.count}
                </Text>
              )}
            </TouchableOpacity>
          )
        })}
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
