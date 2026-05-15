import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Filter as FunnelIcon } from 'lucide-react-native'
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
  onFilter: (f: Filter) => void
  onOpenSheet: () => void
  categories: CategoryDef[]
  orderedVisibleStatuses: { id: StatusFilter; label: string }[]
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number }
  byCategory: Record<string, number>
}

/**
 * Three-piece filter row: funnel icon (opens the combined picker sheet),
 * the always-present "All" pill (taps clear any filter back to default),
 * and a sticky "last selected" pill that surfaces the most recent
 * non-All filter. When the active filter matches the sticky pill, it
 * renders highlighted; otherwise it stays visible (so the user can
 * one-tap re-apply the previous filter) but reads as inactive.
 */
export default function FilterBar({
  filter,
  onFilter,
  onOpenSheet,
  categories,
  orderedVisibleStatuses,
  systemCounts,
  byCategory,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Remember the most recently picked non-All filter. Stays visible as a
  // dim pill after tapping "All" so the user can re-apply it without
  // reopening the sheet.
  const [stickyFilter, setStickyFilter] = useState<Filter | null>(null)
  useEffect(() => {
    if (filter !== 'all') setStickyFilter(filter)
  }, [filter])

  // Resolve display info (icon/label/color/count) for the sticky pill's
  // target filter. If the underlying category was deleted or the status
  // was hidden since we last saw it, fall back to null and don't render.
  function resolveFilter(f: Filter): {
    icon: React.ReactNode
    label: string
    color: string
    count: number
  } | null {
    if (f === 'all') return null
    if (isCategoryFilter(f)) {
      const id = categoryIdFromFilter(f)
      const c = categories.find((x) => x.id === id)
      if (!c) return null
      return {
        icon: <CategoryIcon icon={c.icon} size={15} color={c.color} />,
        label: categoryLabel(c, t),
        color: c.color,
        count: byCategory[c.id] ?? 0,
      }
    }
    const s = orderedVisibleStatuses.find((x) => x.id === f)
    if (!s) return null
    return {
      icon: <StatusIcon id={s.id} size={15} color={statusColor(s.id, theme)} />,
      label: s.label,
      color: statusColor(s.id, theme),
      count: systemCounts[s.id] ?? 0,
    }
  }

  const stickyResolved = stickyFilter ? resolveFilter(stickyFilter) : null
  const stickyActive = !!stickyFilter && filter === stickyFilter
  const allActive = filter === 'all'

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onOpenSheet}
        style={styles.iconBtn}
        hitSlop={8}
        accessibilityLabel="Filter"
        accessibilityRole="button"
      >
        <FunnelIcon size={18} color={theme.label2} strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.pill, allActive && styles.pillActive]}
        onPress={() => onFilter('all')}
        activeOpacity={0.75}
      >
        <Text style={[styles.pillLabel, allActive && styles.pillLabelActive]}>
          {t.filters.all}
        </Text>
        {systemCounts.all > 0 && (
          <Text style={[styles.pillCount, allActive && styles.pillCountActive]}>
            {systemCounts.all}
          </Text>
        )}
      </TouchableOpacity>

      {stickyResolved && stickyFilter && (
        <TouchableOpacity
          style={[
            styles.pill,
            stickyActive ? styles.pillSelected : styles.pillSticky,
          ]}
          onPress={() => onFilter(stickyFilter)}
          activeOpacity={0.75}
        >
          {stickyResolved.icon}
          <Text
            style={[
              styles.pillLabel,
              stickyActive ? styles.pillLabelSelected : null,
            ]}
            numberOfLines={1}
          >
            {stickyResolved.label}
          </Text>
          {stickyResolved.count > 0 && (
            <Text
              style={[
                styles.pillCount,
                stickyActive ? styles.pillCountSelected : null,
              ]}
            >
              {stickyResolved.count}
            </Text>
          )}
        </TouchableOpacity>
      )}
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
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
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
    pillSelected: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    pillSticky: {
      // Inactive "last selected" — visible but de-emphasized so the user
      // can re-apply it with one tap without losing visual hierarchy.
      backgroundColor: c.card,
      borderColor: c.border,
      opacity: 0.85,
    },
    pillLabel: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.label,
      maxWidth: 140,
    },
    pillLabelActive: { color: '#fff' },
    pillLabelSelected: { color: c.primary },
    pillCount: {
      fontSize: 11,
      fontWeight: '700',
      color: c.label3,
      fontVariant: ['tabular-nums'],
      marginLeft: 2,
    },
    pillCountActive: { color: 'rgba(255,255,255,0.9)' },
    pillCountSelected: { color: c.primary, opacity: 0.8 },
  })
}
