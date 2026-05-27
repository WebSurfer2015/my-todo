import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Image,
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
  deriveThemeFromAvatarBg,
} from "./src/theme";
import { findPreset, type Avatar as AvatarT } from "./src/profile";
import {
  pairFromAvatarBg,
  lookupPattern,
} from "./src/backgrounds";
// Side-effect import: registers the foreground notification handler at
// boot so a push arriving while the app is open isn't silently dropped.
import "./src/notifications";
import FilterBar from "./src/components/FilterBar";
import Fab from "./src/components/Fab";
import TaskItem from "./src/components/TaskItem";
import Footer from "./src/components/Footer";
import Avatar from "./src/components/Avatar";
import GroceryView from "./src/components/GroceryView";
import AppBackground from "./src/components/AppBackground";
import ChatSheet from "./src/components/ChatSheet";
import SearchTopSheet from "./src/components/SearchTopSheet";
import SearchPill from "./src/components/SearchPill";
import DeferModal from "./src/components/DeferModal";
import { SEED_GROCERY_STORES } from "./src/groceries";
import type { Filter } from "./src/types";
import { LangProvider, useLang } from "./src/LangContext";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { NotifyProvider } from "./src/notify";
import { PebbleFlightProvider } from "./src/components/PebbleFlight";
import { ErrorBoundary } from "./src/ErrorBoundary";
import { useTodoStore } from "./src/useTodoStore";
import { buildDoneGroups } from "../core/src/groups";
import { fullDateLabel } from "./src/utils";
import { todayLocal } from "../core/src/utils";
import type { Todo } from "./src/types";
import SignIn from "./src/components/SignIn";
import EmptyStateCard from "./src/components/EmptyStateCard";
import PebbleStrip from "./src/components/PebbleStrip";
import Onboarding from "./src/components/Onboarding";
import SplashOverlay from "./src/components/SplashOverlay";
import { cancelDailyCheckin, syncTodoReminders } from "./src/notifications";
import { installCrashReporters } from "./src/crashReporting";

// Install crash reporters before any React code runs so even very early
// failures get forwarded to Crashlytics. Idempotent — safe to call once
// at module-load.
installCrashReporters();
import { NavigationContainer, useIsFocused } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { House, ListTodo, ShoppingBag } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { StoreProvider, useStore } from "./src/StoreContext";
import { SheetProvider, useSheets, sheetNavigationRef } from "./src/SheetContext";
import HomeScreen from "./src/screens/HomeScreen";
import GroceriesScreen from "./src/screens/GroceriesScreen";
import AppHeader from "./src/components/AppHeader";

/**
 * Master kill-switch for the Mochi agent / "Ask Mochi" chat surface.
 * Set to `false` while the feature is paused; flipping it back on
 * re-enables the in-app FAB + chat sheet without further edits.
 * Mirrors the "Ask Mochi (coming soon)" disabled toggle in Settings.
 */
