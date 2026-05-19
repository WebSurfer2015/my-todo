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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useStore } from '../StoreContext'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { todayLocal } from '../../../core/src/utils'
import type { Todo } from '../../../core/src/types'
import { CairnGlyph } from '../components/PebbleStrip'
import { useRegisterCairn } from '../components/PebbleFlight'
import AppHeader from '../components/AppHeader'
import TaskItem from '../components/TaskItem'
import DeferModal from '../components/DeferModal'

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

  // Today bucket — three shapes are included:
  //   1. Open todos with the parent's own dueDate <= today.
  //   2. Open todos whose subtasks include at least one with
  //      dueDate <= today (the parent shows even if the parent's own
  //      dueDate is future or absent — the today-subs drive presence).
  //   3. Just-checked-off items (parent.done with completionDate
  //      === today) so the strike-through is visible until the next
  //      day's reload — same one-day grace deriveState uses.
  const todayBucket = useMemo(() => {
    const completedToday = (td: typeof store.todos[number]) =>
      td.done && td.completionDate === today
    const hasTodaySub = (td: typeof store.todos[number]) => {
      const subs = td.subtasks ?? []
      return subs.some(
        (s) => !!s.dueDate && s.dueDate <= today && !s.done,
      )
    }
    return store.todos
      .filter((td) => {
        if (td.trashed && !completedToday(td)) return false
        if (completedToday(td)) return true
        if (td.done) return false
        if (!!td.dueDate && td.dueDate <= today) return true
        if (hasTodaySub(td)) return true
        return false
      })
      .sort((a, b) => {
        // Bucket by today-progress state, then by priority/dueDate.
        const stateRank = (td: typeof store.todos[number]) => {
          if (td.done) return 2 // fully done (grace) → bottom
          const subs = td.subtasks ?? []
          if (subs.length > 0) {
            const todaySubs = subs.filter(
              (s) => !!s.dueDate && s.dueDate <= today,
            )
            if (todaySubs.length > 0 && todaySubs.every((s) => s.done)) {
              return 1 // partially done today → middle
            }
          }
          return 0 // open / actionable → top
        }
        const ra = stateRank(a)
        const rb = stateRank(b)
        if (ra !== rb) return ra - rb
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
        const pa = rank[a.priority] ?? 1
        const pb = rank[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
      })
  }, [store.todos, today])

  // Count for the section header — only items still actionable today
  // (not done, not partially-done with no remaining today-subs).
  const openCount = useMemo(() => {
    return todayBucket.filter((td) => {
      if (td.done) return false
      const subs = td.subtasks ?? []
      if (subs.length > 0) {
        const todaySubs = subs.filter(
          (s) => !!s.dueDate && s.dueDate <= today,
        )
        if (todaySubs.length > 0 && todaySubs.every((s) => s.done)) {
          return false
        }
      }
      return true
    }).length
  }, [todayBucket, today])

  // Pagination on Home — "+ N more" cycles to the next page in place
  // instead of jumping to Todos, so the user can scan all today-actionable
  // rows without leaving the calm dashboard. Wraps back to page 0 when
  // the user reaches the end.
  const [pageIndex, setPageIndex] = useState(0)
  const pageCount = Math.max(
    1,
    Math.ceil(todayBucket.length / TODAY_PREVIEW_CAP),
  )
  // Clamp if the bucket shrinks (e.g. someone marked everything done).
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const pageStart = safePageIndex * TODAY_PREVIEW_CAP
  const previewItems = todayBucket.slice(
    pageStart,
    pageStart + TODAY_PREVIEW_CAP,
  )
  const remainingAfterPage = Math.max(
    0,
    todayBucket.length - (pageStart + previewItems.length),
  )
  // "+ N more →" advances to the next page. On the last page, it
  // wraps back to page 0 so the user can re-scan; the label updates
  // to "↺ start over" in that case.
  const overflow = remainingAfterPage
  const isLastPage = safePageIndex >= pageCount - 1

  const openTodos = useCallback(
    (filter?: 'all' | 'overdue' | 'open') => {
      if (filter) store.setFilter(filter)
      navigation.navigate('Todos')
    },
    [navigation, store],
  )

  // Pass-through render of TaskItem for each row, so Home inherits the
  // unified tap/long-press/swipe model and the embedded TaskDetailsSheet
  // for free. The only Home-local state is the single-todo Defer modal
  // — TaskItem's onLongPressDefer prop bubbles up here.
  const celebrate = store.profile.completionAnimation !== false
  const playSound = store.profile.completionSound !== false

  const [deferTarget, setDeferTarget] = useState<Todo | null>(null)
  const openSingleDefer = useCallback((todo: Todo) => {
    setDeferTarget(todo)
  }, [])

  // Register Home's CairnGlyph as the pebble-flight target while this
  // screen is focused, so a Mochi launched from a Home row lands on
  // the visible cairn instead of the PebbleStrip mounted on Todos.
  // Re-register on every focus (React Navigation keeps both tabs
  // mounted; last-register-wins inside PebbleFlight context).
  const registerCairn = useRegisterCairn()
  const cairnTargetRef = useRef<View>(null)
  const isFocused = useIsFocused()
  useEffect(() => {
    if (!isFocused) return
    const resolver = (cb: (p: { x: number; y: number } | null) => void) => {
      const node = cairnTargetRef.current
      if (!node) {
        cb(null)
        return
      }
      node.measureInWindow((x, y, w, h) => {
        if (typeof x === 'number' && typeof y === 'number' && w > 0 && h > 0) {
          cb({ x: x + w / 2, y: y + h / 2 })
        } else {
          cb(null)
        }
      })
    }
    registerCairn(resolver)
    return () => registerCairn(null)
  }, [isFocused, registerCairn])

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
          accessibilityLabel={`Open Todos showing ${openCount} items`}
        >
          <Text style={styles.sectionHeader}>TODAY</Text>
          <View style={styles.sectionRight}>
            <Text style={styles.sectionCount}>
              {openCount === 0
                ? 'all clear'
                : openCount === 1
                  ? '1 to do'
                  : `${openCount} to do`}
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
          <View style={styles.todayList}>
            {previewItems.map((td) => (
              <TaskItem
                key={td.id}
                todo={td}
                categories={store.categories}
                density={store.profile.density}
                celebrate={celebrate}
                playSound={playSound}
                onToggle={store.toggle}
                onMoveToTrash={store.moveToTrash}
                onRestore={store.restoreFromTrash}
                onPermanentDelete={store.permanentlyDelete}
                onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
                onApplySeriesFutureEdits={store.applySeriesFutureEdits}
                onUpdatePriority={store.updatePriority}
                onUpdateDueDate={store.updateDueDate}
                onSnooze={store.snooze}
                onLongPressDefer={openSingleDefer}
                onUpdateCategory={store.updateTaskCategory}
                onUpdateText={store.updateText}
                onUpdateNotes={store.updateNotes}
                onUpdateRecurrence={store.updateRecurrence}
                onAddSubtask={store.addSubtask}
                onToggleSubtask={store.toggleSubtask}
                onUpdateSubtaskText={store.updateSubtaskText}
                onUpdateSubtaskPriority={store.updateSubtaskPriority}
                onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
                onRemoveSubtask={store.removeSubtask}
                subtaskVisibility="open"
                dateChipFormat="home-today"
                tapBehavior="expandIfHasSubs"
                subtaskDateFilter="due-today"
              />
            ))}
            {pageCount > 1 && (
              <View style={styles.todayPaginator}>
                {safePageIndex === 0 ? (
                  // First page: only "+ N more", centered.
                  <TouchableOpacity
                    style={styles.todayPaginatorCenter}
                    onPress={() => setPageIndex((i) => i + 1)}
                    activeOpacity={0.65}
                    accessibilityRole="button"
                    accessibilityLabel={`Show next ${Math.min(TODAY_PREVIEW_CAP, overflow)} TODAY items, page 2 of ${pageCount}`}
                  >
                    <Text style={styles.todayMoreText}>+ {overflow} more</Text>
                    <ChevronRight size={14} color={theme.primary} strokeWidth={2.5} />
                  </TouchableOpacity>
                ) : isLastPage ? (
                  // Last page: only "↺ Start over", centered.
                  <TouchableOpacity
                    style={styles.todayPaginatorCenter}
                    onPress={() => setPageIndex(0)}
                    activeOpacity={0.65}
                    accessibilityRole="button"
                    accessibilityLabel={`Start over from the top of TODAY, page 1 of ${pageCount}`}
                  >
                    <Text style={styles.todayMoreText}>↺ Start over</Text>
                  </TouchableOpacity>
                ) : (
                  // Middle pages: [Previous] left + [+ N more] right.
                  <>
                    <TouchableOpacity
                      style={styles.todayPaginatorBtn}
                      onPress={() => setPageIndex((i) => i - 1)}
                      activeOpacity={0.65}
                      accessibilityRole="button"
                      accessibilityLabel={`Previous TODAY page, ${safePageIndex} of ${pageCount}`}
                    >
                      <ChevronLeft size={14} color={theme.primary} strokeWidth={2.5} />
                      <Text style={styles.todayMoreText}>Previous</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={styles.todayPaginatorBtn}
                      onPress={() => setPageIndex((i) => i + 1)}
                      activeOpacity={0.65}
                      accessibilityRole="button"
                      accessibilityLabel={`Show next ${Math.min(TODAY_PREVIEW_CAP, overflow)} TODAY items, page ${safePageIndex + 2} of ${pageCount}`}
                    >
                      <Text style={styles.todayMoreText}>+ {overflow} more</Text>
                      <ChevronRight size={14} color={theme.primary} strokeWidth={2.5} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
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
          <View ref={cairnTargetRef} collapsable={false} style={styles.cairnGlyph}>
            <CairnGlyph size={52} />
          </View>
          <Text style={styles.cairnValue}>{store.lifetimePebbles}</Text>
          <Text style={styles.cairnLabel}>pebbles placed</Text>
          <Text style={styles.cairnHint}>
            Every task you've finished, since you started.
          </Text>
        </View>
      </ScrollView>
      <DeferModal
        visible={deferTarget !== null}
        filterLabel={deferTarget?.text}
        count={1}
        isTodayGroup={false}
        onSelect={(targetISO) => {
          if (deferTarget) store.bulkDeferTodos([deferTarget.id], targetISO)
        }}
        onClose={() => setDeferTarget(null)}
      />
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
    // Container for TaskItem rows on Home. TaskItem already supplies its
    // own row background + border; this wrapper just gives the cluster a
    // little top spacing under the section header.
    todayList: {
      marginTop: 8,
      gap: 4,
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
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayCheckboxDone: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    todayCheckmark: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 14,
    },
    todayBody: { flex: 1, gap: 2 },
    todayText: {
      fontSize: 15,
      color: c.label,
      lineHeight: 20,
    },
    todayTextDone: {
      color: c.label3,
      textDecorationLine: 'line-through',
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
    todayMetaSep: {
      fontSize: 12,
      color: c.label3,
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
    todayPaginator: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingTop: 4,
    },
    todayPaginatorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 10,
      paddingHorizontal: 8,
      minWidth: 80,
    },
    todayPaginatorCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 10,
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
