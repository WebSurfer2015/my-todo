// Slice of useTodoStore.
// Owns todos + todoReferences + selectedTrashIds state, every todo
// and subtask mutation, and the trash bulk ops.
//
// Stable-callback rules from mobile/CLAUDE.md still apply: anything
// flowing into <TaskItem> (toggle / moveToTrash / restoreFromTrash /
// permanentlyDelete / updatePriority / updateDueDate /
// updateTaskCategory / updateText / toggleTrashSelection) is wrapped
// in useCallback with only setter deps, uses functional setState, and
// reads "current" todos via todosRef.

import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import {
  Category,
  Filter,
  Priority,
  Recurrence,
  Reminder,
  Subtask,
  Todo,
  TodoReference,
} from "../../core-bindings/types";
// Module-scope migrators (used by the parsers below) stay direct
// imports; every in-hook transform now comes from the createTodoStore
// actions surface (destructured inside the hook).
import {
  migrateTodos,
  migrateTodoReferences,
} from "../../../../core/src/logic/derive";
import { TodoStoreActions } from "../../../../core/src/store";
import { todayLocal, addDaysISO } from "../../../../core/src/logic/utils";
import { useSyncedState } from "../useSyncedState";
import { StorageAdapter } from "../../../../core/src/ports/persistence";
import { unwrap, serializeAny } from "../../storage/envelope";

const parseTodos = (raw: string | null): Todo[] => migrateTodos(unwrap(raw));
const parseTodoReferences = (raw: string | null): TodoReference[] =>
  migrateTodoReferences(unwrap(raw));

export interface TodosSliceDeps {
  /** Current filter + ref. The selectedTrashIds auto-clear effect
   * watches `filter`; some snackbar logic reads `filterRef.current`
   * inside stable callbacks. */
  filter: Filter;
  filterRef: MutableRefObject<Filter>;
  /** uid — passed through for the post-hydrate series top-up effect. */
  uid: string | null;
  t: {
    movedToTrash: string;
    movedToTrashMany: (n: number) => string;
    skippedSnackbar: string;
    completedSnackbar: (text: string) => string;
    completedSnackbarMany: (n: number) => string;
    undo: string;
    undoAll: string;
    emptyTrash: string;
    deletePermanentlyConfirm: (label: string) => string;
    filters: { trash: string };
    cancel: string;
    bulkDeletePermanently: string;
    bulkDeleteConfirm: (n: number) => string;
    clearAllCompleted: string;
    emptyTrashConfirm: (n: number) => string;
    deletePermanently: string;
    series: {
      editsApplied: (n: number) => string;
      editsNothing: string;
      trashedMany: (n: number) => string;
      recurrenceRecreated: (n: number) => string;
      subtasksApplied: (n: number) => string;
    };
    snooze: {
      toTomorrow: string;
      toNextWeek: string;
      toDays: (n: number) => string;
    };
    defer: { done: (n: number) => string };
  };
  notify: {
    showSnackbar: (opts: {
      message: string;
      actionLabel?: string;
      onAction?: () => void;
      mergeKey?: string;
      mergedMessage?: (n: number) => string;
      mergedActionLabel?: string;
    }) => void;
  };
  /** The createTodoStore pure-transform surface. */
  actions: TodoStoreActions;
}

/** Reverses exactly what an action did (see applyTracked). */
export type Undo = () => void;

