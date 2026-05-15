import React, { useMemo } from 'react'
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Filter, StatusFilter, ViewMode, categoryFilter, isCategoryFilter, categoryIdFromFilter } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import CategoryIcon from './CategoryIcon'
import StatusIcon, { statusColor } from './StatusIcon'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  view: ViewMode
  filter: Filter
  onFilter: (f: Filter) => void
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number }
  byCategory: Record<string, number>
  categories: CategoryDef[]
  orderedVisibleStatuses: { id: StatusFilter; label: string }[]
}

function AllIcon({ size = 16, color = '#3C3C43' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 13l-3.5 7a1 1 0 01-.9.5H6.4a1 1 0 01-.9-.5L2 13" />
      <Path d="M5 13V5a2 2 0 012-2h10a2 2 0 012 2v8" />
      <Path d="M9 13h6" />
    </Svg>
  )
}

function PencilIcon({ size = 14, color = '#007AFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </Svg>
  )
}

export default function FilterBar({
  view, filter, onFilter, systemCounts, byCategory, categories, orderedVisibleStatuses,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  function statusIcon(value: StatusFilter, color: string) {
    return <StatusIcon id={value} size={15} color={color} />
  }

  const renderAllPill = () => {
    const active = filter === 'all'
    const color = theme.blue
    return (
      <TouchableOpacity
        style={[styles.pill, active && { backgroundColor: color, borderColor: color }]}
        onPress={() => onFilter('all')}
        activeOpacity={0.75}
      >
        <AllIcon size={15} color={active ? '#fff' : color} />
        <Text style={[styles.pillLabel, { color: active ? '#fff' : theme.label }]}>
          {t.filters.all}
        </Text>
        {systemCounts.all > 0 && (
          <View style={[styles.badge, active && styles.badgeActive]}>
            <Text style={[styles.badgeText, { color: active ? '#fff' : theme.label3 }]}>
              {systemCounts.all}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {renderAllPill()}
      {view === 'category' ? (
        <>
          {categories.map((c) => {
            const active = isCategoryFilter(filter) && categoryIdFromFilter(filter) === c.id
            const count = byCategory[c.id] ?? 0
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.pill, active && { backgroundColor: theme.blue, borderColor: theme.blue }]}
                onPress={() => onFilter(categoryFilter(c.id))}
                activeOpacity={0.75}
              >
                <CategoryIcon icon={c.icon} size={15} color={active ? '#fff' : c.color} />
                <Text style={[styles.pillLabel, { color: active ? '#fff' : theme.label }]}>
                  {categoryLabel(c, t)}
                </Text>
                {count > 0 && (
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, { color: active ? '#fff' : theme.label3 }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </>
      ) : (
        orderedVisibleStatuses.map(({ id: value, label }) => {
          const active = filter === value
          const color = statusColor(value, theme)
          const count = systemCounts[value]
          return (
            <TouchableOpacity
              key={value}
              style={[styles.pill, active && { backgroundColor: theme.blue, borderColor: theme.blue }]}
              onPress={() => onFilter(value)}
              activeOpacity={0.75}
            >
              {statusIcon(value, active ? '#fff' : color)}
              <Text style={[styles.pillLabel, { color: active ? '#fff' : theme.label }]}>
                {label}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeText, { color: active ? '#fff' : theme.label3 }]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })
      )}
    </ScrollView>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      paddingTop: 0,
      paddingBottom: 12,
      paddingHorizontal: 20,
      gap: 8,
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
    pillLabel: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    badge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
    },
    badgeActive: {
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    managePill: {
      backgroundColor: c.surface,
      borderColor: c.border,
    },
    managePillText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.blue,
      letterSpacing: -0.16,
    },
  })
}
