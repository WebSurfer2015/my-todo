import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  ScrollView,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Alert,
  useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronRight, ChevronDown } from "lucide-react-native";
import {
  useTheme,
  ThemeColors,
  ThemeOverrideProvider,
  DEFAULT_THEME,
} from "./src/app/theme";
import { type Avatar as AvatarT } from "./src/core-bindings/profile";
// Side-effect import: registers the foreground notification handler at
// boot so a push arriving while the app is open isn't silently dropped.
import "./src/adapters/notifications";
// Side-effect: install the global uncaught-JS-error → Crashlytics handler.
import "./src/adapters/globalErrorHandler";
import FilterBar from "./src/features/filters/FilterBar";
import Fab from "./src/app/Fab";
import TaskItem from "./src/features/task/TaskItem";
import Footer from "./src/app/Footer";
import Avatar from "./src/ui/Avatar";
import GroceryView from "./src/features/groceries/GroceryView";
import SearchTopSheet from "./src/features/filters/SearchTopSheet";
import SearchPill from "./src/features/filters/SearchPill";
import DeferModal from "./src/features/task/DeferModal";
import { SEED_GROCERY_STORES } from "./src/core-bindings/groceries";
import type { Filter } from "./src/core-bindings/types";
import { LangProvider, useLang } from "./src/app/LangContext";
import { AuthProvider, useAuth } from "./src/app/AuthContext";
import { NotifyProvider } from "./src/app/notify";
import { PebbleFlightProvider } from "./src/features/mochi/PebbleFlight";
import { ErrorBoundary } from "./src/app/ErrorBoundary";
import { useTodoStore } from "./src/store/useTodoStore";
import { buildDoneGroups, type TodoGroup, type DoneGroup } from "../core/src/logic/groups";
import { useLinger } from "./src/features/task/useLinger";
import { fullDateLabel } from "./src/core-bindings/utils";
import { todayLocal } from "../core/src/logic/utils";
import type { Todo } from "./src/core-bindings/types";
import SignIn from "./src/features/auth/SignIn";
import EmptyStateCard from "./src/ui/EmptyStateCard";
import { Analytics } from "./src/adapters/analytics";
import Onboarding from "./src/features/onboarding/Onboarding";
import SplashOverlay from "./src/app/SplashOverlay";
import { cancelDailyCheckin, syncTodoReminders } from "./src/adapters/notifications";
import { installCrashReporters } from "./src/adapters/crashReporting";

// Install crash reporters before any React code runs so even very early
// failures get forwarded to Crashlytics. Idempotent — safe to call once
// at module-load.
installCrashReporters();
import { NavigationContainer, useIsFocused } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { House, ListTodo, ShoppingBag } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { StoreProvider, useStore } from "./src/app/StoreContext";
import { PurchasesProvider } from "./src/app/PurchasesContext";
import { SheetProvider, useSheets, sheetNavigationRef } from "./src/app/SheetContext";
import HomeScreen from "./src/features/home/HomeScreen";
import GroceriesScreen from "./src/features/groceries/GroceriesScreen";
import AppHeader from "./src/app/AppHeader";

// SectionList section shapes for the two virtualized branches. Each carries
// its source group alongside `data` (the rows the list renders) so the
// section-header renderer can read labels/counts/collapse state.
type GroupedSection = { key: string; group: TodoGroup; data: Todo[] };
type DoneSection = { key: string; group: DoneGroup; data: Todo[] };

