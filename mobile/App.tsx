import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronRight, ChevronDown } from "lucide-react-native";
import { useTheme, ThemeColors } from "./src/theme";
import FilterBar from "./src/components/FilterBar";
import Fab from "./src/components/Fab";
import ComposeSheet from "./src/components/ComposeSheet";
import TaskItem from "./src/components/TaskItem";
import Footer from "./src/components/Footer";
import Avatar from "./src/components/Avatar";
import ProfileSheet from "./src/components/ProfileSheet";
import SettingsSheet from "./src/components/SettingsSheet";
import BackgroundPicker from "./src/components/BackgroundPicker";
import AppBackground from "./src/components/AppBackground";
import { Settings as SettingsIcon } from "lucide-react-native";
import CategorySheet from "./src/components/CategorySheet";
import ChatSheet from "./src/components/ChatSheet";
import type { Filter } from "./src/types";
import { LangProvider, useLang } from "./src/LangContext";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { NotifyProvider } from "./src/notify";
import { PebbleFlightProvider } from "./src/components/PebbleFlight";
import { ErrorBoundary } from "./src/ErrorBoundary";
import { useTodoStore } from "./src/useTodoStore";
import { buildDoneGroups } from "../core/src/groups";
import { fullDateLabel } from "./src/utils";
import SignIn from "./src/components/SignIn";
import EmptyState from "./src/components/EmptyState";
import PebbleStrip from "./src/components/PebbleStrip";
import Onboarding from "./src/components/Onboarding";
import SplashOverlay from "./src/components/SplashOverlay";
import { scheduleDailyCheckin, cancelDailyCheckin } from "./src/notifications";
import { useReduceMotion } from "./src/useReduceMotion";

