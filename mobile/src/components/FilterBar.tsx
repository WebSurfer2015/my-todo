import React, { useMemo } from 'react'
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native'
import Svg, { Path, Circle, Polyline } from 'react-native-svg'
import { Filter, ViewMode, STATUS_FILTERS, categoryFilter, isCategoryFilter, categoryIdFromFilter } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  view: ViewMode
  filter: Filter
  onFilter: (f: Filter) => void
  systemCounts: { all: number; overdue: number; open: number; done: number; trash: number }
  byCategory: Record<string, number>
  categories: CategoryDef[]
  onManageCategories: () => void
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

function OverdueIcon({ size = 16, color = '#3C3C43' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12,6 12,12 16,14" />
    </Svg>
  )
}

function OpenIcon({ size = 16, color = '#3C3C43' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
    </Svg>
  )
}

function DoneIcon({ size = 16, color = '#3C3C43' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M8 12l3 3 5-6" />
    </Svg>
  )
}

function TrashIcon({ size = 16, color = '#3C3C43' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" />
      <Path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <Path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
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
  view, filter, onFilter, systemCounts, byCategory, categories, onManageCategories,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const STATUS_COLORS: Record<string, string> = {
    overdue: theme.red,
    open:    theme.blue,
    done:    theme.gray,
    trash:   theme.gray,
  }

  function statusIcon(value: string, color: string) {
    if (value === 'overdue') return <OverdueIcon size={15} color={color} />
    if (value === 'open')    return <OpenIcon size={15} color={color} />
    if (value === 'done')    return <DoneIcon size={15} color={color} />
    if (value === 'trash')   return <TrashIcon size={15} color={color} />
    return null
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {view === 'category' ? (
        <>
          {(() => {
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
          })()}
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
          <TouchableOpacity
            style={[styles.pill, styles.managePill]}
            onPress={onManageCategories}
            activeOpacity={0.75}
            accessibilityLabel={t.manageCategories}
          >
            <PencilIcon size={13} color={theme.blue} />
            <Text style={styles.managePillText}>{t.manageCategories}</Text>
          </TouchableOpacity>
        </>
      ) : (
        STATUS_FILTERS.map((value) => {
          const active = filter === value
          const color = STATUS_COLORS[value]
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
                {t.filters[value]}
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
      paddingVertical: 8,
      paddingHorizontal: 20,
      paddingBottom: 12,
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
