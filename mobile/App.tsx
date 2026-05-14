import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTheme, ThemeColors } from "./src/theme";
import FilterBar from "./src/components/FilterBar";
import ViewToggle from "./src/components/ViewToggle";
import Fab from "./src/components/Fab";
import ComposeSheet from "./src/components/ComposeSheet";
import TaskItem from "./src/components/TaskItem";
import Footer from "./src/components/Footer";
import Avatar from "./src/components/Avatar";
import ProfileSheet from "./src/components/ProfileSheet";
import CategorySheet from "./src/components/CategorySheet";
import { LangProvider, useLang } from "./src/LangContext";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { NotifyProvider } from "./src/notify";
import { ErrorBoundary } from "./src/ErrorBoundary";
import { useTodoStore } from "./src/useTodoStore";
import SignIn from "./src/components/SignIn";

function AppInner() {
  const { t } = useLang();
  const { user, loading: authLoading } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const store = useTodoStore();

  const [profileOpen, setProfileOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  if (authLoading)
    return <SafeAreaView style={styles.safe} edges={["top", "bottom"]} />;
  if (!user) return <SignIn />;
  if (!store.loaded)
    return <SafeAreaView style={styles.safe} edges={["top", "bottom"]} />;

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
          stickyHeaderIndices={[2]}
        >
          <TouchableOpacity
            style={styles.identityRow}
            onPress={() => setProfileOpen(true)}
            activeOpacity={0.7}
            accessibilityLabel={t.editProfile}
            accessibilityRole="button"
          >
            <Avatar avatar={store.profile.avatar} size={36} />
            <View style={styles.identityTextWrap}>
              <Text style={styles.identityName} numberOfLines={1}>
                {store.appTitle}
              </Text>
              <Text style={styles.identityGreeting} numberOfLines={2}>
                {store.headerLine}
              </Text>
            </View>
          </TouchableOpacity>

          <ViewToggle view={store.view} onChange={store.changeView} />

          <View style={styles.stickyFilter}>
            <FilterBar
              view={store.view}
              filter={store.filter}
              onFilter={store.setFilter}
              systemCounts={store.systemCounts}
              byCategory={store.byCategory}
              categories={store.categories}
              onManageCategories={() => setCategorySheetOpen(true)}
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

            {store.inTrashView ? (
              store.filtered.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyTitle}>
                    {store.emptyState.title}
                  </Text>
                  {store.emptyState.hint && (
                    <Text style={styles.emptyHint}>
                      {store.emptyState.hint}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.groupCard}>
                  {store.filtered.map((td, i) => (
                    <View key={td.id}>
                      {i > 0 && <View style={styles.rowSeparator} />}
                      <TaskItem
                        todo={td}
                        categories={store.categories}
                        density={store.profile.density}
                        inTrash
                        selected={store.selectedTrashIds.has(td.id)}
                        onToggleSelect={store.toggleTrashSelection}
                        onToggle={store.toggle}
                        onMoveToTrash={store.moveToTrash}
                        onRestore={store.restoreFromTrash}
                        onPermanentDelete={store.permanentlyDelete}
                        onUpdatePriority={store.updatePriority}
                        onUpdateDueDate={store.updateDueDate}
                        onUpdateCategory={store.updateTaskCategory}
                        onUpdateText={store.updateText}
                      />
                    </View>
                  ))}
                </View>
              )
            ) : store.groups.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>{store.emptyState.title}</Text>
                {store.emptyState.hint && (
                  <Text style={styles.emptyHint}>{store.emptyState.hint}</Text>
                )}
                {store.emptyState.ctaLabel && (
                  <TouchableOpacity
                    style={styles.emptyCta}
                    onPress={() => setComposeOpen(true)}
                  >
                    <Text style={styles.emptyCtaText}>
                      {store.emptyState.ctaLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              store.groups.map((group) => (
                <View key={group.key} style={styles.groupSection}>
                  <Text
                    style={[
                      styles.groupHeader,
                      group.overdue && styles.groupHeaderOverdue,
                    ]}
                  >
                    {t.groups[group.key]}
                  </Text>
                  <View style={styles.groupCard}>
                    {group.todos.map((td, i) => (
                      <View key={td.id}>
                        {i > 0 && <View style={styles.rowSeparator} />}
                        <TaskItem
                          todo={td}
                          categories={store.categories}
                          density={store.profile.density}
                          onToggle={store.toggle}
                          onMoveToTrash={store.moveToTrash}
                          onUpdatePriority={store.updatePriority}
                          onUpdateDueDate={store.updateDueDate}
                          onUpdateCategory={store.updateTaskCategory}
                          onUpdateText={store.updateText}
                          onAddSubtask={store.addSubtask}
                          onToggleSubtask={store.toggleSubtask}
                          onUpdateSubtaskText={store.updateSubtaskText}
                          onRemoveSubtask={store.removeSubtask}
                          subtaskVisibility={
                            store.filter === 'open'
                              ? 'open'
                              : store.filter === 'done'
                                ? 'done'
                                : 'all'
                          }
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}

            {!store.inTrashView && (
              <Footer
                remaining={store.visibleRemaining}
                completedCount={store.completedCount}
                onClearDone={store.clearDone}
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

      <ProfileSheet
        visible={profileOpen}
        profile={store.profile}
        onSave={(p) => {
          store.saveProfile(p);
          setProfileOpen(false);
        }}
        onClose={() => setProfileOpen(false)}
      />
      <CategorySheet
        visible={categorySheetOpen}
        categories={store.categories}
        taskCounts={store.taskCountsForSheet}
        onAdd={store.addCategory}
        onEdit={store.editCategory}
        onDelete={store.deleteCategory}
        onReorder={store.reorderCategories}
        onClose={() => setCategorySheetOpen(false)}
      />
      <ComposeSheet
        visible={composeOpen}
        categories={store.categories}
        defaultCategory={store.defaultCategory}
        onAdd={store.addTask}
        onClose={() => setComposeOpen(false)}
      />
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
                <AppInner />
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
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    identityTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    identityName: {
      fontSize: 14,
      fontWeight: "700",
      color: c.label,
      letterSpacing: -0.16,
    },
    identityGreeting: {
      fontSize: 12,
      color: c.label2,
      fontWeight: "500",
      marginTop: 1,
    },
    stickyFilter: {
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    groupSection: {
      marginBottom: 18,
    },
    groupCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 48,
    },
    emptyWrap: {
      alignItems: "center",
      paddingVertical: 56,
      paddingHorizontal: 16,
      gap: 6,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: c.label,
    },
    emptyHint: {
      fontSize: 13,
      color: c.label3,
      textAlign: "center",
      maxWidth: 320,
      lineHeight: 18,
    },
    emptyCta: {
      marginTop: 12,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.blue,
    },
    emptyCtaText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    groupHeader: {
      fontSize: 12,
      fontWeight: "700",
      color: c.label3,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: 8,
      marginLeft: 4,
    },
    groupHeaderOverdue: {
      color: c.red,
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