function AppInner() {
  const { t } = useLang();
  const { user, loading: authLoading } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const store = useTodoStore();
  const safeArea = useSafeAreaInsets();

  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
  // True once the user has scrolled past the pebble strip — the FilterBar
  // shows a tiny pebble counter to keep progress visible without bringing
  // the full strip back into view.
  const [pebbleStripScrolled, setPebbleStripScrolled] = useState(false);
  const onboardingNeeded = store.loaded && store.profile.onboardingDone !== true;
  const reduceMotion = useReduceMotion();

  // Sync the daily-checkin notification to profile state. Schedules when
  // enabled, cancels when disabled. Re-runs on hour change too.
  useEffect(() => {
    if (!store.loaded) return;
    if (store.profile.dailyCheckinEnabled === true) {
      scheduleDailyCheckin(store.profile.dailyCheckinHour ?? 9).catch(() => {});
    } else {
      cancelDailyCheckin().catch(() => {});
    }
  }, [
    store.loaded,
    store.profile.dailyCheckinEnabled,
    store.profile.dailyCheckinHour,
  ]);

  if (authLoading)
    return <SafeAreaView style={styles.safe} edges={["top", "bottom"]} />;
  if (!user) return <SignIn />;
  if (!store.loaded)
    return <SafeAreaView style={styles.safe} edges={["top", "bottom"]} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AppBackground choice={store.profile.background} />
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
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const next = y > 80;
            if (next !== pebbleStripScrolled) setPebbleStripScrolled(next);
          }}
          scrollEventThrottle={32}
        >
          <View style={styles.identityRow}>
            <TouchableOpacity
              style={styles.identityProfileTouch}
              onPress={() => setProfileOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel={t.editProfile}
              accessibilityRole="button"
            >
              <Avatar avatar={store.profile.avatar} size={44} />
              <View style={styles.identityTextWrap}>
                <Text style={styles.identityGreeting} numberOfLines={1}>
                  {store.headerLine}
                </Text>
                <Text
                  style={[
                    styles.identityPlate,
                    store.identityLineIsQuote && styles.identityQuote,
                  ]}
                  numberOfLines={2}
                >
                  {store.identityLine}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSettingsOpen(true)}
              style={styles.settingsBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <SettingsIcon size={22} color={theme.label3} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          <View style={styles.stickyFilter}>
            <FilterBar
              filter={store.filter}
              pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[]}
              onFilter={store.setFilter}
              onPinFilter={store.pinFilter}
              onOpenSheet={() => setCategorySheetOpen(true)}
              systemCounts={store.systemCounts}
              byCategory={store.byCategory}
              categories={store.categories}
              orderedVisibleStatuses={store.orderedVisibleStatuses}
              scrolledPebbleCount={
                pebbleStripScrolled ? store.todayPebbles : 0
              }
            />
          </View>

          <View style={styles.body}>
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

            {!store.inTrashView && store.filter !== "done" && (
              <PebbleStrip count={store.todayPebbles} />
            )}

            {store.inTrashView ? (
              store.filtered.length === 0 ? (
                <EmptyState
                  title={store.emptyState.title}
                  hint={store.emptyState.hint}
                />
              ) : (
                <View style={styles.groupCard}>
                  {store.filtered.map((td, i) => (
                    <View key={td.id} style={styles.taskCard}>
                      <TaskItem
                        todo={td}
                        categories={store.categories}
                        density={store.profile.density}
                        celebrate={store.profile.completionAnimation !== false}
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
                        onUpdateCategory={store.updateTaskCategory}
                        onUpdateText={store.updateText}
                              onUpdateNotes={store.updateNotes}
                        onUpdateRecurrence={store.updateRecurrence}
                      />
                    </View>
                  ))}
                </View>
              )
            ) : store.groups.length === 0 ? (
              <EmptyState
                title={store.emptyState.title}
                hint={store.emptyState.hint}
                ctaLabel={store.emptyState.ctaLabel}
                onCta={() => setComposeOpen(true)}
              />
            ) : store.filter === "done" ? (
              <>
                {store.filtered.length > 0 && (
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
                {buildDoneGroups(store.filtered).map((g) => {
                  const headerLabel = g.isToday
                    ? t.doneGroups.today
                    : g.isYesterday
                      ? t.doneGroups.yesterday
                      : g.isEarlier
                        ? t.doneGroups.earlier
                        : fullDateLabel(g.key);
                  return (
                    <View key={g.key} style={styles.groupSection}>
                      <Text style={[styles.groupHeader, styles.groupHeaderSpacing]}>
                        {headerLabel} ({g.todos.length})
                      </Text>
                      <View style={styles.groupCard}>
                        {g.todos.map((td, i) => (
                          <View key={td.id} style={styles.taskCard}>
                            <TaskItem
                              todo={td}
                              categories={store.categories}
                              density={store.profile.density}
                              celebrate={store.profile.completionAnimation !== false}
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
                              subtaskVisibility="all"
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
                  {store.filtered.some((td) => !td.done) && (
                    <TouchableOpacity
                      onPress={() => store.deferOverdue(7)}
                      style={styles.deferAllRow}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t.defer.allA11y(
                        store.filtered.filter((td) => !td.done).length,
                      )}
                    >
                      <Text style={styles.deferAllText}>
                        {t.defer.allToNextWeek}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.groupCard}>
                    {[...store.filtered]
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
                            celebrate={store.profile.completionAnimation !== false}
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
                            subtaskVisibility="all"
                          />
                        </View>
                      ))}
                  </View>
                </View>
              </>
            ) : (
              store.groups.map((group) => {
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
                // Open overdue items inside the Carried Over group are
                // candidates for the bulk-defer escape hatch (overwhelm
                // mode). Done overdue items are skipped — deferring a
                // completed item makes no sense.
                const openOverdueCount =
                  group.key === "overdue"
                    ? group.todos.filter((td) => !td.done).length
                    : 0;
                return (
                  <View key={group.key} style={styles.groupSection}>
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
                    {!collapsed && openOverdueCount > 0 && (
                      <TouchableOpacity
                        onPress={() => store.deferOverdue(7)}
                        style={styles.deferAllRow}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={t.defer.allA11y(openOverdueCount)}
                      >
                        <Text style={styles.deferAllText}>
                          {t.defer.allToNextWeek}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!collapsed && (
                      <View style={styles.groupCard}>
                        {group.todos.map((td, i) => (
                          <View key={td.id} style={styles.taskCard}>
                            <TaskItem
                              todo={td}
                              categories={store.categories}
                              density={store.profile.density}
                        celebrate={store.profile.completionAnimation !== false}
                        playSound={store.profile.completionSound !== false}
                              onToggle={store.toggle}
                              onMoveToTrash={store.moveToTrash}
                        onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
                        onApplySeriesFutureEdits={store.applySeriesFutureEdits}
                              onPermanentDelete={store.permanentlyDelete}
                              onUpdatePriority={store.updatePriority}
                              onUpdateDueDate={store.updateDueDate}
                        onSnooze={store.snooze}
                              onUpdateCategory={store.updateTaskCategory}
                              onUpdateText={store.updateText}
                              onUpdateNotes={store.updateNotes}
                        onUpdateRecurrence={store.updateRecurrence}
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {!store.inTrashView &&
        store.filter !== "done" &&
        store.activeCount > 0 && (
          <Fab
            onPress={() => setComposeOpen(true)}
            accessibilityLabel={t.addPlaceholder}
          />
        )}
      {store.profile.agentEnabled && !store.inTrashView && (
        <TouchableOpacity
          style={[
            styles.mochiFab,
            { bottom: 16 + safeArea.bottom + 72 /* sits above the + FAB */ },
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

      <ProfileSheet
        visible={profileOpen}
        profile={store.profile}
        onSave={(p) => {
          store.saveProfile(p);
          setProfileOpen(false);
        }}
        onClose={() => setProfileOpen(false)}
      />
      <SettingsSheet
        visible={settingsOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile({ ...store.profile, ...patch })
        }
        onOpenBackgrounds={() => setBgPickerOpen(true)}
        onShowIntro={() =>
          store.saveProfile({ ...store.profile, onboardingDone: false })
        }
        onClose={() => setSettingsOpen(false)}
      />
      <BackgroundPicker
        visible={bgPickerOpen}
        value={store.profile.background}
        onChange={(next) =>
          store.saveProfile({ ...store.profile, background: next })
        }
        onClose={() => setBgPickerOpen(false)}
      />
      <CategorySheet
        visible={categorySheetOpen}
        currentFilter={store.filter}
        pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[]}
        onSelectFilter={store.setFilter}
        onPinFilter={store.pinFilter}
        categories={store.categories}
        taskCounts={store.taskCountsForSheet}
        systemCounts={store.systemCounts}
        orderedStatuses={store.orderedStatuses}
        orderedVisibleStatuses={store.orderedVisibleStatuses}
        onAdd={store.addCategory}
        onEdit={store.editCategory}
        onDelete={store.deleteCategory}
        onReorder={store.reorderCategories}
        onRenameStatus={store.renameStatus}
        onToggleStatusHidden={store.toggleStatusHidden}
        onReorderStatuses={store.reorderStatuses}
        onClose={() => setCategorySheetOpen(false)}
      />
      <ComposeSheet
        visible={composeOpen}
        categories={store.categories}
        defaultCategory={store.defaultCategory}
        onAdd={store.addTask}
        onClose={() => setComposeOpen(false)}
      />
      {store.profile.agentEnabled && (
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
            setTimeout(() => setComposeOpen(true), 250);
          }
        }}
        onSkip={() => {
          store.saveProfile({ ...store.profile, onboardingDone: true });
        }}
      />
      {splashShown && (
        <SplashOverlay
          reduceMotion={reduceMotion}
          onDismiss={() => setSplashShown(false)}
        />
      )}
    </SafeAreaView>
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
                <PebbleFlightProvider>
                  <AppInner />
                </PebbleFlightProvider>
              </NotifyProvider>
            </LangProvider>
          </AuthProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
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
      backgroundColor: c.bg,
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
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
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
