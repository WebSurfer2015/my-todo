/**
 * Home tab — the calm landing pad. Top of the screen now surfaces the
 * "Today" bucket so a quick check-in on Home immediately answers
 * "what do I need to do right now?" without jumping to Todos.
 *
 * "Today" = open to-dos with work still due today or earlier, split into
 * TODAY and CARRIED OVER (own date before today). The rules are pure and
 * tested in core/src/logic/homeDashboard.ts; done rows leave the section.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useIsFocused, useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native'
import { ChevronRight } from 'lucide-react-native'
import { useStore } from '../../app/StoreContext'
import { useLang } from '../../app/LangContext'
import { useSheets } from '../../app/SheetContext'
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from '../../app/theme'
import { todayLocal } from '../../../../core/src/logic/utils'
import {
  completionCounts,
  splitCarriedOver,
  todayActionable,
} from '../../../../core/src/logic/homeDashboard'
import { type Todo, type Filter, type Priority } from '../../../../core/src/domain/types'
import { buildGroups, type GroupKey } from '../../../../core/src/logic/groups'

// "What's Next?" walks Todos' time buckets in this order.
const NEXT_GROUP_SEQUENCE: GroupKey[] = ['overdue', 'week', 'upcoming', 'noDate']

/** The first bucket after `current` (or the first available one when nothing
 * is selected yet) that currently has open todos; null when none. */
function nextGroupAfter(
  current: GroupKey | null,
  firstAvailable: GroupKey | null,
  groupsByKey: Partial<Record<GroupKey, readonly unknown[]>>,
): GroupKey | null {
  if (!current) return firstAvailable
  const i = NEXT_GROUP_SEQUENCE.indexOf(current)
  for (let j = i + 1; j < NEXT_GROUP_SEQUENCE.length; j++) {
    if ((groupsByKey[NEXT_GROUP_SEQUENCE[j]]?.length ?? 0) > 0) return NEXT_GROUP_SEQUENCE[j]
  }
  return null
}
import EmptyStateCard from '../../ui/EmptyStateCard'
import AppHeader from '../../app/AppHeader'
import Fab from '../../app/Fab'
import TaskItem, { closeOpenSwipeable } from '../task/TaskItem'
import DeferModal from '../task/DeferModal'

const TODAY_PREVIEW_CAP = 6

