import React, { useMemo } from 'react'
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
 * and an optional "Selected" pill that surfaces the currently active
 * status or category filter.
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

  // Resolve display details for the currently selected non-All filter.
  let selected: {
    icon: React.ReactNode
    label: string
    color: string
    count: number
  } | null = null
  if (filter !== 'all') {
    if (isCategoryFilter(filter)) {
      const id = categoryIdFromFilter(filter)
      const c = categories.find((x) => x.id === id)
      if (c) {
        selected = {
          icon: <CategoryIcon icon={c.icon} size={15} color={c.color} />,
          label: categoryLabel(c, t),
          color: c.color,
          count: byCategory[c.id] ?? 0,
        }
      }
    } else {
      const s = orderedVisibleStatuses.find((x) => x.id === filter)
      if (s) {
        selected = {
          icon: <StatusIcon id={s.id} size={15} color={statusColor(s.id, theme)} />,
          label: s.label,
          color: statusColor(s.id, theme),
          count: systemCounts[s.id] ?? 0,
        }
      }
    }
  }

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

      {selected && (
        <TouchableOpacity
          style={[styles.pill, styles.pillSelected]}
          onPress={onOpenSheet}
          activeOpacity={0.75}
        >
          {selected.icon}
          <Text style={[styles.pillLabel, styles.pillLabelSelected]} numberOfLines={1}>
            {selected.label}
          </Text>
          {selected.count > 0 && (
            <Text style={[styles.pillCount, styles.pillCountSelected]}>
              {selected.count}
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
