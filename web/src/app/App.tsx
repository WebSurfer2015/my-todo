import { useEffect, useRef, useState } from "react";
import AddTask, { AddTaskHandle } from "../features/task/AddTask";
import Sidebar from "./Sidebar";
import MobileTopBar from "./MobileTopBar";
import TaskItem from "../features/task/TaskItem";
import Footer from "./Footer";
import SignIn from "../features/auth/SignIn";
import { useLang } from "./LangContext";
import { useTodoStore } from "../store/useTodoStore";
import { useAuth } from "./AuthContext";

export default function App() {
  const { t } = useLang();
  const { user, loading: authLoading } = useAuth();
  const store = useTodoStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const addTaskRef = useRef<AddTaskHandle>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [store.filter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (store.filter === "trash") store.setFilter("all");
        addTaskRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store.filter, store.setFilter]);

  if (authLoading) {
    return <div className="auth-loading" aria-busy="true" />;
  }
  if (!user) {
    return <SignIn />;
  }

  return (
    <div
      className={`app-shell${drawerOpen ? " drawer-open" : ""}`}
      data-density={store.profile.density ?? "comfortable"}
      data-reduce-motion={store.profile.reduceMotion ? "true" : "false"}
    >
      <div
        className={`drawer-backdrop${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        filter={store.filter}
        onFilter={store.setFilter}
        counts={store.counts}
        greetingKey={store.greetingKey}
        categories={store.categories}
        todoCounts={store.counts.byCategory}
        onAddCategory={store.addCategory}
        onEditCategory={store.editCategory}
        onDeleteCategory={store.deleteCategory}
        onReorderCategories={store.reorderCategories}
        profile={store.profile}
        onSaveProfile={store.saveProfile}
      />
      <main className="content">
        <MobileTopBar
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((v) => !v)}
          title={store.sectionLabel ?? store.appTitle}
          subtitle={store.subtitle}
        />
        {store.inTrashView && store.trashCount > 0 && (
          <div className="trash-actions">
            {store.selectedTrashIds.size > 0 ? (
              <div className="bulk-actions">
                <span className="bulk-count">
                  {t.selectedCount(store.selectedTrashIds.size)}
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={store.bulkRestore}
                >
                  {t.bulkRestore}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={store.bulkPermanentDelete}
                >
                  {t.bulkDeletePermanently}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={store.clearTrashSelection}
                >
                  {t.clearSelection}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                onClick={store.emptyTrash}
              >
                {t.emptyTrash}
              </button>
            )}
          </div>
        )}

        <div className="content-body">
          {!store.inTrashView && (
            <AddTask
              ref={addTaskRef}
              onAdd={store.addTask}
              defaultCategory={store.defaultCategory}
              categories={store.categories}
            />
          )}

          {store.inTrashView ? (
            store.filtered.length === 0 ? (
              <div className="empty">
                <p className="empty-title">{store.emptyState.title}</p>
                {store.emptyState.hint && (
                  <p className="empty-hint">{store.emptyState.hint}</p>
                )}
              </div>
            ) : (
              <>
                <p className="trash-notice">{t.trashRetention}</p>
                <ul className="list">
                  {store.filtered.map((td) => (
                    <TaskItem
                      key={td.id}
                      todo={td}
                      categories={store.categories}
                      inTrash
                      selected={store.selectedTrashIds.has(td.id)}
                      bulkSelecting={store.selectedTrashIds.size > 0}
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
                  ))}
                </ul>
              </>
            )
          ) : store.groups.length === 0 ? (
            <div className="empty">
              <p className="empty-title">{store.emptyState.title}</p>
              {store.emptyState.hint && (
                <p className="empty-hint">{store.emptyState.hint}</p>
              )}
            </div>
          ) : (
            store.groups.map((group) => (
              <section key={group.key} className="group">
                <h2
                  className={`group-header${group.overdue ? " group-header--overdue" : ""}`}
                >
                  {t.groups[group.key]}
                </h2>
                <ul className="list">
                  {group.todos.map((td) => (
                    <TaskItem
                      key={td.id}
                      todo={td}
                      categories={store.categories}
                      inTrash={false}
                      onToggle={store.toggle}
                      onMoveToTrash={store.moveToTrash}
                      onRestore={store.restoreFromTrash}
                      onPermanentDelete={store.permanentlyDelete}
                      onUpdatePriority={store.updatePriority}
                      onUpdateDueDate={store.updateDueDate}
                      onUpdateCategory={store.updateTaskCategory}
                      onUpdateText={store.updateText}
                      onAddSubtask={store.addSubtask}
                      onToggleSubtask={store.toggleSubtask}
                      onUpdateSubtaskText={store.updateSubtaskText}
                      onUpdateSubtaskPriority={store.updateSubtaskPriority}
                      onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
                      onRemoveSubtask={store.removeSubtask}
                      onClearSubtasks={store.clearSubtasks}
                      subtaskVisibility={
                        store.filter === 'open'
                          ? 'open'
                          : store.filter === 'done'
                            ? 'done'
                            : 'all'
                      }
                      agentEnabled={store.profile.agentEnabled !== false}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          {!store.inTrashView && (
            <Footer
              remaining={store.visibleRemaining}
              completedCount={store.completedCount}
              onClearDone={store.clearDone}
            />
          )}
        </div>
      </main>
    </div>
  );
}