function TodosScreen() {
  const { t } = useLang();
  const { user, loading: authLoading } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const store = useStore();
  const safeArea = useSafeAreaInsets();
  // True only while the Todos tab is the active tab in the bottom
  // navigator. Used to gate the search top-sheet's <Modal> visibility
  // so it doesn't leak above Home / Groceries when the user switches
  // tabs mid-search. State (searchOpen + searchQuery) persists across
  // tab switches; only the rendered Modal is suppressed when blurred.
  const isFocused = useIsFocused();

  // Profile / Settings / Background picker / Compose now live in
  // SheetContext at the app shell so they're reachable from any tab.
  // Mochi ("Ask Mochi") now lives in SheetContext, entered from the
  // compose sheet. CategorySheet moved to SheetContext so Settings →
  // Manage Todos can open it from any tab.
  const sheets = useSheets();
  // Scroll-to-group: the Dashboard's "N open →" links ask us (via
  // sheets.todosScrollRequest) to scroll to a date-bucket group. With the
  // grouped view virtualized into a SectionList, we map the requested
  // group key → its sectionIndex and scrollToLocation onto its header.
  // The sticky filter now lives ABOVE the list (pinned, not scrolling), so
  // no manual offset is needed — viewPosition 0 lands the header at the top
  // of the list viewport. `pendingScrollRef` lets onScrollToIndexFailed
  // retry once when variable row heights leave the offset unknown.
  const sectionListRef = useRef<SectionList<Todo, GroupedSection>>(null);
  const stickyHRef = useRef(0);
  const pendingScrollRef = useRef<number | null>(null);
  const scrollReq = sheets.todosScrollRequest;
  useEffect(() => {
    if (!scrollReq.group || scrollReq.seq === 0) return;
    const targetGroup = scrollReq.group;
    const sectionIndex = displayGroups.findIndex((g) => g.key === targetGroup);
    if (sectionIndex < 0) return;
    // A collapsed target has an empty `data`; scrolling to itemIndex 0 of an
    // empty section is unreliable, so expand it first and scroll next tick.
    const toggleable = store.filter === "all" || store.filter === "open";
    if (toggleable && collapsedGroups.has(targetGroup)) {
      setCollapsedGroups((prev) => {
        if (!prev.has(targetGroup)) return prev;
        const next = new Set(prev);
        next.delete(targetGroup);
        return next;
      });
    }
    pendingScrollRef.current = sectionIndex;
    // Defer a beat so a just-changed filter (and just-expanded group) has
    // laid its sections out.
    const id = setTimeout(() => {
      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
        animated: true,
      });
    }, 140);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollReq.seq]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Defer modal: which group is being deferred (label for the
  // sub-title) and the open-todo ids in that bucket.
  const [deferTarget, setDeferTarget] = useState<{
    label: string
    ids: string[]
    isTodayGroup: boolean
  } | null>(null);
  // Stable callback for the per-row long-press defer. Opens the same
  // bottom-sheet picker the group action uses, scoped to one todo.
  const openSingleDefer = useCallback((todo: Todo) => {
    setDeferTarget({
      label: todo.text,
      ids: [todo.id],
      isTodayGroup: !!todo.dueDate && todo.dueDate === todayLocal(),
    });
  }, []);
  // Collapse state for All-view group headers. All four groups
  // (today/week/overdue/upcoming) are toggleable; today + week default
  // open (focus), overdue + upcoming default closed (history/later).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(["overdue", "upcoming"]),
  );
  const toggleGroupCollapsed = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // One-time JS splash overlay shown when AppInner first mounts. Hides
  // itself after the breath + fade animation. Only blocks once per cold
  // launch.
  const [splashShown, setSplashShown] = useState(true);
  // Onboarding is decided ONCE, the first time the store finishes
  // hydrating — then latched. Without the latch, a later profile-sync
  // tick (or any churn that momentarily lacks onboardingDone) could flip
  // `needed` true mid-session and pop "Meet Mochi" over the app (e.g.
  // when the user just tapped a to-do). It must only appear at first
  // login, never resurface after.
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const onboardingDecidedRef = useRef(false);
  useEffect(() => {
    if (!store.loaded || onboardingDecidedRef.current) return;
    onboardingDecidedRef.current = true;
    if (store.profile.onboardingDone !== true) setOnboardingNeeded(true);
  }, [store.loaded, store.profile.onboardingDone]);

  // Search narrows the already-filtered + grouped view (case-insensitive
  // substring over text/subtasks/notes). The linger projection (keeping a
  // just-toggled row visible at the bottom of its group until the filter
  // changes) and the filtered/grouped views it produces live in useLinger.
  const searchNeedle = searchQuery.trim().toLowerCase();
  const { displayFiltered, displayGroups } = useLinger(store, searchNeedle);

  // Guard against landing on a fully-collapsed Todos list: if every
  // group in the current view is collapsed (e.g., the default
  // ["overdue","upcoming"] start state on a day where Today + This
  // Week happen to be empty), auto-expand the first visible group so
  // the user lands on at least one open bucket rather than a wall
  // of headers.
  useEffect(() => {
    if (displayGroups.length === 0) return;
    const allCollapsed = displayGroups.every((g) =>
      collapsedGroups.has(g.key),
    );
    if (!allCollapsed) return;
    const firstKey = displayGroups[0].key;
    setCollapsedGroups((prev) => {
      if (!prev.has(firstKey)) return prev;
      const next = new Set(prev);
      next.delete(firstKey);
      return next;
    });
  }, [displayGroups, collapsedGroups]);

  // Daily check-in scheduling was removed pending a full notifications
  // & reminders redesign. Cancel any orphaned schedules from previous
  // versions so users don't keep getting old reminders. The profile
  // fields stay in core so opted-in state isn't destroyed.
  useEffect(() => {
    if (!store.loaded) return;
    cancelDailyCheckin().catch(() => {});
  }, [store.loaded]);

  // Auth + store-hydration + onboarding gates moved to AppGate, which
  // wraps the whole tab navigator. By the time this screen mounts those
  // are all guaranteed satisfied.

  // ── Virtualized list plumbing ──────────────────────────────────────
  // The default grouped view and the Done view are virtualized via
  // SectionList (a VirtualizedList must never nest in a ScrollView, so they
  // replace the scroller entirely for those branches). The bounded
  // branches — Trash, the empty state, and Overdue — stay in a plain
  // ScrollView. Collapse is offered only in the All / Open views, where the
  // date-bucket grouping shows; category / status filters always render
  // every group expanded.
  const toggleableGroups = store.filter === "all" || store.filter === "open";

  // Default grouped sections. A collapsed group keeps its header but has
  // empty `data`, so the chevron/expand affordance still works.
  const groupedSections: GroupedSection[] = useMemo(
    () =>
      displayGroups.map((g) => ({
        key: g.key,
        group: g,
        data: toggleableGroups && collapsedGroups.has(g.key) ? [] : g.todos,
      })),
    [displayGroups, toggleableGroups, collapsedGroups],
  );

  // Done sections — completion-date buckets, never collapsed.
  const doneSections: DoneSection[] = useMemo(
    () =>
      buildDoneGroups(displayFiltered).map((g) => ({
        key: g.key,
        group: g,
        data: g.todos,
      })),
    [displayFiltered],
  );

  // Shared across every row: derives from the current filter only, so the
  // value is identical for all rows in a render.
  const subtaskVisibility =
    store.filter === "open" ? "open" : store.filter === "done" ? "done" : "all";

  const keyExtractor = useCallback((td: Todo) => td.id, []);
  // 3px between cards (matches groupCard's `gap`); 18px below each section
  // (matches groupSection's marginBottom).
  const ItemSeparator = () => <View style={styles.taskGap} />;
  const SectionFooter = () => <View style={styles.sectionGap} />;

  // Per-row renderer for the default grouped view. Passes ONLY stable
  // store.* callbacks (no per-row closures) so TaskItem's React.memo holds.
  const renderGroupedItem = ({ item: td }: { item: Todo }) => (
    <View style={styles.taskCard}>
      <TaskItem
        todo={td}
        categories={store.categories}
        density={store.profile.density}
        celebrate={store.animationOn}
        playSound={store.profile.completionSound !== false}
        onToggle={store.toggle}
        onMoveToTrash={store.moveToTrash}
        onSkip={store.skipTodo} onSkipSeries={store.skipSeriesFuture}
        onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
        onApplySeriesFutureEdits={store.applySeriesFutureEdits}
        onDetachFromSeries={store.detachFromSeries}
        onApplyRecurrenceChange={store.applyRecurrenceChange}
        onApplySeriesSubtasks={store.applySeriesSubtasks}
        onPermanentDelete={store.permanentlyDelete} onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
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
        subtaskVisibility={subtaskVisibility}
      />
    </View>
  );

  // Collapsible date-bucket header (chevron + label + count + per-group
  // "Defer all"). Mirrors the former inline group-header JSX exactly.
  const renderGroupedHeader = ({ section }: { section: GroupedSection }) => {
    const group = section.group;
    const collapsed = toggleableGroups && collapsedGroups.has(group.key);
    const onToggle = toggleableGroups
      ? () => toggleGroupCollapsed(group.key)
      : undefined;
    const statusOverride =
      group.key === "overdue" || group.key === "done"
        ? store.orderedStatuses.find((s) => s.id === group.key)
        : null;
    const headerLabel = statusOverride
      ? statusOverride.label
      : t.groups[group.key];
    // Header counts include every to-do in the bucket (open + done) so the
    // number matches what's visible.
    const headerCount = group.todos.length;
    // Only OPEN todos in the bucket can be deferred; hidden when zero.
    const openInGroup = group.todos.filter((td) => !td.done);
    const openInGroupCount = openInGroup.length;
    return (
      <View style={styles.groupHeaderContainer}>
        {toggleableGroups ? (
          <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ expanded: !collapsed }}
            hitSlop={8}
            style={styles.groupHeaderRow}
          >
            {collapsed ? (
              <ChevronRight size={14} color={theme.label3} strokeWidth={2.5} />
            ) : (
              <ChevronDown size={14} color={theme.label3} strokeWidth={2.5} />
            )}
            <Text style={styles.groupHeader}>
              {headerLabel}
              {collapsed ? '' : ` (${headerCount})`}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.groupHeader, styles.groupHeaderSpacing]}>
            {headerLabel} ({headerCount})
          </Text>
        )}
        {openInGroupCount > 0 &&
          group.key !== 'upcoming' &&
          group.key !== 'noDate' && (
            <TouchableOpacity
              onPress={() =>
                setDeferTarget({
                  label: headerLabel,
                  ids: openInGroup.map((td) => td.id),
                  isTodayGroup: group.key === 'today',
                })
              }
              style={styles.groupHeaderDeferBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Defer ${openInGroupCount} to-dos in ${headerLabel}`}
            >
              <Text style={styles.groupHeaderDeferText}>Defer all →</Text>
            </TouchableOpacity>
        )}
      </View>
    );
  };

  // Per-row renderer for the Done view (binFilterView + full subtask props).
  const renderDoneItem = ({ item: td }: { item: Todo }) => (
    <View style={styles.taskCard}>
      <TaskItem
        todo={td}
        categories={store.categories}
        density={store.profile.density}
        celebrate={store.animationOn}
        playSound={store.profile.completionSound !== false}
        binFilterView
        onToggle={store.toggle}
        onMoveToTrash={store.moveToTrash}
        onSkip={store.skipTodo} onSkipSeries={store.skipSeriesFuture}
        onRestore={store.restoreFromTrash}
        onPermanentDelete={store.permanentlyDelete} onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
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
        subtaskVisibility={subtaskVisibility}
      />
    </View>
  );

  // Done date-group header (label via isToday/isYesterday/isEarlier/
  // fullDateLabel + count + "Delete all →" confirm).
  const renderDoneHeader = ({ section }: { section: DoneSection }) => {
    const g = section.group;
    const headerLabel = g.isToday
      ? t.doneGroups.today
      : g.isYesterday
        ? t.doneGroups.yesterday
        : g.isEarlier
          ? t.doneGroups.earlier
          : fullDateLabel(g.key);
    return (
      <View style={[styles.groupHeaderRow, styles.groupHeaderSpacing]}>
        <Text style={styles.groupHeader}>
          {headerLabel} ({g.todos.length})
        </Text>
        {g.todos.length > 0 && (
          <>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => {
                const ids = g.todos.map((td) => td.id);
                Alert.alert(
                  t.deletePermanently,
                  t.deletePermanentlyConfirm(
                    `${ids.length} ${ids.length === 1 ? 'item' : 'items'}`,
                  ),
                  [
                    { text: t.cancel, style: 'cancel' },
                    {
                      text: t.deletePermanently,
                      style: 'destructive',
                      onPress: () => {
                        for (const id of ids) {
                          store.permanentlyDelete(id);
                        }
                      },
                    },
                  ],
                );
              }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Delete all ${g.todos.length} items in ${headerLabel}`}
            >
              <Text style={styles.groupHeaderDeleteText}>Delete all →</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  // Bin-peek footer (surfaces the 30-day Done safety net) + the screen
  // Footer. Shared by the grouped ScrollView/SectionList footers.
  const binPeekFooter =
    !store.inTrashView &&
    store.filter !== "done" &&
    store.systemCounts.done > 0 ? (
      <TouchableOpacity
        onPress={() => store.setFilter("done")}
        style={styles.binFooter}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t.binFooter.a11y(store.systemCounts.done)}
      >
        <Text style={styles.binFooterText}>
          {t.binFooter.peek(store.systemCounts.done)}
        </Text>
      </TouchableOpacity>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.bg} />
      <KeyboardAvoidingView
        style={styles.kb}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* AppHeader + the filter row live OUTSIDE the scroller so they pin
            above the (virtualized) list. This matches Dashboard's structure
            where the chrome pins just under the header above scrollable
            content. */}
        <AppHeader
          title="Todos"
          onSearchPress={() => setSearchOpen(true)}
          onFilterPress={() => sheets.openSelectFilter()}
          // Gear opens Settings to match Dashboard's gear — same
          // entry point across tabs. Manage Filter remains
          // reachable from Settings' MANAGE section.
          onGearPress={sheets.openSettings}
        />
        {/* PebbleStrip removed — completion celebration moved to the
            Mochi avatar in AppHeader, which does a happy-dance on
            every check-off (animation-aware). */}
        {/* The filter row is pinned ABOVE the list now (not a sticky scroll
            header) so it stays put while the virtualized list scrolls beneath
            it. The pebble strip used to live here too, but per the v1.5
            unification it moved above to match Dashboard + Shopping. */}
        <View
          style={styles.stickyFilter}
          onLayout={(e) => {
            stickyHRef.current = e.nativeEvent.layout.height;
          }}
        >
            <SearchTopSheet
              visible={isFocused && searchOpen}
              placeholder="Search todos"
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onCancel={() => {
                setSearchQuery("");
                setSearchOpen(false);
              }}
              onSubmit={() => setSearchOpen(false)}
            />
            {!searchOpen && searchQuery.trim().length > 0 && (
              <View style={styles.searchPillRow}>
                <SearchPill
                  query={searchQuery.trim()}
                  onPress={() => setSearchOpen(true)}
                  onClear={() => setSearchQuery("")}
                />
              </View>
            )}
            <FilterBar
              filter={store.filter}
              selectedFilters={store.filters}
              onToggleFilter={store.toggleFilter}
              onSetFilters={store.setFilters}
              onClearFilters={store.clearFilters}
              pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[][]}
              onFilter={store.setFilter}
              onPinFilter={store.pinFilter}
              onKeepAndClearFilter={store.keepAndClearFilter}
              onOpenSheet={() => sheets.openSelectFilter()}
              systemCounts={store.systemCounts}
              byCategory={store.byCategory}
              byPriority={store.byPriority}
              combinedCount={store.filtered.length}
              categories={store.categories}
              orderedVisibleStatuses={store.orderedVisibleStatuses}
              groceriesActiveCount={
                store.groceries.filter((g) => !g.checked).length
              }
              groceriesEnabled={store.profile.groceriesEnabled !== false}
            />
          </View>

        {store.inTrashView ||
        displayGroups.length === 0 ||
        store.filter === "overdue" ? (
          // Bounded branches — Trash / the empty state / Overdue. They're
          // small and fixed-size, so they stay in a plain ScrollView (which
          // also hosts the centered EmptyStateCard via the container's
          // flexGrow). A VirtualizedList must never nest inside a ScrollView,
          // so the two big branches (grouped + Done) use SectionList instead.
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.body}>
            <>
            {store.inTrashView && store.trashCount > 0 && (
              store.selectedTrashIds.size > 0 ? (
                <View style={styles.bulkBar}>
                  <Text style={styles.bulkCount}>
                    {t.selectedCount(store.selectedTrashIds.size)}
                  </Text>
                  <View style={styles.bulkActions}>
                    <TouchableOpacity
                      onPress={store.bulkRestore}
                      style={styles.bulkBtn}
                    >
                      <Text style={styles.bulkBtnText}>{t.bulkRestore}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={store.bulkPermanentDelete}
                      style={styles.bulkBtn}
                    >
                      <Text style={styles.bulkBtnDanger}>{t.bulkDeletePermanently}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={store.clearTrashSelection}
                      style={styles.bulkBtn}
                    >
                      <Text style={styles.bulkBtnMuted}>{t.clearSelection}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.trashHeader}>
                  <Text style={styles.trashNotice}>{t.trashRetention}</Text>
                  <TouchableOpacity
                    onPress={store.emptyTrash}
                    style={styles.emptyTrashBtn}
                  >
                    <Text style={styles.emptyTrashText}>{t.emptyTrash}</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {store.inTrashView ? (
              displayFiltered.length === 0 ? (
                <EmptyStateCard
                  title={store.emptyState.title}
                  hint={store.emptyState.hint}
                  centered
                />
              ) : (
                <View style={styles.groupCard}>
                  {displayFiltered.map((td, i) => (
                    <View key={td.id} style={styles.taskCard}>
                      <TaskItem
                        todo={td}
                        categories={store.categories}
                        density={store.profile.density}
                        celebrate={store.animationOn}
                        playSound={store.profile.completionSound !== false}
                        inTrash
                        selected={store.selectedTrashIds.has(td.id)}
                        onToggleSelect={store.toggleTrashSelection}
                        onToggle={store.toggle}
                        onMoveToTrash={store.moveToTrash}
                        onSkip={store.skipTodo} onSkipSeries={store.skipSeriesFuture}
                        onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
                        onApplySeriesFutureEdits={store.applySeriesFutureEdits}
                        onDetachFromSeries={store.detachFromSeries}
                        onApplyRecurrenceChange={store.applyRecurrenceChange}
                        onApplySeriesSubtasks={store.applySeriesSubtasks}
                        onRestore={store.restoreFromTrash}
                        onPermanentDelete={store.permanentlyDelete} onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
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
                      />
                    </View>
                  ))}
                </View>
              )
            ) : displayGroups.length === 0 ? (
              // Filter-mismatch empty state: when the user has todos
              // but none match the current filter, swap the generic
              // "Add a to-do" CTA for a smart-target affordance that
              // routes to the filter where their items actually live.
              // Triggers when (a) not searching, (b) on a non-all
              // filter, (c) there are active todos outside the
              // current bucket. Target routing:
              //   open    → done   (everything's been checked off)
              //   done    → open   (just added a fresh open todo)
              //   overdue → open   (today/future items, not carried)
              //   cat:* / pri:* → all  (we can't guess which bucket)
              (() => {
                // Search with no matches: say so plainly instead of falling
                // through to the generic "Add a to-do" CTA.
                if (searchNeedle) {
                  return (
                    <EmptyStateCard
                      title={t.searchNoMatches(searchQuery.trim())}
                      hint={t.searchNoMatchesHint}
                      centered
                    />
                  )
                }
                const filterMismatch =
                  !searchNeedle &&
                  store.filter !== 'all' &&
                  store.activeCount > 0
                if (filterMismatch) {
                  const targetFilter: Filter =
                    store.filter === 'open' ? 'done'
                    : store.filter === 'done' ? 'open'
                    : store.filter === 'overdue' ? 'open'
                    : 'all'
                  const targetLabel =
                    targetFilter === 'all'
                      ? 'View all'
                      : `View ${t.filters[targetFilter].toLowerCase()}`
                  return (
                    <EmptyStateCard
                      title={store.emptyState.title}
                      hint={
                        store.activeCount === 1
                          ? "You have 1 to-do — it's just hidden by this filter."
                          : `You have ${store.activeCount} to-dos — they're hidden by this filter.`
                      }
                      actionLabel={targetLabel}
                      onAction={() => {
                        void Analytics.emptyStateCtaTapped('todos')
                        store.setFilter(targetFilter)
                      }}
                      centered
                    />
                  )
                }
                return (
                  <EmptyStateCard
                    title={store.emptyState.title}
                    hint={store.emptyState.hint}
                    actionLabel={store.emptyState.ctaLabel}
                    onAction={() => {
                      void Analytics.emptyStateCtaTapped('todos')
                      sheets.openCompose()
                    }}
                    centered
                  />
                )
              })()
            ) : (
              <>
                <View style={styles.groupSection}>
                  {displayFiltered.some((td) => !td.done) && (
                    <TouchableOpacity
                      onPress={() =>
                        setDeferTarget({
                          label: t.filters.overdue,
                          ids: displayFiltered
                            .filter((td) => !td.done)
                            .map((td) => td.id),
                          isTodayGroup: false,
                        })
                      }
                      style={styles.deferAllRow}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Defer ${displayFiltered.filter((td) => !td.done).length} carried-over to-dos`}
                    >
                      <Text style={styles.deferAllText}>Defer all →</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.groupCard}>
                    {[...displayFiltered]
                      .sort((a, b) => {
                        if (!a.dueDate && !b.dueDate) return 0;
                        if (!a.dueDate) return 1;
                        if (!b.dueDate) return -1;
                        return a.dueDate.localeCompare(b.dueDate);
                      })
                      .map((td, i) => (
                        <View key={td.id} style={styles.taskCard}>
                          <TaskItem
                            todo={td}
                            categories={store.categories}
                            density={store.profile.density}
                            celebrate={store.animationOn}
                            playSound={store.profile.completionSound !== false}
                            onToggle={store.toggle}
                            onMoveToTrash={store.moveToTrash}
                            onSkip={store.skipTodo} onSkipSeries={store.skipSeriesFuture}
                            onRestore={store.restoreFromTrash}
                            onPermanentDelete={store.permanentlyDelete} onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
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
                            subtaskVisibility={
                              store.filter === "open"
                                ? "open"
                                : store.filter === "done"
                                  ? "done"
                                  : "all"
                            }
                          />
                        </View>
                      ))}
                  </View>
                </View>
              </>
            )}

            {binPeekFooter}
            {!store.inTrashView && (
              <Footer
                completedCount={store.completedCount}
                onClearDone={store.clearDone}
                showClear={false}
              />
            )}
            </>
            </View>
          </ScrollView>
        ) : store.filter === "done" ? (
          // Done view — virtualized completion-date sections.
          <SectionList<Todo, DoneSection>
            sections={doneSections}
            keyExtractor={keyExtractor}
            renderItem={renderDoneItem}
            renderSectionHeader={renderDoneHeader}
            renderSectionFooter={SectionFooter}
            ItemSeparatorComponent={ItemSeparator}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              displayFiltered.length > 0 ? (
                <View style={styles.trashHeader}>
                  <Text style={styles.trashNotice}>{t.trashRetention}</Text>
                  <TouchableOpacity
                    onPress={store.clearDone}
                    style={styles.emptyTrashBtn}
                  >
                    <Text style={styles.emptyTrashText}>
                      {t.clearAllCompleted}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            ListFooterComponent={
              <Footer
                completedCount={store.completedCount}
                onClearDone={store.clearDone}
                showClear={false}
              />
            }
          />
        ) : (
          // Default grouped view — virtualized collapsible date buckets.
          <SectionList<Todo, GroupedSection>
            ref={sectionListRef}
            sections={groupedSections}
            keyExtractor={keyExtractor}
            renderItem={renderGroupedItem}
            renderSectionHeader={renderGroupedHeader}
            renderSectionFooter={SectionFooter}
            ItemSeparatorComponent={ItemSeparator}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            onScrollToIndexFailed={() => {
              // Variable row heights can leave the target offset unknown on
              // the first try; retry once after a frame, guarding bounds.
              const target = pendingScrollRef.current;
              pendingScrollRef.current = null;
              if (target == null || groupedSections.length === 0) return;
              setTimeout(() => {
                sectionListRef.current?.scrollToLocation({
                  sectionIndex: Math.min(target, groupedSections.length - 1),
                  itemIndex: 0,
                  viewPosition: 0,
                  animated: true,
                });
              }, 80);
            }}
            ListFooterComponent={
              <>
                {binPeekFooter}
                <Footer
                  completedCount={store.completedCount}
                  onClearDone={store.clearDone}
                  showClear={false}
                />
              </>
            }
          />
        )}
      </KeyboardAvoidingView>
      {!store.inTrashView &&
        store.filter !== "done" &&
        store.filter !== "groceries" && (
          <Fab
            onPress={() => {
              void Analytics.fabTapped('todos')
              sheets.openCapture()
            }}
            accessibilityLabel={t.addPlaceholder}
            agentEnabled={store.profile.agentEnabled !== false}
          />
        )}
      <DeferModal
        visible={deferTarget !== null}
        filterLabel={deferTarget?.label}
        count={deferTarget?.ids.length ?? 0}
        isTodayGroup={deferTarget?.isTodayGroup ?? false}
        onSelect={(targetISO) => {
          if (deferTarget) store.bulkDeferTodos(deferTarget.ids, targetISO);
        }}
        onClose={() => setDeferTarget(null)}
      />
      <Onboarding
        visible={onboardingNeeded}
        onComplete={(intent) => {
          setOnboardingNeeded(false);
          store.saveProfile({ ...store.profile, onboardingDone: true });
          if (intent === "firstTask") {
            // Defer compose so the onboarding modal animates out first.
            setTimeout(() => sheets.openCompose(), 250);
          }
        }}
        onSkip={() => {
          setOnboardingNeeded(false);
          store.saveProfile({ ...store.profile, onboardingDone: true });
        }}
      />
      {splashShown && (
        <SplashOverlay
          reduceMotion={store.reduceMotion}
          onDismiss={() => setSplashShown(false)}
        />
      )}
    </SafeAreaView>
  );
}

const Tab = createBottomTabNavigator();

function AppGate() {
  const { user, loading } = useAuth();
  const store = useStore();
  const scheme = useColorScheme();
  // Theme is provided by <ThemeGate> above SheetProvider, so every sheet
  // (mounted by SheetProvider) and the tab chrome here all read the SAME
  // selected palette. (Previously the provider lived inside AppGate, below
  // SheetProvider — so the sheets fell back to the default sage theme.)
  const theme = useTheme();

  // Per-todo local reminder sync. Runs whenever the live todos list
  // changes — adds new ones, cancels removed/done/trashed/cleared
  // entries. Permission is requested at UI-action time (when the user
  // sets a reminder); this sync silently skips if it isn't granted.
  useEffect(() => {
    if (!store.loaded) return;
    void syncTodoReminders(store.todos);
  }, [store.todos, store.loaded]);

  // Splash + sign-in + hydration + onboarding gates run BEFORE the tab
  // navigator mounts, so screens can assume store + user are ready.
  if (loading) {
    // Pre-auth: we don't have a profile yet, so use the brand Mochi
    // mascot. Once auth resolves, the hydrating branch below switches
    // to the user's chosen avatar.
    return <LoadingScreen />;
  }
  if (!user) return <SignIn />;
  if (!store.loaded) {
    return <LoadingScreen avatar={store.profile.avatar} />;
  }

  // Calm-app stance: no badge counters on the bottom tabs. Numbers in a
  // chrome badge are easy to read as nagging / "something is unfinished",
  // and we explicitly don't keep score in the rest of the app — the tab
  // bar shouldn't either.

  return (
    // The theme's `bg` is the whole canvas — flat, per-theme tinted
    // near-white (light) / warm near-black (dark). Tabs render on a
    // transparent scene so this shows through every screen.
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <NavigationContainer ref={sheetNavigationRef}>
        <Tab.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
            // Per-screen container must be transparent so the shared
            // AppBackground (mounted above the navigator) shows through
            // every tab. Without this, react-navigation paints an
            // opaque scene bg that covers the wallpaper.
            sceneStyle: { backgroundColor: 'transparent' },
          // Tab bar uses the primary (FAB) color as its background, so
          // active/inactive tints flip to the on-primary foreground:
          // full primaryOn for the active tab, a faded variant for the rest.
          tabBarActiveTintColor: theme.primaryOn,
          tabBarInactiveTintColor:
            scheme === 'dark' ? 'rgba(26,24,20,0.5)' : 'rgba(255,255,255,0.62)',
          tabBarStyle: {
            backgroundColor: theme.primary,
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            // Nudge icons + labels down so they sit vertically centered
            // in the bar (above the home-indicator safe area).
            paddingTop: 12,
            // Soft upward shadow so the tab bar reads as a raised surface
            // floating above the content.
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 12,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
        screenListeners={{
          // Light tap haptic on tab switch so the change registers in the
          // body, not just the eyes. Silent failure if haptics blocked.
          tabPress: () => {
            Haptics.selectionAsync().catch(() => {});
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            // Tab label is "Dashboard" so it doesn't collide with the
            // user's Home *category*. Route name stays "Home" for
            // stable navigation calls — navigation.navigate('Home')
            // still works app-wide.
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <House size={size ?? 22} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tab.Screen
          name="Todos"
          component={TodosScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <ListTodo size={size ?? 22} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tab.Screen
          name="Groceries"
          component={GroceriesScreen}
          options={{
            // Tab label "Shopping" covers groceries + clothing + any
            // other shopping. Route name stays "Groceries" so existing
            // navigation calls + the cross-tab manage signal in
            // SheetContext keep working without a rename cascade.
            tabBarLabel: 'Shopping',
            tabBarIcon: ({ color, size }) => (
              <ShoppingBag size={size ?? 22} color={color} strokeWidth={2} />
            ),
          }}
        />
        </Tab.Navigator>
      </NavigationContainer>
    </View>
  );
}

/**
 * Provides the selected color theme to EVERYTHING below it — crucially
 * including SheetProvider, so every sheet/modal reads the user's theme
 * instead of the default. Lives above SheetProvider, below StoreProvider
 * (it reads profile.theme). Themes are free for all tiers, so no
 * entitlement gating here.
 */
function ThemeGate({ children }: { children: React.ReactNode }) {
  const store = useStore();
  return (
    <ThemeOverrideProvider name={store.profile.theme ?? DEFAULT_THEME}>
      {children}
    </ThemeOverrideProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <AuthProvider>
            <LangProvider>
              <NotifyProvider>
                <StoreProvider>
                  <PebbleFlightProvider>
                    <PurchasesProvider>
                      <ThemeGate>
                        <SheetProvider>
                          <AppGate />
                        </SheetProvider>
                      </ThemeGate>
                    </PurchasesProvider>
                  </PebbleFlightProvider>
                </StoreProvider>
              </NotifyProvider>
            </LangProvider>
          </AuthProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

/**
 * Splash / hydration placeholder. Shows the user's current avatar in
 * the center (Mochi mascot if no avatar yet) at a large size with a
 * gentle continuous pulse. Mirrors the calm-app stance — no spinner,
 * no progress bar, just a quiet "we're here" beat that matches the
 * user's identity.
 */
function LoadingScreen({ avatar }: { avatar?: AvatarT }) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const effectiveAvatar: AvatarT = avatar ?? { kind: 'preset', key: 'mochi' };
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}
      edges={['top', 'bottom']}
    >
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Avatar avatar={effectiveAvatar} size={96} />
      </Animated.View>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      // AppBackground is mounted once at the AppGate level and shines
      // through every tab — leave the safe-area wrapper transparent
      // so the wallpaper isn't covered by an opaque bg here.
      backgroundColor: 'transparent',
    },
    kb: { flex: 1 },
    container: {
      paddingBottom: 16,
      // flexGrow:1 so the ScrollView's content always fills the
      // viewport even when content is short. Lets the body's
      // centered EmptyStateCard span the remaining vertical space
      // and float mid-screen.
      flexGrow: 1,
    },
    identityRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 10,
    },
    identityProfileTouch: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    settingsBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },
    identityTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    identityGreeting: {
      fontSize: 17,
      color: c.label,
      fontWeight: "700",
      letterSpacing: -0.2,
      lineHeight: 21,
    },
    identityPlate: {
      fontSize: 13,
      color: c.label2,
      fontWeight: "500",
      marginTop: 2,
      lineHeight: 18,
    },
    identityQuote: {
      fontStyle: "italic",
      color: c.label3,
    },
    stickyFilter: {
      // Transparent — the filter pills float directly on the page
      // background, matching the Shopping filter row (no opaque strip,
      // no border).
      backgroundColor: 'transparent',
    },
    stickyStrip: {
      backgroundColor: c.bg,
    },
    searchPillRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingTop: 8,
    },
    viewPickerBtn: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginLeft: 16,
      borderRadius: 100,
    },
    filterFlex: {
      flex: 1,
      minWidth: 0,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
      // flex:1 so EmptyStateCard with `centered` can vertically
      // center within the body's remaining space. Has no effect
      // when body is full of TaskItem cards (content drives height).
      flex: 1,
    },
    groupSection: {
      marginBottom: 18,
    },
    // SectionList content padding — mirrors the old container (paddingBottom)
    // + body (paddingHorizontal / paddingTop) so the virtualized grouped /
    // Done views land pixel-identical to the former ScrollView layout.
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
    },
    // Replaces groupCard's `gap: 3` between cards (rendered by
    // ItemSeparatorComponent — never before the first or after the last row).
    taskGap: {
      height: 3,
    },
    // Replaces groupSection's marginBottom: 18 between/after sections
    // (rendered by renderSectionFooter).
    sectionGap: {
      height: 18,
    },
    groupCard: {
      // Transparent layout container — the card chrome moved to taskCard
      // so each task reads as its own card with the AppBackground showing
      // through the gap. `gap` spaces the children without needing
      // separator <View>s in the JSX.
      gap: 3,
    },
    taskCard: {
      // Flat, not raised — the card's surface color + the gap between rows is
      // enough separation; dropping the shadow reads calmer across a long list.
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: "hidden",
    },
    groupHeader: {
      fontSize: 12,
      fontWeight: "700",
      color: c.label3,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginLeft: 4,
    },
    // Spacing below the header lives on the row container (or inline on the
    // standalone Text) so the chevron + Text inside the row don't get
    // pushed off-center by the Text's own marginBottom.
    groupHeaderSpacing: {
      marginBottom: 8,
    },
    groupHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: 0,
      marginBottom: 8,
      flexShrink: 1,
    },
    // Wraps the toggleable header (chevron + label) and the "Defer to"
    // action so they sit on one line — header text floats left, Defer
    // floats right. Used by every visible group when the group has at
    // least one open todo to defer.
    groupHeaderContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    groupHeaderDeferBtn: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      marginBottom: 8,
    },
    groupHeaderDeleteText: {
      fontSize: 12,
      color: c.red,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    groupHeaderDeferText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.blue,
      letterSpacing: -0.1,
    },
    deferAllRow: {
      paddingHorizontal: 4,
      paddingBottom: 8,
      paddingTop: 0,
      alignSelf: "flex-end",
    },
    deferAllText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.blue,
      letterSpacing: -0.1,
    },
    binFooter: {
      alignSelf: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    binFooterText: {
      fontSize: 12,
      fontWeight: "500",
      color: c.label3,
      letterSpacing: 0.1,
    },
    trashHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      gap: 8,
    },
    trashNotice: {
      flex: 1,
      fontSize: 12,
      color: c.label2,
      lineHeight: 16,
    },
    emptyTrashBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.red,
    },
    emptyTrashText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "600",
    },
    bulkBar: {
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      gap: 8,
    },
    bulkCount: {
      fontSize: 13,
      fontWeight: "600",
      color: c.label,
    },
    bulkActions: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    bulkBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.card,
    },
    bulkBtnText: {
      color: c.blue,
      fontSize: 13,
      fontWeight: "600",
    },
    bulkBtnDanger: {
      color: c.red,
      fontSize: 13,
      fontWeight: "600",
    },
    bulkBtnMuted: {
      color: c.label2,
      fontSize: 13,
      fontWeight: "500",
    },
  });
}
