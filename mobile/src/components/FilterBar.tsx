import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Filter as FunnelIcon, X } from 'lucide-react-native'
import {
  CompositeFilter,
  StatusFilter,
} from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import CategoryIcon from './CategoryIcon'
import StatusIcon, { statusColor } from './StatusIcon'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { CairnGlyph } from './PebbleStrip'

interface Props {
  compositeFilter: CompositeFilter
  onClearStatus: () => void
  onClearCategory: () => void
  onOpenSheet: () => void
  categories: CategoryDef[]
  orderedVisibleStatuses: { id: StatusFilter; label: string }[]
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number }
  byCategory: Record<string, number>
  /** When > 0, shows a tiny cairn + count at the right end so the user
   * keeps a sense of progress when scrolled past the full pebble strip. */
  scrolledPebbleCount?: number
}

/**
 * Three-piece filter row: funnel icon (opens the picker sheet to add a
 * status or category dimension), the always-present "All" anchor pill
 * (non-interactive — it indicates the base scope), and 0–2 dimensional
 * pills (1 status, 1 category) when those are set. Each dimensional
 * pill has an X to clear that dimension. Filtering is the AND of the
 * two dimensions; an unset dimension means "any".
 */
export default function FilterBar({
  compositeFilter,
  onClearStatus,
  onClearCategory,
  onOpenSheet,
  categories,
  orderedVisibleStatuses,
  systemCounts,
  byCategory,
  scrolledPebbleCount = 0,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const statusInfo = compositeFilter.status
    ? (() => {
        const s = orderedVisibleStatuses.find((x) => x.id === compositeFilter.status)
        if (!s) return null
        return {
          id: s.id,
          icon: <StatusIcon id={s.id} size={14} color={statusColor(s.id, theme)} />,
          label: s.label,
          count: systemCounts[s.id] ?? 0,
        }
      })()
    : null

  const categoryInfo = compositeFilter.categoryId
    ? (() => {
        const c = categories.find((x) => x.id === compositeFilter.categoryId)
        if (!c) return null
        return {
          icon: <CategoryIcon icon={c.icon} size={14} color={c.color} />,
          label: categoryLabel(c, t),
          color: c.color,
          count: byCategory[c.id] ?? 0,
        }
      })()
    : null

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onOpenSheet}
        style={styles.iconBtn}
        hitSlop={8}
        accessibilityLabel="Filter"
        accessibilityRole="button"
      >
        <FunnelIcon size={16} color={theme.label2} strokeWidth={2} />
        <Text style={styles.iconLabel} maxFontSizeMultiplier={1.3}>Filter</Text>
      </TouchableOpacity>

      <View
        style={styles.pillAnchor}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`All tasks, ${systemCounts.all}`}
      >
        <Text style={styles.pillLabelAnchor} maxFontSizeMultiplier={1.3}>
          {t.filters.all}
        </Text>
        {systemCounts.all > 0 && (
          <Text style={styles.pillCountAnchor} maxFontSizeMultiplier={1.3}>
            {systemCounts.all}
          </Text>
        )}
      </View>

      {statusInfo && (
        <TouchableOpacity
          style={styles.pillDim}
          onPress={onClearStatus}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Status filter ${statusInfo.label}, ${statusInfo.count}. Tap to clear.`}
        >
          {statusInfo.icon}
          <Text style={styles.pillLabelDim} numberOfLines={1}>
            {statusInfo.label}
          </Text>
          {statusInfo.count > 0 && (
            <Text style={styles.pillCountDim}>{statusInfo.count}</Text>
          )}
          <X size={12} color={theme.label3} strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {categoryInfo && (
        <TouchableOpacity
          style={styles.pillDim}
          onPress={onClearCategory}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Category filter ${categoryInfo.label}, ${categoryInfo.count}. Tap to clear.`}
        >
          {categoryInfo.icon}
          <Text style={styles.pillLabelDim} numberOfLines={1}>
            {categoryInfo.label}
          </Text>
          {categoryInfo.count > 0 && (
            <Text style={styles.pillCountDim}>{categoryInfo.count}</Text>
          )}
          <X size={12} color={theme.label3} strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {scrolledPebbleCount > 0 && (
        <View
          style={styles.pebbleHint}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${scrolledPebbleCount} pebbles placed today`}
        >
          <CairnGlyph size={14} />
        </View>
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
    // The "All" anchor is non-interactive — solid primary fill, white
    // text. It indicates the base scope; status/category pills are
    // additive narrowing on top.
    pillAnchor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 100,
      backgroundColor: c.primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
    },
    pillLabelAnchor: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.16,
      color: '#fff',
    },
    pillCountAnchor: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.9)',
      fontVariant: ['tabular-nums'],
      marginLeft: 2,
    },
    // Dimensional pills (status / category). Soft-fill so they read as
    // additive narrowing rather than an alternative selection. Tap
    // anywhere on the pill clears that dimension; the trailing X just
    // makes the affordance obvious.
    pillDim: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 12,
      paddingRight: 10,
      paddingVertical: 7,
      borderRadius: 100,
      backgroundColor: c.primarySoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
    },
    pillLabelDim: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
      color: c.primary,
      maxWidth: 140,
    },
    pillCountDim: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
      opacity: 0.8,
      fontVariant: ['tabular-nums'],
      marginLeft: 2,
    },
    pebbleHint: {
      marginLeft: 'auto',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 8,
    },
  })
}
