import React, { useEffect, useMemo, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import { Pin } from 'lucide-react-native'
import {
  Filter,
  StatusFilter,
  categoryIdFromFilter,
  isCategoryFilter,
} from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import CategoryIcon from './CategoryIcon'
import StatusIcon, { statusColor } from './StatusIcon'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  filter: Filter
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
  pinnedFilters,
  onFilter,
  onPinFilter,
  onOpenSheet,
  categories,
  orderedVisibleStatuses,
  systemCounts,
  byCategory,
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
    if (filter === 'all') {
      // The All pill lives OUTSIDE the scrollable row (pinned to the
      // left next to the funnel), so its x never lands in pillXRef.
      // Picking All should just rewind the scroll to the start.
      scrollRef.current?.scrollTo({ x: 0, animated: true })
    }
  }, [filter, pinnedFilters])

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
  const visiblePills: { pill: ResolvedPill; pinned: boolean }[] = []
  const allPill = resolvePill('all')!
  // Groceries pill removed in v1.3 — Groceries is its own bottom tab
  // now. The `groceries` filter value + resolver stay for back-compat
  // with any persisted state; they just don't render as a pill.

  // The selected filter always sits FIRST in the scroll row (right
  // next to the anchored "All" pill), regardless of whether it's
  // pinned. That way the user always sees their current scope
  // without scrolling, and the leftmost cluster is "All ⟷ active".
  // Other pinned filters follow.
  if (filter !== 'all' && filter !== 'groceries') {
    const sel = resolvePill(filter)
    if (sel) {
      visiblePills.push({
        pill: sel,
        pinned: pinnedFilters.includes(filter),
      })
    }
  }
  for (const f of pinnedFilters) {
    if (f === 'all' || f === 'groceries' || f === filter) continue
    const p = resolvePill(f)
    if (p) visiblePills.push({ pill: p, pinned: true })
  }

  // onOpenSheet kept in the prop signature (parent still passes it)
  // but the funnel button moved out of FilterBar and into AppHeader
  // on 2026-05-19. Reference it here so noUnusedLocals stays happy
  // on the lint pass without us having to thread a removal through
  // every call site.
  void onOpenSheet

  return (
    <View style={styles.row}>
      {/* "All" pill stays anchored to the left, outside the scroll —
          so the user can always tap it to reset, no matter how many
          pinned pills crowd the right side. */}
      <TouchableOpacity
        style={[
          styles.pill,
          filter === allPill.filter
            ? styles.pillActive
            : pinnedFilters.includes('all')
              ? styles.pillSticky
              : styles.pillExtra,
        ]}
        onPress={() => onFilter(allPill.filter)}
        onLongPress={() => promptPin(allPill.filter, allPill.label)}
        delayLongPress={350}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ selected: filter === allPill.filter }}
        accessibilityLabel={`${allPill.label}, ${allPill.count}${filter === allPill.filter ? ', selected' : ''}`}
        accessibilityHint="Long-press to pin or unpin"
      >
        {pinnedFilters.includes('all') && (
          <Pin
            size={10}
            color={filter === allPill.filter ? '#fff' : theme.label3}
            strokeWidth={2.5}
          />
        )}
        <Text
          style={[
            styles.pillLabel,
            filter === allPill.filter && styles.pillLabelActive,
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {allPill.label}
        </Text>
        {allPill.count > 0 && (
          <Text
            style={[
              styles.pillCount,
              filter === allPill.filter && styles.pillCountActive,
            ]}
            maxFontSizeMultiplier={1.3}
          >
            {allPill.count}
          </Text>
        )}
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsScroll}
        keyboardShouldPersistTaps="handled"
      >
        {visiblePills.map(({ pill, pinned }) => {
          const active = filter === pill.filter
          // Pinned-and-active: filled primary (the canonical "current" look).
          // Pinned-not-active: dim shortcut, gentle accent color.
          // Not-pinned-and-active (the "extra" trailing pill): soft selected.
          return (
            <TouchableOpacity
              key={pill.filter}
              style={[
                styles.pill,
                active ? styles.pillActive : pinned ? styles.pillSticky : styles.pillExtra,
              ]}
              onLayout={(e) => {
                const x = e.nativeEvent.layout.x
                pillXRef.current[pill.filter] = x
                // Auto-scroll fires HERE (instead of from a useEffect) so
                // we always use the freshly measured x rather than a
                // stale cached one — see the pillXRef invalidation
                // comment above for why.
                if (pill.filter === filter) {
                  scrollRef.current?.scrollTo({
                    x: Math.max(0, x - 16),
                    animated: true,
                  })
                }
              }}
              onPress={() => onFilter(pill.filter)}
              onLongPress={() => promptPin(pill.filter, pill.label)}
              delayLongPress={350}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${pill.label}, ${pill.count}${active ? ', selected' : ''}${pinned ? ', pinned' : ''}`}
              accessibilityHint="Long-press to pin or unpin"
            >
              {pinned && (
                <Pin
                  size={10}
                  color={active ? '#fff' : theme.label3}
                  strokeWidth={2.5}
                />
              )}
              {pill.icon}
              <Text
                style={[styles.pillLabel, active && styles.pillLabelActive]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {pill.label}
              </Text>
              {pill.count > 0 && (
                <Text
                  style={[styles.pillCount, active && styles.pillCountActive]}
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