const MOCHI_AGENT_ENABLED = false;

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
  // ChatSheet still per-tab. CategorySheet moved to SheetContext so
  // Settings → Manage Todos can open it from any tab.
  const sheets = useSheets();
  const [chatOpen, setChatOpen] = useState(false);
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
  const onboardingNeeded = store.loaded && store.profile.onboardingDone !== true;

  // Search narrows the already-filtered + grouped view. Case-insensitive
  // substring against todo text, subtask text, and notes. We compute
  // both flat (`displayFiltered`) and grouped (`displayGroups`)
  // projections so every render path that previously referenced
  // store.filtered / store.groups stays in sync.
  const searchNeedle = searchQuery.trim().toLowerCase();
  const displayFiltered = useMemo(() => {
    if (!searchNeedle) return store.filtered;
    return store.filtered.filter((td) => {
      if (td.text.toLowerCase().includes(searchNeedle)) return true;
      if (td.subtasks?.some((s) => s.text.toLowerCase().includes(searchNeedle)))
        return true;
      if (typeof td.notes === "string" && td.notes.toLowerCase().includes(searchNeedle))
        return true;
      return false;
    });
  }, [store.filtered, searchNeedle]);
  const displayGroups = useMemo(() => {
    if (!searchNeedle) return store.groups;
    return store.groups
      .map((g) => ({
        ...g,
        todos: g.todos.filter((td) => {
          if (td.text.toLowerCase().includes(searchNeedle)) return true;
          if (td.subtasks?.some((s) => s.text.toLowerCase().includes(searchNeedle)))
            return true;
          if (
            typeof td.notes === "string" &&
            td.notes.toLowerCase().includes(searchNeedle)
          )
            return true;
          return false;
        }),
      }))
      .filter((g) => g.todos.length > 0);
  }, [store.groups, searchNeedle]);

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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.bg} />
      <KeyboardAvoidingView
        style={styles.kb}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[1]}
        >
          <AppHeader
            title="Todos"
            onSearchPress={() => setSearchOpen(true)}
            onFilterPress={() => sheets.openSelectFilter()}
            onGearPress={() => sheets.openManageFilter()}
          />

          {/* Single sticky container — filter row + pebble strip stack
              together so neither displaces the other during scroll.
              Earlier setup used stickyHeaderIndices=[1,2] which caused
              the strip to push the filter offscreen, and if strip's
              height was shorter than the filter's, list content
              briefly peeked through the gap during the transition.
              One-region sticky avoids the issue entirely. */}
          <View style={styles.stickyFilter}>
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
              pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[]}
              onFilter={store.setFilter}
              onPinFilter={store.pinFilter}
              onOpenSheet={() => sheets.openSelectFilter()}
              systemCounts={store.systemCounts}
              byCategory={store.byCategory}
              categories={store.categories}
              orderedVisibleStatuses={store.orderedVisibleStatuses}
              groceriesActiveCount={
                store.groceries.filter((g) => !g.checked).length
              }
              groceriesEnabled={store.profile.groceriesEnabled !== false}
            />
            {!store.inTrashView && store.filter !== "done" && (
              <PebbleStrip count={store.todayPebbles} active={isFocused} />
            )}
          </View>

          <View style={styles.body}>
            {/* Groceries now lives in its own tab; the inline branch
                that handled filter==='groceries' here is gone. */}
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
                />
              ) : (
                <View style={styles.groupCard}>
                  {displayFiltered.map((td, i) => (
                    <View key={td.id} style={styles.taskCard}>
                      <TaskItem
                        todo={td}
                        categories={store.categories}
                        density={store.profile.density}
                        celebrate={store.profile.completionAnimation !== false && store.profile.reduceMotion !== true}
                        playSound={store.profile.completionSound !== false}
                        inTrash
                        selected={store.selectedTrashIds.has(td.id)}
                        onToggleSelect={store.toggleTrashSelection}
                        onToggle={store.toggle}
                        onMoveToTrash={store.moveToTrash}
                        onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
                        onApplySeriesFutureEdits={store.applySeriesFutureEdits}
                        onRestore={store.restoreFromTrash}
                        onPermanentDelete={store.permanentlyDelete}
                        onUpdatePriority={store.updatePriority}
                        onUpdateDueDate={store.updateDueDate}
                        onSnooze={store.snooze}
                        onLongPressDefer={openSingleDefer}
                        onUpdateCategory={store.updateTaskCategory}
                        onUpdateText={store.updateText}
                              onUpdateNotes={store.updateNotes}
                        onUpdateRecurrence={store.updateRecurrence}
                        onUpdateReminder={store.updateReminder}
                      />
                    </View>
                  ))}
                </View>
              )
            ) : displayGroups.length === 0 ? (
              <EmptyStateCard
                title={store.emptyState.title}
                hint={store.emptyState.hint}
                actionLabel={store.emptyState.ctaLabel}
                onAction={() => sheets.openCompose()}
              />
            ) : store.filter === "done" ? (
              <>
                {displayFiltered.length > 0 && (
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
                )}
                {buildDoneGroups(displayFiltered).map((g) => {
                  const headerLabel = g.isToday
                    ? t.doneGroups.today
                    : g.isYesterday
                      ? t.doneGroups.yesterday
                      : g.isEarlier
                        ? t.doneGroups.earlier
                        : fullDateLabel(g.key);
                  return (
                    <View key={g.key} style={styles.groupSection}>
                      <View style={[styles.groupHeaderRow, styles.groupHeaderSpacing]}>
                        <Text style={styles.groupHeader}>
                          {headerLabel} ({g.todos.length})
                        </Text>
                        {g.isEarlier && g.todos.length > 0 && (
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
                            accessibilityLabel={`Delete all ${g.todos.length} items in Earlier`}
                          >
                            <Text style={styles.groupHeaderDeleteText}>Delete all →</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.groupCard}>
                        {g.todos.map((td, i) => (
                          <View key={td.id} style={styles.taskCard}>
                            <TaskItem
                              todo={td}
                              categories={store.categories}
                              density={store.profile.density}
                              celebrate={store.profile.completionAnimation !== false && store.profile.reduceMotion !== true}
                              playSound={store.profile.completionSound !== false}
                              binFilterView
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
                  );
                })}
              </>
            ) : store.filter === "overdue" ? (
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
                            celebrate={store.profile.completionAnimation !== false && store.profile.reduceMotion !== true}
                            playSound={store.profile.completionSound !== false}
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
            ) : (
              displayGroups.map((group) => {
                // Collapse is available in the All and Open views, where
                // the date-bucket grouping shows. Category and status-
                // specific filters always render every group expanded so
                // the user always sees the full subset.
                const toggleable =
                  store.filter === "all" || store.filter === "open";
                const collapsed = toggleable && collapsedGroups.has(group.key);
                const onToggle = toggleable
                  ? () => toggleGroupCollapsed(group.key)
                  : undefined;
                const statusOverride =
                  group.key === "overdue" || group.key === "done"
                    ? store.orderedStatuses.find((s) => s.id === group.key)
                    : null;
                const headerLabel = statusOverride
                  ? statusOverride.label
                  : t.groups[group.key];
                // Header counts include every to-do in the bucket
                // (open + done) so the number matches what's visible.
                const headerCount = group.todos.length;
                // Only OPEN todos in the bucket can be deferred. Done
                // items skip — they don't have a dueDate semantics that
                // needs shifting. Hidden when zero so the "Defer to"
                // affordance doesn't dangle on a fully-completed bucket.
                const openInGroup = group.todos.filter((td) => !td.done);
                const openInGroupCount = openInGroup.length;
                return (
                  <View key={group.key} style={styles.groupSection}>
                    <View style={styles.groupHeaderContainer}>
                      {toggleable ? (
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
                            {headerLabel} ({headerCount})
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
                    {!collapsed && (
                      <View style={styles.groupCard}>
                        {group.todos.map((td, i) => (
                          <View key={td.id} style={styles.taskCard}>
                            <TaskItem
                              todo={td}
                              categories={store.categories}
                              density={store.profile.density}
                        celebrate={store.profile.completionAnimation !== false && store.profile.reduceMotion !== true}
                        playSound={store.profile.completionSound !== false}
                              onToggle={store.toggle}
                              onMoveToTrash={store.moveToTrash}
                        onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
                        onApplySeriesFutureEdits={store.applySeriesFutureEdits}
                              onPermanentDelete={store.permanentlyDelete}
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
                              onUpdateSubtaskPriority={
                                store.updateSubtaskPriority
                              }
                              onUpdateSubtaskDueDate={
                                store.updateSubtaskDueDate
                              }
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
                    )}
                  </View>
                );
              })
            )}

            {/* Bin discoverability — surface the 30-day safety net so
                users know it exists. Only in non-bin views; tapping
                jumps to the Done filter. */}
            {!store.inTrashView &&
              store.filter !== "done" &&
              store.systemCounts.done > 0 && (
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
              )}

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
      </KeyboardAvoidingView>
      {!store.inTrashView &&
        store.filter !== "done" &&
        store.filter !== "groceries" && (
          <Fab
            onPress={() => sheets.openCompose()}
            accessibilityLabel={t.addPlaceholder}
            agentEnabled={store.profile.agentEnabled !== false}
          />
        )}
      {/* Mochi agent paused — see Settings "Ask Mochi (coming soon)".
          The MOCHI_AGENT_ENABLED constant lives at the top of this
          file so flipping the feature on is a one-line change. */}
      {MOCHI_AGENT_ENABLED &&
        store.profile.agentEnabled &&
        !store.inTrashView &&
        store.filter !== "groceries" &&
        !searchOpen && (
        <TouchableOpacity
          style={[
            styles.mochiFab,
            { bottom: 4 + safeArea.bottom + 72 /* sits above the + FAB */ },
          ]}
          onPress={() => setChatOpen(true)}
          accessibilityLabel="Ask Mochi"
          accessibilityRole="button"
        >
          <Image
            source={require("./assets/mochi-mascot.png")}
            style={styles.mochiFabImage}
            resizeMode="contain"
          />
        </TouchableOpacity>
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
      {/* Mochi agent paused — see Settings "Ask Mochi (coming soon)".
          The MOCHI_AGENT_ENABLED constant lives at the top of this
          file so flipping the feature on is a one-line change. */}
      {MOCHI_AGENT_ENABLED &&
        store.profile.agentEnabled && (
        <ChatSheet
          visible={chatOpen}
          onClose={() => setChatOpen(false)}
          categories={store.categories}
          onApplyCreateTodo={(op) =>
            store.addTask(
              op.args.text,
              op.args.priority ?? "medium",
              op.args.dueDate ?? "",
              op.args.category,
            )
          }
        />
      )}
      <Onboarding
        visible={onboardingNeeded}
        onComplete={(intent) => {
          store.saveProfile({ ...store.profile, onboardingDone: true });
          if (intent === "firstTask") {
            // Defer compose so the onboarding modal animates out first.
            setTimeout(() => sheets.openCompose(), 250);
          }
        }}
        onSkip={() => {
          store.saveProfile({ ...store.profile, onboardingDone: true });
        }}
      />
      {splashShown && (
        <SplashOverlay
          reduceMotion={store.profile.reduceMotion === true}
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
  const baseTheme = useTheme();
  const scheme = useColorScheme();
  // Avatar-driven theme override (Settings → Theme from avatar).
  // Memoized on the bits that actually matter so unrelated profile
  // edits don't churn the tab bar / FAB colors.
  const themeOverride = useMemo(() => {
    if (store.profile.themeFromAvatar !== true) return null;
    const av = store.profile.avatar;
    if (!av || av.kind !== 'preset') return null;
    const preset = findPreset(av.key);
    if (!preset) return null;
    return deriveThemeFromAvatarBg(preset.bg, scheme === 'dark' ? 'dark' : 'light');
  }, [store.profile.themeFromAvatar, store.profile.avatar, scheme]);

  // Companion background override — when themeFromAvatar is on we
  // also paint the canvas from the avatar's color so theme + bg
  // stay cohesive. Always solid pattern in this mode for predictability.
  const bgOverride = useMemo(() => {
    if (store.profile.themeFromAvatar !== true) return undefined;
    const av = store.profile.avatar;
    if (!av || av.kind !== 'preset') return undefined;
    const preset = findPreset(av.key);
    if (!preset) return undefined;
    return {
      pair: pairFromAvatarBg(preset.bg),
      pattern: lookupPattern('solid'),
    };
  }, [store.profile.themeFromAvatar, store.profile.avatar]);
  // Local theme picks up the override too — without this manual
  // merge, AppGate-rendered chrome (tab bar, splash background)
  // would stay in the base palette while children inside the
  // provider go avatar-tinted, creating a split look.
  const theme = useMemo(
    () => (themeOverride ? { ...baseTheme, ...themeOverride } : baseTheme),
    [baseTheme, themeOverride],
  );

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
    <ThemeOverrideProvider override={themeOverride}>
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* AppBackground paints the user-chosen wallpaper across every
          tab. Mounted here (not per-screen) so Home, Todos, and
          Groceries all share the same backdrop. */}
      <AppBackground choice={store.profile.background} override={bgOverride} />
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
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.label3,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.separator,
            borderTopWidth: StyleSheet.hairlineWidth,
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
                    <SheetProvider>
                      <AppGate />
                    </SheetProvider>
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
    // Floating Mochi button — sits above the + FAB when the agent flag is
    // on. Smaller than the + FAB and uses the transparent-turtle PNG so it
    // reads as a mascot affordance rather than a generic action.
    mochiFab: {
      position: "absolute",
      right: 22,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    mochiFabImage: { width: 42, height: 42 },
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
      // Opaque bg so scrolled content doesn't bleed through this
      // pinned row. Combined with the also-opaque stickyStrip below
      // it, the pair stays solidly persistent during scroll.
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
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
    },
    groupSection: {
      marginBottom: 18,
    },
    groupCard: {
      // Transparent layout container — the card chrome moved to taskCard
      // so each task reads as its own card with the AppBackground showing
      // through the gap. `gap` spaces the children without needing
      // separator <View>s in the JSX.
      gap: 3,
    },
    taskCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
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