export default function HomeScreen() {
  const store = useStore()
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const navigation = useNavigation<NavigationProp<ParamListBase>>()
  const sheets = useSheets()
  // Leaving the tab closes any half-open swipe row (scroll does too).
  const isFocused = useIsFocused()
  useEffect(() => {
    if (!isFocused) closeOpenSwipeable()
  }, [isFocused])

  const today = todayLocal()

  // Dashboard rules live in core (homeDashboard): completion counts, the
  // today-actionable inclusion rule + sort (in the user's priority order),
  // and the carried-over / due-today split. No grace period — done rows
  // leave as soon as they flip, matching the Todos-tab Open filter.
  const counts = useMemo(() => completionCounts(store.todos, today), [store.todos, today])
  // orderedPriorities is rebuilt every store render; key the memo on its
  // contents so the bucket only re-sorts when the order really changes.
  const priorityKey = store.orderedPriorities.map((p) => p.id).join(',')
  const priorityOrder = useMemo(
    () => priorityKey.split(',') as Priority[],
    [priorityKey],
  )
  const todayBucket = useMemo(
    () => todayActionable(store.todos, today, priorityOrder),
    [store.todos, today, priorityOrder],
  )
  const { carriedOver: carriedOverItems, dueToday: todayDueItems } = useMemo(
    () => splitCarriedOver(todayBucket, today),
    [todayBucket, today],
  )

  // "What's Next?" cycles through Todos' time buckets in order. State:
  //   `nextExpanded` — section visible / TODAY's content collapsed.
  //   `nextGroupKey` — which bucket is being shown (sticks even when
  //     the user empties it by completing things, so we can render
  //     an empty-state inside it and advance to the next bucket).
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
    [groupsByKey],
  )

  // Given the currently-shown group key, find the next sequence entry
  // that has open todos. null when there's nothing left — drives the
  // "no What's Next button on the last group" rule.

  // Open to-dos with no date — they never surface on Today, so the
  // Today empty state points at them instead of reading "Nothing pending".
  const undatedCount = groupsByKey.noDate?.length ?? 0

  const nextBucket = nextGroupKey ? groupsByKey[nextGroupKey] ?? [] : []
  const nextSectionLabel = nextGroupKey ? t.groups[nextGroupKey] : "What's next"
  const hasNextGroupAfter = nextGroupAfter(nextGroupKey, firstAvailableNextKey, groupsByKey) !== null

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
  // Peek ahead from beside CARRIED OVER: those rows are already on screen,
  // so start past the overdue bucket. null = nothing further ahead.
  const firstPeekPastCarriedKey = useMemo<GroupKey | null>(
    () => nextGroupAfter('overdue', null, groupsByKey),
    [groupsByKey],
  )
  const peekPastCarried = useCallback(() => {
    setNextGroupKey(firstPeekPastCarriedKey)
    setNextExpanded(true)
  }, [firstPeekPastCarriedKey])
  // Advance to the next available group (used by the in-section
  // What's Next button when the current bucket has been emptied).
  const advanceToNextGroup = useCallback(() => {
    const next = nextGroupAfter(nextGroupKey, firstAvailableNextKey, groupsByKey)
    if (!next) return
    setNextGroupKey(next)
  }, [nextGroupKey, firstAvailableNextKey, groupsByKey])

  // Pass-through render of TaskItem for each row, so Home inherits the
  // unified tap/long-press/swipe model; a row tap opens the details sheet
  // hosted once in SheetContext (via TaskDetailsOpenContext). The only
  // Home-local state is the single-todo Defer modal — TaskItem's
  // onLongPressDefer prop bubbles up here.
  const celebrate = store.animationOn
  const playSound = store.profile.completionSound !== false

  const [deferTarget, setDeferTarget] = useState<Todo | null>(null)
  const openSingleDefer = useCallback((todo: Todo) => {
    setDeferTarget(todo)
  }, [])

  // Shared row renderer for the Home today/carried-over groups — keeps
  // the long TaskItem prop list in one place.
  const renderRow = (td: Todo) => (
    <TaskItem
      key={td.id}
      todo={td}
      categories={store.categories}
      celebrate={celebrate}
      playSound={playSound}
      onToggle={store.toggle}
      onMoveToTrash={store.moveToTrash}
      onSkip={store.skipTodo}
      onRestore={store.restoreFromTrash}
      onPermanentDelete={store.permanentlyDelete}
      onUpdatePriority={store.updatePriority}
      onUpdateDueDate={store.updateDueDate}
      onLongPressDefer={openSingleDefer}
      onUpdateCategory={store.updateTaskCategory}
      onAddSubtask={store.addSubtask}
      onToggleSubtask={store.toggleSubtask}
      onUpdateSubtaskText={store.updateSubtaskText}
      onUpdateSubtaskPriority={store.updateSubtaskPriority}
      onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
      onRemoveSubtask={store.removeSubtask}
      subtaskVisibility="open"
      dateChipFormat="home-today"
      subtaskDateFilter="due-today"
    />
  )

  // The quiet TODAY header used whenever nothing is due today: a plain
  // label, or a "Done" link when something was finished today.
  const quietTodayHeader =
    counts.today === 0 ? (
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
          <Text style={styles.sectionCount}>Done</Text>
          <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
        </View>
      </TouchableOpacity>
    )

  // Day-1 / "empty workspace" mode: when there are NO non-trashed
  // todos anywhere, the Dashboard collapses to a single full-screen
  // welcome empty state. Hides the TODAY band, tile row, and What's
  // Next button — all of which have no meaning when the user has no
  // items. Reveals each surface progressively as the user invests
  // (adds first todo → TODAY band + tiles return). The FAB stays
  // visible as a secondary "add" affordance for users who'd rather
  // tap the corner than the centered card.
  if (store.activeCount === 0) {
    const firstName =
      store.profile.firstName?.trim() || store.profile.name?.trim() || ''
    // A returning user who finished everything isn't new: no first-day
    // welcome — a quiet day, and where their finished work went.
    const hasDone = store.todos.some((td) => td.done || td.trashed)
    return (
      <View style={styles.flex}>
        <AppHeader onGearPress={sheets.openSettings} />
        <View style={styles.dayOneEmptyWrap}>
          <EmptyStateCard
            title={hasDone ? 'A quiet day. Nothing on your plate.' : firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
            hint={hasDone ? 'What you finished is resting in Done.' : "Let's add your first to-do."}
            actionLabel="Add a to-do"
            onAction={() => {
              // Same front door as the + button (Mochi when that's the
              // last-used capture surface).
              sheets.openCapture()
            }}
          />
        </View>
        <Fab
          onPress={() => {
            sheets.openCapture()
          }}
          accessibilityLabel="Add a to-do"
          agentEnabled={store.profile.agentEnabled !== false}
        />
      </View>
    )
  }

  return (
    <View style={styles.flex}>
      <AppHeader onGearPress={sheets.openSettings} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closeOpenSwipeable}
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
            {quietTodayHeader}
            {undatedCount > 0 ? (
              // Undated captures (e.g. a first to-do via Mochi) never land
              // on Today — point at them so they don't seem to vanish.
              <EmptyStateCard
                title="Nothing due today."
                subline={
                  undatedCount === 1
                    ? '1 to-do without a date is waiting in Todos.'
                    : `${undatedCount} to-dos without a date are waiting in Todos.`
                }
                actionLabel={undatedCount === 1 ? 'See it' : 'See them'}
                onAction={() => openTodos('open', 'noDate')}
                actionAccessibilityLabel="Open Todos at the to-dos without a date"
              />
            ) : firstAvailableNextKey == null ? (
              <EmptyStateCard
                title="You're all caught up."
                hint="Add a to-do to get started."
                actionLabel="Add a to-do"
                onAction={() => {
                  sheets.openCapture()
                }}
              />
            ) : (
              <EmptyStateCard
                title="Nothing pending."
                subline={counts.today === 0 ? undefined : 'What you finished is resting in Done.'}
                hint="Enjoy the breathing room."
                actionLabel="Peek ahead"
                onAction={openWhatsNext}
                actionAccessibilityLabel="Peek ahead — show what's coming up next."
              />
            )}
          </>
        ) : (
          <>
            {todayDueItems.length === 0 ? (
              // Only carried-over rows: keep the TODAY header so the day
              // still has a home, say so in one quiet line, and offer the
              // same Peek ahead the empty state does.
              <>
                {quietTodayHeader}
                <View style={styles.quietLineRow}>
                  <Text style={styles.quietLine}>Nothing due today.</Text>
                  {firstPeekPastCarriedKey != null && (
                    <TouchableOpacity
                      onPress={peekPastCarried}
                      hitSlop={8}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Peek ahead — show what's coming up next."
                    >
                      <Text style={styles.quietLink}>Peek ahead</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
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
                  accessibilityLabel="Open Todos at Carried over"
                >
                  <Text style={styles.sectionHeader}>CARRIED OVER</Text>
                  <View style={styles.sectionRight}>
                    {/* No count here: a carried-over number is a guilt counter
                        (FilterBar hides it for the same reason). */}
                    <Text style={styles.sectionCount}>View</Text>
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
                onPress={() => nextGroupKey && openTodos('open', nextGroupKey)}
                disabled={!nextGroupKey}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Open Todos showing ${nextSectionLabel} items`}
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
                    celebrate={celebrate}
                    playSound={playSound}
                    onToggle={store.toggle}
                    onMoveToTrash={store.moveToTrash}
                    onSkip={store.skipTodo}
                    onRestore={store.restoreFromTrash}
                    onPermanentDelete={store.permanentlyDelete}
                    onUpdatePriority={store.updatePriority}
                    onUpdateDueDate={store.updateDueDate}
                    onLongPressDefer={openSingleDefer}
                    onUpdateCategory={store.updateTaskCategory}
                    onAddSubtask={store.addSubtask}
                    onToggleSubtask={store.toggleSubtask}
                    onUpdateSubtaskText={store.updateSubtaskText}
                    onUpdateSubtaskPriority={store.updateSubtaskPriority}
                    onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
                    onRemoveSubtask={store.removeSubtask}
                    subtaskVisibility="open"
                    dateChipFormat="home-today"
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
          sheets.openCapture()
        }}
        accessibilityLabel="Add a to-do"
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
    body: { paddingHorizontal: 20, gap: SPACING.lg, paddingTop: SPACING.xs },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.xs,
      marginBottom: -8,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.sm,
    },
    sectionHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: c.label2,
    },
    sectionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    sectionCount: {
      fontSize: TYPE.caption,
      fontWeight: '600',
      color: c.label2,
      letterSpacing: 0.2,
    },
    // "Nothing due today." + Peek ahead, when only carried-over rows exist.
    quietLineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.xs,
      marginTop: SPACING.xs,
    },
    quietLine: {
      fontSize: TYPE.footnote,
      color: c.label2,
    },
    quietLink: {
      fontSize: TYPE.footnote,
      fontWeight: '600',
      color: c.primary,
    },
    sectionCollapse: {
      fontSize: TYPE.title,
      lineHeight: 18,
      color: c.label2,
      fontWeight: '300',
      marginLeft: 2,
    },
    todayCard: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      overflow: 'hidden',
      marginTop: SPACING.sm,
    },
    // Container for TaskItem rows on Home. TaskItem already supplies its
    // own row background + border; this wrapper just gives the cluster a
    // little top spacing under the section header.
    todayList: {
      marginTop: SPACING.sm,
      gap: SPACING.xs,
    },
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
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
      fontSize: TYPE.footnote,
      fontWeight: '700',
      lineHeight: 14,
    },
    todayBody: { flex: 1, gap: 2 },
    todayText: {
      fontSize: TYPE.body,
      color: c.label,
      lineHeight: 20,
    },
    todayTextDone: {
      color: c.label2,
      textDecorationLine: 'line-through',
    },
    todayMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: 2,
    },
    todayMeta: {
      fontSize: TYPE.caption,
      color: c.label2,
      maxWidth: 120,
    },
    todayMetaSep: {
      fontSize: TYPE.caption,
      color: c.label2,
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
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
    },
    todayPaginator: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingTop: SPACING.xs,
    },
    todayPaginatorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.sm,
      minWidth: 80,
    },
    todayPaginatorCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm,
    },
    todayMoreText: {
      fontSize: TYPE.footnote,
      fontWeight: '600',
      color: c.primary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    footnote: {
      fontSize: TYPE.footnote,
      color: c.label2,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
  })
}