export interface TodosSlice {
  // Persisted state
  todos: Todo[];
  setTodos: Dispatch<SetStateAction<Todo[]>>;
  todosLoaded: boolean;
  todoReferences: TodoReference[];
  // Session state
  selectedTrashIds: Set<string>;
  // Refs (exposed so the composer's deleteCategory cross-slice work
  // can read the latest todos without a fresh prop).
  todosRef: MutableRefObject<Todo[]>;
  // TaskItem-stable callbacks
  toggle: (id: string) => Undo | null;
  moveToTrash: (id: string) => Undo | null;
  /** R5 — Skip. Marks status='notDo' and routes to the Done bin
   * without flipping done. Series instances also get a fresh tail
   * appended. */
  skipTodo: (id: string) => Undo | null;
  skipSeriesFuture: (id: string) => Undo | null;
  restoreFromTrash: (id: string) => void;
  permanentlyDelete: (id: string) => void;
  permanentlyDeleteSeriesFuture: (id: string) => void;
  updatePriority: (id: string, priority: Priority) => void;
  updateDueDate: (id: string, dueDate: string) => void;
  /** Replaces the entire `reminders[]` on a todo. Pass `[]` to clear. */
  updateReminders: (id: string, reminders: Reminder[]) => void;
  updateTaskCategory: (id: string, category: Category) => void;
  updateText: (id: string, text: string) => void;
  updateNotes: (id: string, notes: string) => void;
  updateRecurrence: (id: string, recurrence: Recurrence | undefined) => void;
  toggleTrashSelection: (id: string) => void;
  // Series ops
  applySeriesFutureEdits: (
    id: string,
    fields: {
      text?: string;
      priority?: Priority;
      category?: Category | undefined;
      notes?: string;
    },
    options?: { overwriteDetached?: boolean; silent?: boolean },
  ) => void;
  /** R6a — Mark this series instance as detached so later series-wide
   * edits skip it by default. No-op when already detached or when
   * the row has no seriesId. */
  detachFromSeries: (id: string) => void;
  /** R6b — Apply a new recurrence to a series and recreate the tail.
   * Trashes future siblings (modulo `keepDetached`) and expands a
   * fresh tail from the edited row using `newRecurrence`. Pass
   * `undefined` to end the series at the edited row. */
  applyRecurrenceChange: (
    id: string,
    newRecurrence: Recurrence | undefined,
    options: { keepDetached: boolean },
  ) => void;
  /** R6c — Propagate the target's current subtasks shape to every
   * future non-trashed sibling. `keepDetached` lets per-instance
   * customizations survive ("Keep modified, overwrite the rest"). */
  applySeriesSubtasks: (
    id: string,
    options: { keepDetached: boolean },
  ) => void;
  moveSeriesFutureToTrash: (id: string) => Undo | null;
  // Subtasks
  addSubtask: (
    id: string,
    text: string,
    priority?: Priority,
    dueDate?: string,
  ) => void;
  toggleSubtask: (id: string, subId: string) => void;
  /** Put a to-do back exactly as `snapshot` (the edit/completion Undo). */
  revertTodo: (snapshot: Todo) => void;
  updateSubtaskText: (id: string, subId: string, text: string) => void;
  updateSubtaskPriority: (id: string, subId: string, priority: Priority) => void;
  updateSubtaskDueDate: (id: string, subId: string, dueDate: string) => void;
  removeSubtask: (id: string, subId: string) => void;
  clearSubtasks: (id: string) => void;
  // Defer / snooze
  deferOverdue: (daysFromToday: number) => void;
  bulkDeferTodos: (ids: string[], targetISO: string) => void;
  snooze: (id: string, daysFromToday: number) => void;
  // Non-stable
  addTask: (
    text: string,
    priority: Priority,
    dueDate: string,
    category?: Category,
    recurrence?: Recurrence,
    extras?: {
      notes?: string;
      subtasks?: Subtask[];
      reminders?: Reminder[];
    },
  ) => string;
  emptyTrash: () => void;
  clearTrashSelection: () => void;
  bulkRestore: () => void;
  bulkPermanentDelete: () => void;
  clearDone: () => void;
}

