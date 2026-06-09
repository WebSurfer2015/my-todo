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
import { CheckCircle2, ChevronRight } from 'lucide-react-native'
import { useStore } from '../../app/StoreContext'
import { useLang } from '../../app/LangContext'
import { useSheets } from '../../app/SheetContext'
import { useTheme, ThemeColors } from '../../app/theme'
import { todayLocal } from '../../../../core/src/logic/utils'
import {
  type Todo,
  type Filter,
  isCategoryFilter,
  categoryIdFromFilter,
  isPriorityFilter,
  priorityFromFilter,
} from '../../../../core/src/domain/types'
import { categoryLabel } from '../../../../core/src/data/categories'
import { buildGroups, type GroupKey } from '../../../../core/src/logic/groups'
import EmptyStateCard from '../../ui/EmptyStateCard'
import StatusIcon, { statusColor } from '../../ui/StatusIcon'
import CategoryIcon from '../../ui/CategoryIcon'
import PriorityBars from '../../ui/PriorityBars'
import AppHeader from '../../app/AppHeader'
import Fab from '../../app/Fab'
import TaskItem from '../task/TaskItem'
import DeferModal from '../task/DeferModal'
import { Analytics } from '../../adapters/analytics'
import { Store as StoreIcon, Tag } from 'lucide-react-native'
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import {
  effectiveDashboardTiles,
  dashboardTileKey,
  countTodosForFilterSet,
} from '../../../../core/src/logic/filters'
import type { DashboardTile } from '../../../../core/src/data/profile'

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

  // Split the today-actionable bucket so the dashboard can title each
  // group separately: "Carried over" = own dueDate strictly before today;
  // "Today" = everything else (due today, or sub-driven with no/future
  // own date). No cap — the outer ScrollView scrolls.
  const carriedOverItems = useMemo(
    () => todayBucket.filter((td) => !!td.dueDate && td.dueDate < today),
    [todayBucket, today],
  )
  const todayDueItems = useMemo(
    () => todayBucket.filter((td) => !(td.dueDate && td.dueDate < today)),
    [todayBucket, today],
  )


  // "What's Next?" cycles through Todos' time buckets in order. State:
  //   `nextExpanded` — section visible / TODAY's content collapsed.
  //   `nextGroupKey` — which bucket is being shown (sticks even when
  //     the user empties it by completing things, so we can render
  //     an empty-state inside it and advance to the next bucket).
  const NEXT_GROUP_SEQUENCE: GroupKey[] = ['overdue', 'week', 'upcoming', 'noDate']
  const [nextExpanded, setNextExpanded] = useState(false)
  const [nextGroupKey, setNextGroupKey] = useState<GroupKey | null>(null)

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

  const nextPreviewItems = nextBucket.slice(0, TODAY_PREVIEW_CAP)

  const openTodos = useCallback(
    (filter?: Filter, scrollGroup?: string) => {
      if (filter) store.setFilter(filter)
      if (scrollGroup) sheets.requestTodosScroll(scrollGroup)
      navigation.navigate('Todos')
    },
    [navigation, store, sheets],
  )

  const openWhatsNext = useCallback(() => {
    setNextGroupKey(firstAvailableNextKey)
    setNextExpanded(true)
  }, [firstAvailableNextKey])
  // Advance to the next available group (used by the in-section
  // What's Next button when the current bucket has been emptied).
  const advanceToNextGroup = useCallback(() => {
    const next = nextGroupAfter(nextGroupKey)
    if (!next) return
    setNextGroupKey(next)
  }, [nextGroupKey, groupsByKey])

  // Effective tiles come from the store (defaults to Home/Work/Done when
  // the user hasn't customized). Computed there so the Manage Filter
  // badges stay in sync with what the Home tiles actually render.
  // Unified Dashboard pinned-card row (Todos filter sets + Shopping
  // store/dept pins), reconciled to the live pins each render. The user's
  // drag order persists to profile.dashboardTiles.
  const dashboardTiles = useMemo(
    () => effectiveDashboardTiles(store.profile),
    [store.profile],
  )
  const navigateTab = useCallback(
    (tab: 'Todos' | 'Groceries') => navigation.navigate(tab),
    [navigation],
  )
  const onReorderTiles = useCallback(
    (data: DashboardTile[]) =>
      store.saveProfile({ ...store.profile, dashboardTiles: data }),
    [store],
  )

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

  // Shared row renderer for the Home today/carried-over groups — keeps
  // the long TaskItem prop list in one place (and wires the series
  // skip/delete handlers the embedded TaskDetailsSheet needs).
  const renderRow = (td: Todo) => (
    <TaskItem
      key={td.id}
      todo={td}
      categories={store.categories}
      density={store.profile.density}
      celebrate={celebrate}
      playSound={playSound}
      onToggle={store.toggle}
      onMoveToTrash={store.moveToTrash}
      onSkip={store.skipTodo}
      onSkipSeries={store.skipSeriesFuture}
      onRestore={store.restoreFromTrash}
      onPermanentDelete={store.permanentlyDelete}
      onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
      onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
      onApplySeriesFutureEdits={store.applySeriesFutureEdits}
      onDetachFromSeries={store.detachFromSeries}
      onApplyRecurrenceChange={store.applyRecurrenceChange}
      onApplySeriesSubtasks={store.applySeriesSubtasks}
      onUpdatePriority={store.updatePriority}
      onUpdateDueDate={store.updateDueDate}
      onSnooze={store.snooze}
      onLongPressDefer={openSingleDefer}
      onUpdateCategory={store.updateTaskCategory}
      onUpdateText={store.updateText}
      onUpdateNotes={store.updateNotes}
      onUpdateRecurrence={store.updateRecurrence}
      onUpdateReminder={store.updateReminder}
      onUpdateReminders={store.updateReminders}
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
  )

  // PebbleStrip on Home is rendered conditionally when this screen is
  // focused — its useEffect handles flight-target registration on
  // mount, so simply mounting/unmounting it as focus shifts gives us
  // the correct cairn target without manual register/clear plumbing
  // here. Todos has the same focus-gate pattern.
  const isFocused = useIsFocused()

  // Day-1 / "empty workspace" mode: when there are NO non-trashed
  // todos anywhere, the Dashboard collapses to a single full-screen
  // welcome empty state. Hides the pebble strip, TODAY band, tile
  // row, and What's Next button — all of which have no meaning when
  // the user has no items. Reveals each surface progressively as the
  // user invests (adds first todo → TODAY band + tiles return; checks
  // one off → pebble strip becomes informative). The FAB stays
  // visible as a secondary "add" affordance for users who'd rather
  // tap the corner than the centered card.
  if (store.activeCount === 0) {
    const firstName =
      store.profile.firstName?.trim() || store.profile.name?.trim() || ''
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <AppHeader onGearPress={sheets.openSettings} />
        <View style={styles.dayOneEmptyWrap}>
          <EmptyStateCard
            title={firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
            hint="Let's add your first to-do."
            actionLabel="Add a to-do"
            onAction={() => {
              void Analytics.emptyStateCtaTapped('todos')
              sheets.openCompose()
            }}
          />
        </View>
        <Fab
          onPress={() => {
            void Analytics.fabTapped('dashboard')
            sheets.openCompose()
          }}
          accessibilityLabel={t.addPlaceholder}
          agentEnabled={store.profile.agentEnabled !== false}
        />
      </View>
    )
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <AppHeader onGearPress={sheets.openSettings} />
      {/* PebbleStrip removed — completion celebration moved to the
          Mochi avatar in AppHeader, which does a happy-dance on
          every check-off (animation-aware). */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Today section — actionable focus right at the top. When
            today's bucket is empty the chip becomes "done" and routes
            to the Done filter (review surface), since there's no "to
            do" left to land on in Todos.
            Zero-zero case (no open + no done today): render as a
            plain label, no chevron, no tap target — there's nowhere
            useful to navigate. Reads as a quiet section header
            instead of a misleading "0 done →" scoreboard. */}
        {/* When What's Next is expanded, the TODAY band collapses so the
            next group can take focus. Otherwise: an empty state when
            nothing's actionable, or the TODAY + CARRIED OVER groups (each
            unlimited; the page scrolls). */}
        {nextExpanded ? null : todayBucket.length === 0 ? (
          <>
            {/* Quiet TODAY header above the empty state. */}
            {openCount === 0 && store.todayPebbles === 0 ? (
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>TODAY</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.sectionHeaderRow}
                onPress={() => openTodos('done')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Open Todos showing Done items"
              >
                <Text style={styles.sectionHeader}>TODAY</Text>
                <View style={styles.sectionRight}>
                  <Text style={styles.sectionCount}>{`${store.todayPebbles} done`}</Text>
                  <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
                </View>
              </TouchableOpacity>
            )}
            {firstAvailableNextKey == null ? (
              <EmptyStateCard
                title="You're all caught up."
                hint="Add a to-do to get started."
                actionLabel="Add a to-do"
                onAction={() => {
                  void Analytics.emptyStateCtaTapped('todos')
                  sheets.openCompose()
                }}
              />
            ) : (
              <EmptyStateCard
                title="Nothing pending."
                subline={
                  store.todayPebbles === 0
                    ? undefined
                    : store.todayPebbles === 1
                      ? '1 done today.'
                      : `${store.todayPebbles} done today.`
                }
                hint="Enjoy the breathing room."
                actionLabel="What's Next?"
                onAction={openWhatsNext}
                actionAccessibilityLabel="What's Next? Ask Mochi or open the upcoming list."
              />
            )}
          </>
        ) : (
          <>
            {todayDueItems.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.sectionHeaderRow}
                  onPress={() => openTodos('open', 'today')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Open Todos, ${todayDueItems.length} due today`}
                >
                  <Text style={styles.sectionHeader}>TODAY</Text>
                  <View style={styles.sectionRight}>
                    <Text style={styles.sectionCount}>
                      {todayDueItems.length === 1
                        ? '1 to do'
                        : `${todayDueItems.length} to do`}
                    </Text>
                    <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>
                <View style={styles.todayList}>
                  {todayDueItems.map(renderRow)}
                </View>
              </>
            )}
            {carriedOverItems.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.sectionHeaderRow}
                  onPress={() => openTodos('open', 'overdue')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Open Todos, ${carriedOverItems.length} carried over`}
                >
                  <Text style={styles.sectionHeader}>CARRIED OVER</Text>
                  <View style={styles.sectionRight}>
                    <Text style={styles.sectionCount}>
                      {carriedOverItems.length === 1
                        ? '1 to do'
                        : `${carriedOverItems.length} to do`}
                    </Text>
                    <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>
                <View style={styles.todayList}>
                  {carriedOverItems.map(renderRow)}
                </View>
              </>
            )}
          </>
        )}

        {/* NEXT — open todos NOT due today, surfaced inline when the
            user taps "What's Next?". Same paging UX as TODAY. Tap the
            header chevron to collapse. */}
        {nextExpanded && (
          <>
            <View style={styles.sectionHeaderRow}>
              <TouchableOpacity
                onPress={() => setNextExpanded(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Collapse ${nextSectionLabel}`}
              >
                <Text style={styles.sectionHeader}>
                  {nextSectionLabel.toUpperCase()}
                </Text>
              </TouchableOpacity>
              <View style={styles.sectionRight}>
                {nextBucket.length === 0 ? (
                  <Text style={styles.sectionCount}>nothing queued</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.sectionRight}
                    onPress={() =>
                      nextGroupKey && openTodos('open', nextGroupKey)
                    }
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Open Todos showing ${nextBucket.length} ${nextSectionLabel} items`}
                  >
                    <Text style={styles.sectionCount}>
                      {nextBucket.length === 1
                        ? '1 open'
                        : `${nextBucket.length} open`}
                    </Text>
                    <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setNextExpanded(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse"
                >
                  <Text style={styles.sectionCollapse}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
            {nextBucket.length === 0 ? (
              // Group emptied (or starting empty) — mirror TODAY's
              // empty state via the shared EmptyStateCard. The
              // "What's Next?" button advances to the next available
              // group; hidden on the last group so the user lands
              // cleanly at the end.
              <EmptyStateCard
                title="Nothing pending."
                hint="Enjoy the breathing room."
                actionLabel={hasNextGroupAfter ? "What's Next?" : undefined}
                onAction={hasNextGroupAfter ? advanceToNextGroup : undefined}
                actionAccessibilityLabel="Show the next group"
              />
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
                    onSkip={store.skipTodo}
                    onRestore={store.restoreFromTrash}
                    onPermanentDelete={store.permanentlyDelete}
                    onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
                    onApplySeriesFutureEdits={store.applySeriesFutureEdits}
                onDetachFromSeries={store.detachFromSeries}
                onApplyRecurrenceChange={store.applyRecurrenceChange}
                onApplySeriesSubtasks={store.applySeriesSubtasks}
                    onUpdatePriority={store.updatePriority}
                    onUpdateDueDate={store.updateDueDate}
                    onSnooze={store.snooze}
                    onLongPressDefer={openSingleDefer}
                    onUpdateCategory={store.updateTaskCategory}
                    onUpdateText={store.updateText}
                    onUpdateNotes={store.updateNotes}
                    onUpdateRecurrence={store.updateRecurrence}
                    onUpdateReminder={store.updateReminder}
                onUpdateReminders={store.updateReminders}
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
          scrolls so any number of picks lays out cleanly.
          Also hidden when ALL picked tiles have zero count — no point
          rendering a sticky strip of "0 / 0 / 0", and the per-tile
          filter below already drops the zero entries. */}
      {/* Unified pinned-card row — Todos filter sets + Shopping pins,
          horizontally scrollable, each with its live stat count. Long-press
          a card to drag-reorder (order persists to profile.dashboardTiles);
          tap to open it in the right tab. Replaces the old Manage-Tiles
          stat row. */}
      {dashboardTiles.length > 0 && (
        <View style={styles.statsRowSticky}>
          <DraggableFlatList
            horizontal
            data={dashboardTiles}
            keyExtractor={(item) => dashboardTileKey(item)}
            onDragEnd={({ data }) => onReorderTiles(data)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRowScroll}
            renderItem={({ item, drag, isActive }: RenderItemParams<DashboardTile>) => {
              const r = resolveDashboardTile(item, store, t, theme, navigateTab)
              return (
                <ScaleDecorator>
                  <TouchableOpacity
                    style={[styles.statTile, isActive && styles.statTileDragging]}
                    onPress={r.onPress}
                    onLongPress={drag}
                    disabled={isActive}
                    delayLongPress={200}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.label}, ${r.count}. Tap to open; long-press to reorder.`}
                  >
                    <Text style={styles.statValue}>{r.count}</Text>
                    <View style={styles.statLabelRow}>
                      {r.icon}
                      <Text style={styles.statLabel} numberOfLines={1}>
                        {r.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </ScaleDecorator>
              )
            }}
          />
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
        onPress={() => {
          void Analytics.fabTapped('dashboard')
          sheets.openCompose()
        }}
        accessibilityLabel={t.addPlaceholder}
        agentEnabled={store.profile.agentEnabled !== false}
      />
    </View>
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
  if (isPriorityFilter(f)) {
    const p = priorityFromFilter(f)
    return {
      icon: <PriorityBars level={p} size={11} />,
      label: t.priority[p],
      count: store.byPriority[p] ?? 0,
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

/** Resolve a unified Dashboard tile (Todos filter set OR a Shopping
 * store/dept pin) to its label, stat count, icon, and tap action. */
function resolveDashboardTile(
  tile: DashboardTile,
  store: ReturnType<typeof useStore>,
  t: ReturnType<typeof useLang>['t'],
  theme: ThemeColors,
  navigate: (tab: 'Todos' | 'Groceries') => void,
): { label: string; count: number; icon: React.ReactNode; onPress: () => void } {
  if (tile.kind === 'todoFilter') {
    const parts = tile.set.map((f) => resolveTile(f as Filter, store, t, theme))
    return {
      label: parts.map((p) => p.label).join(' + ') || (t.filters.all ?? 'All'),
      count: countTodosForFilterSet(store.todos, tile.set),
      icon:
        parts[0]?.icon ?? (
          <CheckCircle2 size={11} color={theme.primary} strokeWidth={2.4} />
        ),
      onPress: () => {
        // Single-selection: clear any prior selection, then apply ONLY
        // this card's filter set — tapping a card never accumulates onto
        // a previously-active filter.
        store.clearFilters()
        store.setFilters(tile.set as Filter[])
        navigate('Todos')
      },
    }
  }
  if (tile.kind === 'groceryStore') {
    return {
      label: tile.store,
      count: store.groceries.filter(
        (g) => !g.checked && g.stores.includes(tile.store),
      ).length,
      icon: <StoreIcon size={11} color={theme.primary} strokeWidth={2.4} />,
      onPress: () => {
        // Dashboard cards are single-select: a store card clears any active
        // department (the Shopping screen's pills still allow store + dept).
        store.setActiveGroceryDept(undefined)
        store.setActiveGroceryStore(tile.store)
        navigate('Groceries')
      },
    }
  }
  // groceryDept
  const grp = store.groceryGroups.find((g) => g.id === tile.dept)
  return {
    label: grp?.label ?? tile.dept,
    count: store.groceries.filter((g) => !g.checked && g.groupId === tile.dept)
      .length,
    icon: <Tag size={11} color={theme.primary} strokeWidth={2.4} />,
    onPress: () => {
      // Single-select from the Dashboard: clear any active store first.
      store.setActiveGroceryStore(undefined)
      store.setActiveGroceryDept(tile.dept)
      navigate('Groceries')
    },
  }
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    // Day-1 empty mode: center the welcome EmptyStateCard in the
    // remaining VISIBLE viewport (between AppHeader and the
    // tab bar). flex:1 absorbs space; paddingBottom approximates
    // the bottom tab bar height (~84pt iOS w/ safe area) so the
    // card sits at the true optical center instead of the
    // geometric center of the full-screen flex region (which would
    // hide partially behind the tab bar's perceived weight).
    dayOneEmptyWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingBottom: 84,
    },
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
      color: c.primaryOn,
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
      marginRight: 10,
    },
    statTileDragging: {
      opacity: 0.9,
      borderWidth: 1,
      borderColor: c.primary,
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
