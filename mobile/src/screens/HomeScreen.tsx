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

import React, { useCallback, useMemo, useState } from 'react'
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
import { useSheets } from '../SheetContext'
import { useTheme, ThemeColors } from '../theme'
import { todayLocal } from '../../../core/src/utils'
import {
  type Todo,
  type Filter,
  isCategoryFilter,
  categoryIdFromFilter,
} from '../../../core/src/types'
import { categoryLabel } from '../../../core/src/categories'
import { buildGroups, type GroupKey } from '../../../core/src/groups'
import PebbleStrip from '../components/PebbleStrip'
import StatusIcon, { statusColor } from '../components/StatusIcon'
import CategoryIcon from '../components/CategoryIcon'
import AppHeader from '../components/AppHeader'
import Fab from '../components/Fab'
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
  const sheets = useSheets()

  // Measured height of the sticky stats row at the bottom. The Add FAB
  // reads this so it can sit ABOVE the tiles instead of overlapping
  // them. onLayout from the tiles' wrapping View populates it.
  const [statsRowHeight, setStatsRowHeight] = useState(0)

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
    const bumpFor = (cd: string) => {
      if (cd === today) dToday += 1
      if (cd === yesterday) dYesterday += 1
      if (cd >= weekStart) dWeek += 1
      if (cd >= monthStart) dMonth += 1
    }
    for (const t of store.todos) {
      // Parent completion contributes whenever the row carries a
      // completionDate (regardless of trashed-state — done items live
      // in the merged Done bin so trashed:true is expected).
      if (t.done && t.completionDate) bumpFor(t.completionDate)
      // Per-sub completion dates (added 2026-05-19) — each done sub
      // contributes independently of its parent's done state, so
      // checking off steps updates the stats even when the parent
      // isn't fully done yet.
      const subs = t.subtasks ?? []
      for (const s of subs) {
        if (s.done && s.completionDate) bumpFor(s.completionDate)
      }
    }
    return { dToday, dYesterday, dWeek, dMonth }
  }, [store.todos, today])

  // Today bucket — Open-only (parent.done=false, !trashed). Two
  // inclusion shapes:
  //   1. Parent's own dueDate <= today.
  //   2. Parent has at least one open subtask whose dueDate <= today
  //      (the parent shows even if its own dueDate is future or
  //      absent — the today-subs drive presence).
  // No grace period here — done rows leave the section as soon as
  // they flip, matching the Todos-tab Open filter's behavior.
  const todayBucket = useMemo(() => {
    // TODAY-actionable rule: a row appears only when there's still
    // work to do TODAY.
    //   • Parents with subs: at least one OPEN sub has dueDate <= today.
    //     Once every today-or-earlier sub is checked off, the parent
    //     leaves TODAY even if future-dated / no-date subs remain
    //     (those are tomorrow's problem).
    //   • Parents without subs: parent's own dueDate <= today.
    const hasOpenTodaySub = (td: typeof store.todos[number]) => {
      const subs = td.subtasks ?? []
      return subs.some(
        (s) => !s.done && !!s.dueDate && s.dueDate <= today,
      )
    }
    return store.todos
      .filter((td) => {
        if (td.trashed) return false
        if (td.done) return false
        const subs = td.subtasks ?? []
        if (subs.length > 0) return hasOpenTodaySub(td)
        return !!td.dueDate && td.dueDate <= today
      })
      .sort((a, b) => {
        // Done rows sink to the bottom; everything else (including
        // partial-done parents with future subs remaining) sorts as
        // open. Within the open group: priority then earliest dueDate.
        if (a.done !== b.done) return a.done ? 1 : -1
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
        const pa = rank[a.priority] ?? 1
        const pb = rank[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
      })
  }, [store.todos, today])

  // Section count — every non-done item in the bucket is still "to do"
  // even if today's steps are done (future steps keep the parent live).
  const openCount = useMemo(
    () => todayBucket.filter((td) => !td.done).length,
    [todayBucket],
  )

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

  // "What's Next?" cycles through Todos' time buckets in order. State:
  //   `nextExpanded` — section visible / TODAY's content collapsed.
  //   `nextGroupKey` — which bucket is being shown (sticks even when
  //     the user empties it by completing things, so we can render
  //     an empty-state inside it and advance to the next bucket).
  //   `nextPageIndex` — paging within the current bucket.
  const NEXT_GROUP_SEQUENCE: GroupKey[] = ['overdue', 'week', 'upcoming', 'noDate']
  const [nextExpanded, setNextExpanded] = useState(false)
  const [nextGroupKey, setNextGroupKey] = useState<GroupKey | null>(null)
  const [nextPageIndex, setNextPageIndex] = useState(0)

  // Open-only buckets, derived from the same buildGroups pipeline Todos
  // uses. Empty buckets are dropped by buildGroups, so groupsByKey only
  // has entries for buckets that currently have at least one open todo.
  const groupsByKey = useMemo(() => {
    const openOnly = store.todos.filter((td) => !td.done && !td.trashed)
    const groups = buildGroups(openOnly)
    const map: Partial<Record<GroupKey, typeof groups[number]['todos']>> = {}
    for (const g of groups) map[g.key] = g.todos
    return map
  }, [store.todos])

  // First bucket after TODAY that has open todos right now — used as
  // the entry-point when the user first taps What's Next, and as a
  // fallback if their chosen group ceased to exist (e.g. between
  // session switches).
  const firstAvailableNextKey = useMemo<GroupKey | null>(
    () =>
      NEXT_GROUP_SEQUENCE.find((k) => (groupsByKey[k]?.length ?? 0) > 0) ??
      null,
    [NEXT_GROUP_SEQUENCE, groupsByKey],
  )

  // Given the currently-shown group key, find the next sequence entry
  // that has open todos. null when there's nothing left — drives the
  // "no What's Next button on the last group" rule.
  function nextGroupAfter(current: GroupKey | null): GroupKey | null {
    if (!current) return firstAvailableNextKey
    const i = NEXT_GROUP_SEQUENCE.indexOf(current)
    for (let j = i + 1; j < NEXT_GROUP_SEQUENCE.length; j++) {
      if ((groupsByKey[NEXT_GROUP_SEQUENCE[j]]?.length ?? 0) > 0) {
        return NEXT_GROUP_SEQUENCE[j]
      }
    }
    return null
  }

  const nextBucket = nextGroupKey ? groupsByKey[nextGroupKey] ?? [] : []
  const nextSectionLabel = nextGroupKey ? t.groups[nextGroupKey] : "What's next"
  const hasNextGroupAfter = nextGroupAfter(nextGroupKey) !== null

  const nextPageCount = Math.max(
    1,
    Math.ceil(nextBucket.length / TODAY_PREVIEW_CAP),
  )
  const safeNextPageIndex = Math.min(nextPageIndex, nextPageCount - 1)
  const nextPageStart = safeNextPageIndex * TODAY_PREVIEW_CAP
  const nextPreviewItems = nextBucket.slice(
    nextPageStart,
    nextPageStart + TODAY_PREVIEW_CAP,
  )
  const nextRemainingAfterPage = Math.max(
    0,
    nextBucket.length - (nextPageStart + TODAY_PREVIEW_CAP),
  )
  const nextOverflow = nextRemainingAfterPage
  const nextIsLastPage = safeNextPageIndex >= nextPageCount - 1

  const openTodos = useCallback(
    (filter?: Filter) => {
      if (filter) store.setFilter(filter)
      navigation.navigate('Todos')
    },
    [navigation, store],
  )

  const openWhatsNext = useCallback(() => {
    setNextPageIndex(0)
    setNextGroupKey(firstAvailableNextKey)
    setNextExpanded(true)
  }, [firstAvailableNextKey])
  // Advance to the next available group (used by the in-section
  // What's Next button when the current bucket has been emptied).
  const advanceToNextGroup = useCallback(() => {
    const next = nextGroupAfter(nextGroupKey)
    if (!next) return
    setNextPageIndex(0)
    setNextGroupKey(next)
  }, [nextGroupKey, groupsByKey])

  // Effective tiles come from the store (defaults to Home/Work/Done when
  // the user hasn't customized). Computed there so the Manage Filter
  // badges stay in sync with what the Home tiles actually render.
  const effectiveHomeStatTiles = store.effectiveHomeStatTiles

  // Pass-through render of TaskItem for each row, so Home inherits the
  // unified tap/long-press/swipe model and the embedded TaskDetailsSheet
  // for free. The only Home-local state is the single-todo Defer modal
  // — TaskItem's onLongPressDefer prop bubbles up here.
  const celebrate =
    store.profile.completionAnimation !== false &&
    store.profile.reduceMotion !== true
  const playSound = store.profile.completionSound !== false

  const [deferTarget, setDeferTarget] = useState<Todo | null>(null)
  const openSingleDefer = useCallback((todo: Todo) => {
    setDeferTarget(todo)
  }, [])

  // PebbleStrip on Home is rendered conditionally when this screen is
  // focused — its useEffect handles flight-target registration on
  // mount, so simply mounting/unmounting it as focus shifts gives us
  // the correct cairn target without manual register/clear plumbing
  // here. Todos has the same focus-gate pattern.
  const isFocused = useIsFocused()



  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <AppHeader onGearPress={sheets.openSettings} />
      {/* Home strip — same render shape as Todos so the pebble-flight
          target math is identical. Active gates which screen owns the
          registered cairn. */}
      <PebbleStrip count={store.todayPebbles} active={isFocused} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Today section — actionable focus right at the top. When
            today's bucket is empty the chip becomes "done" and routes
            to the Done filter (review surface), since there's no "to
            do" left to land on in Todos. */}
        <TouchableOpacity
          style={styles.sectionHeaderRow}
          onPress={() => openTodos(openCount === 0 ? 'done' : 'all')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            openCount === 0
              ? 'Open Todos showing Done items'
              : `Open Todos showing ${openCount} items`
          }
        >
          <Text style={styles.sectionHeader}>TODAY</Text>
          <View style={styles.sectionRight}>
            <Text style={styles.sectionCount}>
              {openCount === 0
                ? `${store.todayPebbles} done`
                : openCount === 1
                  ? '1 to do'
                  : `${openCount} to do`}
            </Text>
            <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>

        {/* When What's Next is expanded, the TODAY band's content
            collapses so the next group can take the focus. The header
            above still shows, so the user knows TODAY is still here
            and can collapse NEXT to return to it. */}
        {nextExpanded ? null : todayBucket.length === 0 ? (
          <View style={styles.todayEmpty}>
            <Text style={styles.todayEmptyTitle}>Nothing pending.</Text>
            {store.todayPebbles > 0 && (
              <Text style={styles.todayEmptyCount}>
                {store.todayPebbles === 1
                  ? '1 done today.'
                  : `${store.todayPebbles} done today.`}
              </Text>
            )}
            <Text style={styles.todayEmptyHint}>
              Enjoy the breathing room.
            </Text>
            <TouchableOpacity
              style={styles.whatsNextBtn}
              onPress={openWhatsNext}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="What's Next? Ask Mochi or open the upcoming list."
            >
              <Text style={styles.whatsNextBtnText}>What&apos;s Next?</Text>
            </TouchableOpacity>
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
                onUpdateReminder={store.updateReminder}
                onAddSubtask={store.addSubtask}
                onToggleSubtask={store.toggleSubtask}
                onUpdateSubtaskText={store.updateSubtaskText}
                onUpdateSubtaskPriority={store.updateSubtaskPriority}
                onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
                onRemoveSubtask={store.removeSubtask}
                agentEnabled={store.profile.agentEnabled !== false}
                onClearSubtasks={store.clearSubtasks}
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

        {/* NEXT — open todos NOT due today, surfaced inline when the
            user taps "What's Next?". Same paging UX as TODAY. Tap the
            header chevron to collapse. */}
        {nextExpanded && (
          <>
            <TouchableOpacity
              style={styles.sectionHeaderRow}
              onPress={() => setNextExpanded(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Collapse ${nextSectionLabel}, ${nextBucket.length} items`}
            >
              <Text style={styles.sectionHeader}>
                {nextSectionLabel.toUpperCase()}
              </Text>
              <View style={styles.sectionRight}>
                <Text style={styles.sectionCount}>
                  {nextBucket.length === 0
                    ? 'nothing queued'
                    : nextBucket.length === 1
                      ? '1 open'
                      : `${nextBucket.length} open`}
                </Text>
                <Text style={styles.sectionCollapse}>×</Text>
              </View>
            </TouchableOpacity>
            {nextBucket.length === 0 ? (
              // Group emptied (or starting empty) — mirror TODAY's
              // empty state. The "What's Next?" button advances to
              // the next available group; hidden on the last group
              // so the user lands cleanly at the end.
              <View style={styles.todayEmpty}>
                <Text style={styles.todayEmptyTitle}>Nothing pending.</Text>
                <Text style={styles.todayEmptyHint}>
                  Enjoy the breathing room.
                </Text>
                {hasNextGroupAfter && (
                  <TouchableOpacity
                    style={styles.whatsNextBtn}
                    onPress={advanceToNextGroup}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Show the next group"
                  >
                    <Text style={styles.whatsNextBtnText}>What&apos;s Next?</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.todayList}>
                {nextPreviewItems.map((td) => (
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
                    onUpdateReminder={store.updateReminder}
                    onAddSubtask={store.addSubtask}
                    onToggleSubtask={store.toggleSubtask}
                    onUpdateSubtaskText={store.updateSubtaskText}
                    onUpdateSubtaskPriority={store.updateSubtaskPriority}
                    onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
                    onRemoveSubtask={store.removeSubtask}
                    agentEnabled={store.profile.agentEnabled !== false}
                    onClearSubtasks={store.clearSubtasks}
                    subtaskVisibility="open"
                    dateChipFormat="home-today"
                    tapBehavior="expandIfHasSubs"
                  />
                ))}
                {nextPageCount > 1 && (
                  <View style={styles.todayPaginator}>
                    {safeNextPageIndex === 0 ? (
                      <TouchableOpacity
                        style={styles.todayPaginatorCenter}
                        onPress={() => setNextPageIndex((i) => i + 1)}
                        activeOpacity={0.65}
                        accessibilityRole="button"
                        accessibilityLabel={`Show next ${Math.min(TODAY_PREVIEW_CAP, nextOverflow)} What's Next items`}
                      >
                        <Text style={styles.todayMoreText}>+ {nextOverflow} more</Text>
                        <ChevronRight size={14} color={theme.primary} strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : nextIsLastPage ? (
                      <TouchableOpacity
                        style={styles.todayPaginatorCenter}
                        onPress={() => setNextPageIndex(0)}
                        activeOpacity={0.65}
                        accessibilityRole="button"
                        accessibilityLabel="Start over from the top of What's Next"
                      >
                        <Text style={styles.todayMoreText}>↺ Start over</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.todayPaginatorBtn}
                          onPress={() => setNextPageIndex((i) => i - 1)}
                          activeOpacity={0.65}
                          accessibilityRole="button"
                          accessibilityLabel="Previous What's Next page"
                        >
                          <ChevronLeft size={14} color={theme.primary} strokeWidth={2.5} />
                          <Text style={styles.todayMoreText}>Previous</Text>
                        </TouchableOpacity>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity
                          style={styles.todayPaginatorBtn}
                          onPress={() => setNextPageIndex((i) => i + 1)}
                          activeOpacity={0.65}
                          accessibilityRole="button"
                          accessibilityLabel={`Show next ${Math.min(TODAY_PREVIEW_CAP, nextOverflow)} What's Next items`}
                        >
                          <Text style={styles.todayMoreText}>+ {nextOverflow} more</Text>
                          <ChevronRight size={14} color={theme.primary} strokeWidth={2.5} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* Lifetime card moved into ProfileSheet (YOUR JOURNEY) so the
            destructive Reset action lives alongside identity. */}
      </ScrollView>
      {/* Stats row pinned to the bottom — sits above the tab bar so the
          counts stay glanceable while the today list scrolls. Tiles are
          driven by profile.homeStatTiles (picked in the Dashboard gear's
          Manage Home Tiles sheet). Default trio: Home/Work/Done. The row
          is hidden when the user unpicks all; otherwise it horizontally
          scrolls so any number of picks lays out cleanly. */}
      {effectiveHomeStatTiles.length > 0 && (
        <View
          style={styles.statsRowSticky}
          onLayout={(e) => setStatsRowHeight(e.nativeEvent.layout.height)}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.statsRowScroll,
              // Center the tiles when 3 or fewer fit comfortably on
              // screen. Beyond 3 the user scrolls, so left-align so
              // the scroll feels natural and the first tile lines up
              // with the rest of the screen padding.
              effectiveHomeStatTiles.length <= 3 && styles.statsRowScrollCenter,
            ]}
          >
            {effectiveHomeStatTiles.map((f, i) => {
              const tile = resolveTile(f, store, t, theme)
              return (
                <FilterTile
                  key={`${f}-${i}`}
                  icon={tile.icon}
                  label={tile.label}
                  value={tile.count}
                  onPress={() => openTodos(f)}
                  styles={styles}
                />
              )
            })}
          </ScrollView>
        </View>
      )}
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
      {/* Add FAB — same component Todos uses; the compose sheet now
          lives in SheetContext so this can fire from any tab. The
          extraBottom offset lifts the FAB above the sticky stats row
          (measured at runtime via onLayout above). */}
      <Fab
        onPress={() => sheets.openCompose()}
        accessibilityLabel={t.addPlaceholder}
        agentEnabled={store.profile.agentEnabled !== false}
        extraBottom={
          effectiveHomeStatTiles.length > 0 ? statsRowHeight + 4 : 0
        }
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

interface FilterTileProps {
  icon: React.ReactNode
  label: string
  value: number
  onPress: () => void
  styles: ReturnType<typeof makeStyles>
}

function FilterTile({ icon, label, value, onPress, styles }: FilterTileProps) {
  return (
    <TouchableOpacity
      style={styles.statTile}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. Tap to open in Todos.`}
    >
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statLabelRow}>
        {icon}
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

/** Resolve a Filter to its render parts for the sticky Home stats row. */
function resolveTile(
  f: Filter,
  store: ReturnType<typeof useStore>,
  t: ReturnType<typeof useLang>['t'],
  theme: ThemeColors,
): { icon: React.ReactNode; label: string; count: number } {
  if (isCategoryFilter(f)) {
    const catId = categoryIdFromFilter(f)
    const cat = catId ? store.categories.find((c) => c.id === catId) : undefined
    if (cat) {
      return {
        icon: <CategoryIcon icon={cat.icon} color={cat.color} size={11} />,
        label: categoryLabel(cat, t),
        count: store.byCategory[cat.id] ?? 0,
      }
    }
    // Category was deleted after being picked — render a neutral placeholder
    // and a zero count. User can re-pick a valid filter via the sheet.
    return {
      icon: <CheckCircle2 size={11} color={theme.label3} strokeWidth={2.4} />,
      label: '—',
      count: 0,
    }
  }
  const counts = store.systemCounts
  if (f === 'all' || f === 'open' || f === 'done' || f === 'overdue' || f === 'trash') {
    const count = counts[f] ?? 0
    const sysLabel = (t.filters as Record<string, string>)[f] ?? f
    return {
      icon:
        f === 'all' ? (
          <CheckCircle2 size={11} color={theme.primary} strokeWidth={2.4} />
        ) : (
          <StatusIcon id={f} size={11} color={statusColor(f, theme)} />
        ),
      label: sysLabel,
      count,
    }
  }
  // Groceries (or any unknown filter shape) — neutral placeholder.
  return {
    icon: <CheckCircle2 size={11} color={theme.label3} strokeWidth={2.4} />,
    label: '—',
    count: 0,
  }
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
    sectionCollapse: {
      fontSize: 18,
      lineHeight: 18,
      color: c.label3,
      fontWeight: '300',
      marginLeft: 2,
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
    todayEmptyCount: {
      fontSize: 13,
      color: c.primary,
      fontWeight: '600',
      marginBottom: 2,
    },
    todayEmptyHint: {
      fontSize: 12,
      color: c.label3,
      fontStyle: 'italic',
    },
    whatsNextBtn: {
      marginTop: 14,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    whatsNextBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
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
    homeStripRow: {
      flexDirection: 'row',
      alignItems: 'center',
      // Match body paddingHorizontal so the strip's left edge aligns
      // with the TODAY section header text.
      paddingHorizontal: 20,
      // Pull TODAY up — PebbleStrip's own marginBottom is 14, this
      // negative margin counters most of it for tighter spacing.
      marginBottom: -10,
    },
    homeStripPebbles: {
      // Cap the pebble row at 60% of the screen width so a high count
      // collapses into "+N" before encroaching on the Mochi.
      maxWidth: '60%',
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
    statsRowSticky: {
      paddingTop: 8,
      paddingBottom: 8,
      // Transparent — tile cards themselves carry the surface color.
      // The hairline border + explicit bg were creating a separate
      // cream band that visually competed with the tab bar below.
    },
    statsRowScroll: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
    },
    statsRowScrollCenter: {
      // flexGrow lets the contentContainer span the ScrollView width,
      // so justifyContent: 'center' actually centers the children.
      flexGrow: 1,
      justifyContent: 'center',
    },
    statTile: {
      // Fixed minWidth so the horizontal scroll lays out cleanly when
      // the user picks many tiles. ~3 fit comfortably without
      // scrolling on iPhone 17 Pro width (393pt - 32 pad = 361pt;
      // 3 × 110 + 2 × 10 = 350).
      minWidth: 110,
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
    footnote: {
      fontSize: 13,
      color: c.label2,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