export function useTodosSlice(
  adapter: StorageAdapter,
  deps: TodosSliceDeps,
): TodosSlice {
  const {
    filter,
    filterRef,
    uid,
    t,
    notify,
    actions,
  } = deps;
  // Pure transforms via the createTodoStore surface. Stable across
  // ordinary renders (store memoized on t), so the existing TaskItem
  // callback deps stay correct and identities hold — preserving the
  // React.memo stability contract. Migrators + date utils stay direct.
  const {
    newTodo,
    todoToggle,
    todoRevert,
    todosRevertChanges,
    todoMoveToTrash,
    todoMoveToTrashFutureSeries,
    todoApplySeriesFutureEdits,
    todoRestoreFromTrash,
    todoPermanentlyDelete,
    todoPermanentlyDeleteSeriesFuture,
    todoEmptyTrash,
    todoClearDone,
    todoSet,
    recordTodoReference,
    subtaskAdd,
    subtaskToggle,
    subtaskUpdateText,
    subtaskUpdatePriority,
    subtaskUpdateDueDate,
    subtaskRemove,
    subtaskClearAll,
    topUpAllSeries,
    topUpSeries,
    todoSkip,
    todoSkipSeriesFuture,
    todoDetachFromSeries,
    todoApplyRecurrenceChange,
    todoApplySeriesSubtasks,
    expandSeries,
    todoSetReminders,
    todoSetRecurrence,
    selectOverdue,
    todoDeferTo,
    toggleSelection,
    applyBulkRestore,
    applyBulkDelete,
    toggleOutcome,
  } = actions;

  const [todos, setTodos, todosLoaded] = useSyncedState<Todo[]>(
    adapter,
    "todos",
    [],
    parseTodos,
    serializeAny,
  );
  const [todoReferences, setTodoReferences] = useSyncedState<TodoReference[]>(
    adapter,
    "todoReferences",
    [],
    parseTodoReferences,
    serializeAny,
  );
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(
    new Set(),
  );

  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // Series horizon top-up. Runs once per uid swap, after todos have
  // loaded, so a long-idle device extends its series tails to today's
  // window before the user sees the list. The ref guard prevents
  // re-entry within a session.
  const topUpForUidRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!todosLoaded) return;
    const k = uid ?? "(local)";
    if (topUpForUidRef.current === k) return;
    topUpForUidRef.current = k;
    const tu = topUpAllSeries(todosRef.current, todayLocal());
    if (tu.changed) setTodos(tu.todos);
  }, [todosLoaded, uid, setTodos, topUpAllSeries]);

  // Auto-clear trash selection when leaving trash view.
  useEffect(() => {
    if (filter !== "trash" && selectedTrashIds.size > 0) {
      setSelectedTrashIds(new Set());
    }
  }, [filter, selectedTrashIds.size]);

  // Apply a pure transform to the FRESHEST list and keep before/after for an
  // exact Undo. todosRef is advanced synchronously so several actions in one
  // tick (a Mochi batch: "mark these 3 done") chain on each other's result —
  // reading the render-time ref made later ones recompute with new random
  // ids that their Undo then couldn't find. Returns null when nothing changed.
  const applyTracked = useCallback(
    (fn: (ts: Todo[]) => Todo[]): { before: Todo[]; after: Todo[] } | null => {
      const before = todosRef.current;
      const after = fn(before);
      if (after === before) return null;
      todosRef.current = after;
      setTodos((prev) => (prev === before ? after : fn(prev)));
      return { before, after };
    },
    [setTodos],
  );
  const undoTracked = useCallback(
    (c: { before: Todo[]; after: Todo[] }) =>
      setTodos((prev) => todosRevertChanges(prev, c.before, c.after)),
    [setTodos, todosRevertChanges],
  );

  const toggle = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      // Undo reverses EXACTLY what this toggle did — a series completion
      // also appends the next occurrence and moves reminders.
      const change = applyTracked((ts) => todoToggle(ts, id));
      if (!beforeTodo || !change) return null;
      const undo: Undo = () => undoTracked(change);
      const { after, referenceRow } = toggleOutcome(beforeTodo);
      if (referenceRow) {
        setTodoReferences((prev) => recordTodoReference(prev, referenceRow));
      }
      if (!beforeTodo.done && after.done) {
        // Every completion is undoable. Undo restores the exact snapshot
        // (incl. per-step state), not a toggle-back. Several completions in
        // a row merge into one "N done · Undo all".
        const text = beforeTodo.text.length > 40 ? `${beforeTodo.text.slice(0, 39)}…` : beforeTodo.text;
        notify.showSnackbar({
          message: t.completedSnackbar(text),
          actionLabel: t.undo,
          onAction: undo,
          mergeKey: "done",
          mergedMessage: (n: number) => t.completedSnackbarMany(n),
          mergedActionLabel: t.undoAll,
        });
      } else if (
        beforeTodo.done &&
        !after.done &&
        (filterRef.current === "done" || filterRef.current === "trash")
      ) {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
      return undo;
    },
    [applyTracked, undoTracked, toggleOutcome, filterRef, todoToggle, setTodoReferences, recordTodoReference, notify, t],
  );

  const revertTodo = useCallback(
    (snapshot: Todo) => setTodos((prev) => todoRevert(prev, snapshot)),
    [setTodos, todoRevert],
  );

  const restoreFromTrash = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      setTodos((prev) => todoRestoreFromTrash(prev, id));
      if (!beforeTodo) return;
      if (filterRef.current === "done" || filterRef.current === "trash") {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
    },
    [setTodos, filterRef, todoRestoreFromTrash, notify],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      const change = applyTracked((ts) => todoMoveToTrash(ts, id));
      if (!change) return null;
      const undo: Undo = () => undoTracked(change);
      notify.showSnackbar({
        message: t.movedToTrash,
        actionLabel: t.undo,
        // Exact: restoreFromTrash reopened every step (2/5 came back 0/5).
        onAction: undo,
        mergeKey: "trash",
        mergedMessage: (n: number) => t.movedToTrashMany(n),
        mergedActionLabel: t.undoAll,
      });
      return undo;
    },
    [applyTracked, undoTracked, notify, t, todoMoveToTrash],
  );

  // R5 — Skip ("Not Do"). Sends the row to the Done
  // bin with status='notDo' so the bin renderer can distinguish it
  // from completed/trashed rows. For series instances, the core
  // helper also appends a fresh tail.
  const skipTodo = useCallback(
    (id: string) => {
      // null = nothing changed (e.g. a to-do with steps can't be skipped) —
      // don't claim "Skipped" for a no-op.
      const change = applyTracked((ts) => todoSkip(ts, id));
      if (!change) return null;
      const undo: Undo = () => undoTracked(change);
      notify.showSnackbar({
        message: t.skippedSnackbar,
        actionLabel: t.undo,
        // Exact: restoreFromTrash lost the occurrence's reminders and left
        // the appended next occurrence behind.
        onAction: undo,
      });
      return undo;
    },
    [applyTracked, undoTracked, notify, t.skippedSnackbar, t.undo, todoSkip],
  );

  // "Skip all" — skip this occurrence + every future sibling in the
  // series. Ends the series (no fresh tail). Undo restores via the
  // series-restore path is out of scope here; a plain snackbar nudge.
  const skipSeriesFuture = useCallback(
    (id: string) => {
      // Computed from the live list so the count is right and Undo can
      // reverse exactly this (it ended the series silently, with no Undo).
      let affected = 0;
      const change = applyTracked((ts) => {
        const r = todoSkipSeriesFuture(ts, id);
        affected = r.affected;
        return r.next;
      });
      if (!change) return null;
      const undo: Undo = () => undoTracked(change);
      notify.showSnackbar({
        message: affected > 1 ? `Skipped ${affected} to-dos in this series.` : t.skippedSnackbar,
        actionLabel: t.undo,
        onAction: undo,
      });
      return undo;
    },
    [applyTracked, undoTracked, notify, t.skippedSnackbar, t.undo, todoSkipSeriesFuture],
  );

  const applySeriesFutureEdits = useCallback(
    (
      id: string,
      fields: {
        text?: string;
        priority?: Priority;
        category?: Category | undefined;
        notes?: string;
      },
      options?: { overwriteDetached?: boolean; silent?: boolean },
    ) => {
      // Counted from the live list (applyTracked runs `fn` synchronously); a
      // count read inside a setTodos updater was still 0 when the snackbar
      // ran, so every apply said "Nothing to apply".
      let affected = 0;
      applyTracked((ts) => {
        const result = todoApplySeriesFutureEdits(ts, id, fields, {
          overwriteDetached: options?.overwriteDetached,
        });
        affected = result.affected;
        return result.next;
      });
      if (options?.silent) return;
      notify.showSnackbar({
        message:
          affected > 0
            ? t.series.editsApplied(affected)
            : t.series.editsNothing,
      });
    },
    [applyTracked, notify, t.series, todoApplySeriesFutureEdits],
  );

  // R6a — flip detachedFromSeries on the row. Called by
  // TaskDetailsSheet when the user makes a series-eligible edit in
  // "Edit this only" mode. The core helper short-circuits if the
  // row is already detached, so wrappers can call this on every
  // save without checking state.
  const detachFromSeries = useCallback(
    (id: string) => {
      setTodos((prev) => todoDetachFromSeries(prev, id));
    },
    [setTodos, todoDetachFromSeries],
  );

  // R6c — propagate the target's current subtasks shape (live edits
  // have already landed on this row) to every future non-trashed
  // sibling, modulo keepDetached. Cloned fresh per-instance so each
  // copy is independently togglable.
  const applySeriesSubtasks = useCallback(
    (id: string, options: { keepDetached: boolean }) => {
      let affected = 0;
      applyTracked((ts) => {
        const result = todoApplySeriesSubtasks(ts, id, options);
        affected = result.affected;
        return result.next;
      });
      notify.showSnackbar({
        message: t.series.subtasksApplied(affected),
      });
    },
    [applyTracked, notify, t.series, todoApplySeriesSubtasks],
  );

  // R6b — frequency-change apply for a series. Writes the new
  // recurrence, trashes future siblings (honoring keepDetached),
  // and re-expands a fresh tail. Composes the diff in one tracked
  // apply so cross-device sync sees a single mutation event and the
  // count is read from the live list.
  const applyRecurrenceChange = useCallback(
    (
      id: string,
      newRecurrence: Recurrence | undefined,
      options: { keepDetached: boolean },
    ) => {
      const today = todayLocal();
      let trashedCount = 0;
      applyTracked((ts) => {
        const result = todoApplyRecurrenceChange(ts, id, newRecurrence, today, {
          keepDetached: options.keepDetached,
        });
        trashedCount = result.trashedCount;
        return result.next;
      });
      notify.showSnackbar({
        message: t.series.recurrenceRecreated(trashedCount),
      });
    },
    [applyTracked, notify, t.series, todoApplyRecurrenceChange],
  );

  const moveSeriesFutureToTrash = useCallback(
    (id: string) => {
      // Computed from the live list: the count read inside the updater was
      // often still 0 when the snackbar ran, and there was no Undo.
      let affected = 0;
      const change = applyTracked((ts) => {
        const r = todoMoveToTrashFutureSeries(ts, id);
        affected = r.affected;
        return r.next;
      });
      if (!change) return null;
      const undo: Undo = () => undoTracked(change);
      notify.showSnackbar({
        message: affected > 1 ? t.series.trashedMany(affected) : t.movedToTrash,
        actionLabel: t.undo,
        onAction: undo,
      });
      return undo;
    },
    [applyTracked, undoTracked, notify, t.series, t.movedToTrash, t.undo, todoMoveToTrashFutureSeries],
  );

  const permanentlyDelete = useCallback(
    (id: string) => {
      setTodos((prev) => todoPermanentlyDelete(prev, id));
    },
    [setTodos, todoPermanentlyDelete],
  );

  // "Delete series" — hard-remove this + all future siblings.
  const permanentlyDeleteSeriesFuture = useCallback(
    (id: string) => {
      setTodos((prev) => todoPermanentlyDeleteSeriesFuture(prev, id));
    },
    [setTodos, todoPermanentlyDeleteSeriesFuture],
  );

  const updatePriority = useCallback(
    (id: string, priority: Priority) => {
      setTodos((prev) => todoSet(prev, id, "priority", priority));
    },
    [setTodos, todoSet],
  );

  const updateDueDate = useCallback(
    (id: string, dueDate: string) => {
      setTodos((prev) => todoSet(prev, id, "dueDate", dueDate));
    },
    [setTodos, todoSet],
  );

  // Writes the reminders array on the row (empty input clears it). The
  // scheduler diffs and reconciles via the existing syncTodoReminders effect.
  const updateReminders = useCallback(
    (id: string, reminders: Reminder[]) => {
      setTodos((prev) => todoSetReminders(prev, id, reminders));
    },
    [setTodos, todoSetReminders],
  );

  // Defer moves each to-do's date (keeping its time + moving its upcoming
  // reminders) and, per repeating series, carries forward only the newest
  // missed occurrence — the older ones are skipped instead of piling onto
  // one day (todoDeferTo). The count is what actually moved; Undo is exact.
  const deferOverdue = useCallback(
    (daysFromToday: number) => {
      const today = todayLocal();
      const ids = selectOverdue(todosRef.current, today).map((td) => td.id);
      if (ids.length === 0) return;
      let deferred = 0;
      const change = applyTracked((ts) => {
        const r = todoDeferTo(ts, ids, addDaysISO(daysFromToday), today);
        deferred = r.deferred;
        return r.next;
      });
      if (!change) return;
      notify.showSnackbar({
        message: t.defer.done(deferred),
        actionLabel: t.undoAll,
        onAction: () => undoTracked(change),
      });
    },
    [selectOverdue, applyTracked, undoTracked, todoDeferTo, notify, t.defer, t.undoAll],
  );

  const bulkDeferTodos = useCallback(
    (ids: string[], targetISO: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetISO)) return;
      let deferred = 0;
      const change = applyTracked((ts) => {
        const r = todoDeferTo(ts, ids, targetISO, todayLocal());
        deferred = r.deferred;
        return r.next;
      });
      if (!change) return;
      notify.showSnackbar({
        message:
          deferred === 1
            ? "1 to-do deferred."
            : `${deferred} to-dos deferred.`,
        actionLabel: t.undoAll,
        onAction: () => undoTracked(change),
      });
    },
    [applyTracked, undoTracked, todoDeferTo, notify, t.undoAll],
  );

  const snooze = useCallback(
    (id: string, daysFromToday: number) => {
      const newDate = addDaysISO(daysFromToday);
      // Exact Undo: the snooze also moves the to-do's upcoming reminders.
      const change = applyTracked((ts) =>
        ts.some((td) => td.id === id) ? todoSet(ts, id, "dueDate", newDate) : ts,
      );
      if (!change) return;
      const label =
        daysFromToday === 1
          ? t.snooze.toTomorrow
          : daysFromToday === 7
            ? t.snooze.toNextWeek
            : t.snooze.toDays(daysFromToday);
      notify.showSnackbar({
        message: label,
        actionLabel: t.undo,
        onAction: () => undoTracked(change),
      });
    },
    [applyTracked, undoTracked, t.snooze, t.undo, notify, todoSet],
  );

  const updateTaskCategory = useCallback(
    (id: string, category: Category) => {
      setTodos((prev) => todoSet(prev, id, "category", category));
    },
    [setTodos, todoSet],
  );

  const updateText = useCallback(
    (id: string, text: string) => {
      setTodos((prev) => todoSet(prev, id, "text", text));
    },
    [setTodos, todoSet],
  );

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      setTodos((prev) => todoSet(prev, id, "notes", notes));
    },
    [setTodos, todoSet],
  );

  const addSubtask = useCallback(
    (id: string, text: string, priority?: Priority, dueDate?: string) => {
      setTodos((prev) => subtaskAdd(prev, id, text, priority, dueDate));
    },
    [setTodos, subtaskAdd],
  );

  const toggleSubtask = useCallback(
    (id: string, subId: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      const beforeSub = beforeTodo?.subtasks?.find((s) => s.id === subId);
      // Tracked: finishing the last step completes the to-do (and rolls a
      // series forward), so it gets the same completion snackbar + exact
      // Undo as tapping the circle.
      const change = applyTracked((ts) => subtaskToggle(ts, id, subId));
      if (!beforeTodo || !change) return;
      const afterTodo = change.after.find((td) => td.id === id);
      if (!beforeTodo.done && afterTodo?.done) {
        setTodoReferences((prev) => recordTodoReference(prev, afterTodo));
        const text = beforeTodo.text.length > 40 ? `${beforeTodo.text.slice(0, 39)}…` : beforeTodo.text;
        notify.showSnackbar({
          message: t.completedSnackbar(text),
          actionLabel: t.undo,
          onAction: () => undoTracked(change),
          mergeKey: "done",
          mergedMessage: (n: number) => t.completedSnackbarMany(n),
          mergedActionLabel: t.undoAll,
        });
      } else if (
        beforeTodo.done &&
        beforeSub?.done &&
        (filterRef.current === "done" || filterRef.current === "trash")
      ) {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
    },
    [applyTracked, undoTracked, filterRef, subtaskToggle, setTodoReferences, recordTodoReference, notify, t],
  );

  const updateSubtaskText = useCallback(
    (id: string, subId: string, text: string) => {
      setTodos((prev) => subtaskUpdateText(prev, id, subId, text));
    },
    [setTodos, subtaskUpdateText],
  );

  const updateSubtaskPriority = useCallback(
    (id: string, subId: string, priority: Priority) => {
      setTodos((prev) => subtaskUpdatePriority(prev, id, subId, priority));
    },
    [setTodos, subtaskUpdatePriority],
  );

  const updateSubtaskDueDate = useCallback(
    (id: string, subId: string, dueDate: string) => {
      setTodos((prev) => subtaskUpdateDueDate(prev, id, subId, dueDate));
    },
    [setTodos, subtaskUpdateDueDate],
  );

  const removeSubtask = useCallback(
    (id: string, subId: string) => {
      setTodos((prev) => subtaskRemove(prev, id, subId));
    },
    [setTodos, subtaskRemove],
  );

  const clearSubtasks = useCallback(
    (id: string) => {
      setTodos((prev) => subtaskClearAll(prev, id));
    },
    [setTodos, subtaskClearAll],
  );

  // ---- Non-stable mutations ----

  const addTask = useCallback(
    (
      text: string,
      priority: Priority,
      dueDate: string,
      category?: Category,
      recurrence?: Recurrence,
      extras?: {
        notes?: string;
        subtasks?: Subtask[];
        reminders?: Reminder[];
      },
    ) => {
      const notes = extras?.notes;
      const subtasks = extras?.subtasks;
      const reminders = extras?.reminders;
      setTodoReferences((prev) =>
        recordTodoReference(prev, { text, priority, category, recurrence }),
      );
      // Build the seed OUTSIDE setTodos (newTodo is pure given now/genId) so
      // we can return its id — callers like the Mochi optimistic-apply need
      // it to wire an Undo. It also avoids minting two ids under a
      // double-invoked updater in strict mode.
      const seed = newTodo({
        text,
        priority,
        dueDate,
        category,
        recurrence,
        subtasks,
        notes,
        reminders,
      });
      setTodos((prev) => {
        // R1 — pre-expand the recurring series so the user
        // immediately sees their daily/weekly/monthly/yearly window
        // populated (head + tail). For one-offs, fall through to the
        // single-instance prepend.
        if (recurrence) {
          const expanded = expandSeries(seed, todayLocal());
          return [...expanded, ...prev];
        }
        return [seed, ...prev];
      });
      return seed.id;
    },
    [setTodoReferences, newTodo, setTodos, recordTodoReference, expandSeries],
  );

  const updateRecurrence = useCallback(
    (id: string, recurrence: Recurrence | undefined) => {
      setTodos((prev) => {
        const next = todoSetRecurrence(prev, id, recurrence);
        // Fill the series window right away — otherwise a newly-repeating
        // to-do had only its one occurrence until the next cold launch.
        const sid = recurrence ? next.find((td) => td.id === id)?.seriesId : undefined;
        return sid ? topUpSeries(next, sid, todayLocal()) : next;
      });
    },
    [setTodos, todoSetRecurrence, topUpSeries],
  );

  const emptyTrash = useCallback(() => {
    const n = todosRef.current.filter((td) => td.trashed).length;
    if (n === 0) return;
    Alert.alert(t.emptyTrash, t.emptyTrashConfirm(n), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.emptyTrash,
        style: "destructive",
        onPress: () => setTodos(todoEmptyTrash),
      },
    ]);
  }, [setTodos, t, todoEmptyTrash]);

  const toggleTrashSelection = useCallback((id: string) => {
    setSelectedTrashIds((prev) =>
      toggleSelection({
        prev,
        id,
        shiftKey: false,
        lastSelected: null,
        orderedIds: [],
      }),
    );
  }, [toggleSelection]);

  const clearTrashSelection = useCallback(() => {
    setSelectedTrashIds(new Set());
  }, []);

  const bulkRestore = useCallback(() => {
    if (selectedTrashIds.size === 0) return;
    setTodos((prev) => applyBulkRestore(prev, selectedTrashIds));
    clearTrashSelection();
  }, [selectedTrashIds, setTodos, clearTrashSelection, applyBulkRestore]);

  const bulkPermanentDelete = useCallback(() => {
    const ids = selectedTrashIds;
    if (ids.size === 0) return;
    Alert.alert(t.bulkDeletePermanently, t.bulkDeleteConfirm(ids.size), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.bulkDeletePermanently,
        style: "destructive",
        onPress: () => {
          setTodos((prev) => applyBulkDelete(prev, ids));
          clearTrashSelection();
        },
      },
    ]);
  }, [selectedTrashIds, t, setTodos, clearTrashSelection, applyBulkDelete]);

  const clearDone = useCallback(() => {
    const count = todosRef.current.filter(
      (td) => td.done || td.trashed,
    ).length;
    if (count === 0) return;
    Alert.alert(t.clearAllCompleted, t.emptyTrashConfirm(count), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.deletePermanently,
        style: "destructive",
        onPress: () => {
          setTodos((prev) => todoClearDone(prev).todos);
        },
      },
    ]);
  }, [setTodos, t, todoClearDone]);

  return {
    todos,
    setTodos,
    todosLoaded,
    todoReferences,
    selectedTrashIds,
    todosRef,
    toggle,
    revertTodo,
    moveToTrash,
    skipTodo,
    skipSeriesFuture,
    restoreFromTrash,
    permanentlyDelete,
    permanentlyDeleteSeriesFuture,
    updatePriority,
    updateDueDate,
    updateReminders,
    updateTaskCategory,
    updateText,
    updateNotes,
    updateRecurrence,
    toggleTrashSelection,
    applySeriesFutureEdits,
    detachFromSeries,
    applyRecurrenceChange,
    applySeriesSubtasks,
    moveSeriesFutureToTrash,
    addSubtask,
    toggleSubtask,
    updateSubtaskText,
    updateSubtaskPriority,
    updateSubtaskDueDate,
    removeSubtask,
    clearSubtasks,
    deferOverdue,
    bulkDeferTodos,
    snooze,
    addTask,
    emptyTrash,
    clearTrashSelection,
    bulkRestore,
    bulkPermanentDelete,
    clearDone,
  };
}
