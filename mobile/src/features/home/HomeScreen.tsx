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
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { ChevronRight } from 'lucide-react-native'
import { useStore } from '../../app/StoreContext'
import { useLang } from '../../app/LangContext'
import { useSheets } from '../../app/SheetContext'
import { useTheme, ThemeColors } from '../../app/theme'
import { todayLocal } from '../../../../core/src/logic/utils'
import { type Todo, type Filter } from '../../../../core/src/domain/types'
import { buildGroups, type GroupKey } from '../../../../core/src/logic/groups'
import EmptyStateCard from '../../ui/EmptyStateCard'
import AppHeader from '../../app/AppHeader'
import Fab from '../../app/Fab'
import TaskItem from '../task/TaskItem'
import DeferModal from '../task/DeferModal'
import { Analytics } from '../../adapters/analytics'

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
  const navigation = useNavigation<any>()
  const sheets = useSheets()

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
  // Pass-through render of TaskItem for each row, so Home inherits the
  // unified tap/long-press/swipe model and the embedded TaskDetailsSheet
  // for free. The only Home-local state is the single-todo Defer modal
  // — TaskItem's onLongPressDefer prop bubbles up here.
  const celebrate = store.animationOn
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
      <View style={styles.flex}>
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
            sheets.openCapture()
          }}
          accessibilityLabel={t.addPlaceholder}
          agentEnabled={store.profile.agentEnabled !== false}
        />
      </View>
    )
  }

  return (
    <View style={styles.flex}>
      <AppHeader onGearPress={sheets.openSettings} />
      {/* No PebbleStrip on Home anymore — pebble flights now target the Mochi
          avatar in AppHeader (it happy-dances on every check-off, motion-aware).
          The PebbleStrip component still exists; it's just not rendered here. */}
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
                actionLabel="Peek ahead"
                onAction={openWhatsNext}
                actionAccessibilityLabel="Peek ahead — show what's coming up next."
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
                actionLabel={hasNextGroupAfter ? "Peek ahead" : undefined}
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
      {/* Add FAB — same component Todos uses; the compose sheet lives in
          SheetContext so this can fire from any tab. Sits alone above the tab
          bar now that the stat strip is gone (the calm "doorway"). */}
      <Fab
        onPress={() => {
          void Analytics.fabTapped('dashboard')
          sheets.openCapture()
        }}
        accessibilityLabel={t.addPlaceholder}
        agentEnabled={store.profile.agentEnabled !== false}
      />
    </View>
  )
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
      paddingHorizontal: 16,
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
      paddingVertical: 8,
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
      paddingVertical: 8,
    },
    todayMoreText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    footnote: {
      fontSize: 13,
      color: c.label2,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
