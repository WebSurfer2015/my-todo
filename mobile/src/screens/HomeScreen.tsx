/**
 * Home tab — the calm landing pad. Top of the screen now surfaces the
 * "Today" bucket so a quick check-in on Home immediately answers
 * "what do I need to do right now?" without jumping to Todos. Stats
 * tiles and the lifetime cairn live below as gentler ambient context.
 *
 * "Today" includes: open todos with dueDate === today AND open todos
 * with dueDate < today (carried-over). Done-today items show in their
 * struck-through form to acknowledge progress without crowding the
 * actionable rows.
 */

import React, { useCallback, useMemo } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { CheckCircle2, ChevronRight } from 'lucide-react-native'
import { useStore } from '../StoreContext'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { todayLocal } from '../../../core/src/utils'
import { categoryLabel } from '../categories'
import { CairnGlyph } from '../components/PebbleStrip'
import CategoryIcon from '../components/CategoryIcon'
import PriorityDot from '../components/PriorityDot'
import AppHeader from '../components/AppHeader'

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ago(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoDate(d)
}

const TODAY_PREVIEW_CAP = 6

export default function HomeScreen() {
  const store = useStore()
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()

  const today = todayLocal()

  // Stats: pre-existing buckets (Yesterday / Week / Month done counts).
  const counts = useMemo(() => {
    const yesterday = ago(1)
    const weekStart = ago(6)
    const monthStart = ago(29)
    let dToday = 0
    let dYesterday = 0
    let dWeek = 0
    let dMonth = 0
    for (const t of store.todos) {
      if (!t.done || !t.completionDate) continue
      const cd = t.completionDate
      if (cd === today) dToday += 1
      if (cd === yesterday) dYesterday += 1
      if (cd >= weekStart) dWeek += 1
      if (cd >= monthStart) dMonth += 1
    }
    return { dToday, dYesterday, dWeek, dMonth }
  }, [store.todos, today])

  // Today bucket — open todos due today or earlier. Includes carried-
  // over so the user sees the full "what's actionable now" picture
  // without having to mentally combine two groups.
  const todayBucket = useMemo(() => {
    return store.todos
      .filter(
        (td) =>
          !td.trashed &&
          !td.done &&
          !!td.dueDate &&
          td.dueDate <= today,
      )
      .sort((a, b) => {
        // Overdue first (earliest dueDate), then today's items.
        if (a.dueDate !== b.dueDate) {
          return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
        }
        // Same day → by priority (high first).
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1)
      })
  }, [store.todos, today])

  const overflow = Math.max(0, todayBucket.length - TODAY_PREVIEW_CAP)
  const previewItems = todayBucket.slice(0, TODAY_PREVIEW_CAP)

  const openTodos = useCallback(
    (filter?: 'all' | 'overdue' | 'open') => {
      if (filter) store.setFilter(filter)
      navigation.navigate('Todos')
    },
    [navigation, store],
  )

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <AppHeader />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Today section — actionable focus right at the top. */}
        <TouchableOpacity
          style={styles.sectionHeaderRow}
          onPress={() => openTodos('open')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Open Todos showing ${todayBucket.length} items`}
        >
          <Text style={styles.sectionHeader}>TODAY</Text>
          <View style={styles.sectionRight}>
            <Text style={styles.sectionCount}>
              {todayBucket.length === 0
                ? 'all clear'
                : todayBucket.length === 1
                  ? '1 to do'
                  : `${todayBucket.length} to do`}
            </Text>
            <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>

        {todayBucket.length === 0 ? (
          <View style={styles.todayEmpty}>
            <Text style={styles.todayEmptyTitle}>Nothing pending today.</Text>
            <Text style={styles.todayEmptyHint}>
              Enjoy the breathing room.
            </Text>
          </View>
        ) : (
          <View style={styles.todayCard}>
            {previewItems.map((td, i) => {
              const cat = td.category
                ? store.categories.find((c) => c.id === td.category)
                : undefined
              const overdue = !!td.dueDate && td.dueDate < today
              return (
                <View key={td.id}>
                  {i > 0 && <View style={styles.todayDivider} />}
                  <TouchableOpacity
                    style={styles.todayRow}
                    onPress={() => openTodos()}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`${td.text}. Tap to open in Todos.`}
                  >
                    <TouchableOpacity
                      onPress={() => store.toggle(td.id)}
                      hitSlop={10}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`Mark ${td.text} done`}
                    >
                      <View style={styles.todayCheckbox} />
                    </TouchableOpacity>
                    <View style={styles.todayBody}>
                      <Text style={styles.todayText} numberOfLines={2}>
                        {td.text}
                      </Text>
                      <View style={styles.todayMetaRow}>
                        {cat ? (
                          <>
                            <CategoryIcon
                              icon={cat.icon}
                              size={11}
                              color={cat.color}
                            />
                            <Text style={styles.todayMeta} numberOfLines={1}>
                              {categoryLabel(cat, t)}
                            </Text>
                          </>
                        ) : null}
                        {td.priority !== 'medium' && (
                          <PriorityDot level={td.priority} size={8} />
                        )}
                        {overdue && (
                          <Text style={styles.todayOverdue}>carried over</Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              )
            })}
            {overflow > 0 && (
              <>
                <View style={styles.todayDivider} />
                <TouchableOpacity
                  style={styles.todayMoreRow}
                  onPress={() => openTodos()}
                  activeOpacity={0.65}
                >
                  <Text style={styles.todayMoreText}>
                    + {overflow} more
                  </Text>
                  <ChevronRight size={14} color={theme.primary} strokeWidth={2.5} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Stats row (Yesterday / Week / Month) */}
        <View style={styles.statsRow}>
          <StatTile label="Yesterday" value={counts.dYesterday} styles={styles} />
          <StatTile label="This Week" value={counts.dWeek} styles={styles} />
          <StatTile label="This Month" value={counts.dMonth} styles={styles} />
        </View>

        {/* Cairn / lifetime */}
        <View style={styles.cairnCard}>
          <View style={styles.cairnGlyph}>
            <CairnGlyph size={52} />
          </View>
          <Text style={styles.cairnValue}>{store.lifetimePebbles}</Text>
          <Text style={styles.cairnLabel}>pebbles placed</Text>
          <Text style={styles.cairnHint}>
            Every task you've finished, since you started.
          </Text>
        </View>

        {counts.dToday > 0 && (
          <Text style={styles.footnote}>
            You've finished {counts.dToday}{' '}
            {counts.dToday === 1 ? 'thing' : 'things'} today.
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

interface StatProps {
  label: string
  value: number
  styles: ReturnType<typeof makeStyles>
}

function StatTile({ label, value, styles }: StatProps) {
  const theme = useTheme()
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statLabelRow}>
        <CheckCircle2 size={11} color={theme.primary} strokeWidth={2.4} />
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    body: { paddingHorizontal: 20, gap: 16, paddingTop: 4 },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
      marginBottom: -8,
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    sectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: c.label3,
    },
    sectionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    sectionCount: {
      fontSize: 11,
      fontWeight: '600',
      color: c.label3,
      letterSpacing: 0.2,
    },
    todayEmpty: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    todayEmptyTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.label,
      marginBottom: 4,
    },
    todayEmptyHint: {
      fontSize: 12,
      color: c.label3,
      fontStyle: 'italic',
    },
    todayCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      overflow: 'hidden',
      marginTop: 8,
    },
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 56,
    },
    todayCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: c.gray3,
    },
    todayBody: { flex: 1, gap: 2 },
    todayText: {
      fontSize: 15,
      color: c.label,
      lineHeight: 20,
    },
    todayMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    todayMeta: {
      fontSize: 12,
      color: c.label3,
      maxWidth: 120,
    },
    todayOverdue: {
      fontSize: 11,
      fontWeight: '600',
      color: c.red,
      letterSpacing: 0.1,
    },
    todayDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 48,
    },
    todayMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 12,
    },
    todayMoreText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    statTile: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    statLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    statLabel: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    cairnCard: {
      backgroundColor: c.primarySoft,
      borderRadius: 18,
      paddingVertical: 28,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 4,
    },
    cairnGlyph: { marginBottom: 8 },
    cairnValue: {
      fontSize: 40,
      fontWeight: '700',
      color: c.primary,
      lineHeight: 44,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.6,
    },
    cairnLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: c.label2,
      marginTop: 2,
      paddingBottom: 2,
    },
    cairnHint: {
      fontSize: 12,
      lineHeight: 17,
      color: c.label3,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 12,
      maxWidth: 260,
      paddingBottom: 2,
    },
    footnote: {
      fontSize: 13,
      color: c.label2,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
