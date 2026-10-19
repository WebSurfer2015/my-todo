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
import { TodoStoreActions, mergeTodos } from "../../../../core/src/store";
import {
  todayLocal,
  addDaysISO,
  dueDateToDate,
  dueDateWithDay,
} from "../../../../core/src/logic/utils";
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
  /** Local calendar day (yyyy-mm-dd), advanced at midnight / on foreground
   * by the store — the series top-up runs once per uid PER DAY. */
  today: string;
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

/** Defer snackbar: what moved, plus — when a repeating series had several
 * missed occurrences — how many older ones were tucked into Done instead of
 * piling onto one day (core todoDeferTo's `skipped`). English-only launch. */
export function deferSnackbarMessage(deferredMessage: string, skipped: number): string {
  if (skipped <= 0) return deferredMessage;
  const base = deferredMessage.replace(/\.$/, "");
  return `${base} · ${skipped} earlier ${skipped === 1 ? "repeat" : "repeats"} tucked into Done.`;
}

export interface TodosSlice {
  // Persisted state
  todos: Todo[];
  setTodos: Dispatch<SetStateAction<Todo[]>>;
  todosLoaded: boolean;
  /** Todos came from real data (a resolved read or a trusted snapshot), not
   * defaults after a failed / timed-out hydrate. */
  todosTrusted: boolean;
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
  /** Series occurrence → the series-wide rule change (keepDetached). */
  updateRecurrence: (id: string, recurrence: Recurrence | undefined) => Undo | null;
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
  ) => Undo | null;
  toggleSubtask: (id: string, subId: string) => Undo | null;
  /** Put a to-do back exactly as `snapshot` (the edit/completion Undo). */
  revertTodo: (snapshot: Todo) => void;
  updateSubtaskText: (id: string, subId: string, text: string) => void;
  updateSubtaskPriority: (id: string, subId: string, priority: Priority) => void;
  updateSubtaskDueDate: (id: string, subId: string, dueDate: string) => void;
  removeSubtask: (id: string, subId: string) => Undo | null;
  clearSubtasks: (id: string) => void;
  // Defer / snooze
  deferOverdue: (daysFromToday: number) => void;
  bulkDeferTodos: (ids: string[], targetISO: string) => Undo | null;
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
  /** addTask that also hands back an exact Undo (removes every row it
   * created — the whole new series for a repeating to-do). */
  addTaskWithUndo: (...args: Parameters<TodosSlice["addTask"]>) => { id: string; undo: Undo };
  /** Run a pure transform through the tracked setter (exact Undo source). */
  applyTracked: (fn: (ts: Todo[]) => Todo[]) => { before: Todo[]; after: Todo[] } | null;
  undoTracked: (c: { before: Todo[]; after: Todo[] }) => void;
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
    today,
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

  // `todos` is one doc holding the whole list, so replace-on-snapshot was
  // last-writer-wins across devices: merge instead (3-way, by id/updatedAt).
  const [todos, setTodosRaw, todosLoaded, todosTrusted, todosServerConfirmed] =
    useSyncedState<Todo[]>(adapter, "todos", [], parseTodos, serializeAny, {
      merge: mergeTodos,
    });
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

  // Latest todos. Remote snapshots land here on commit; every LOCAL mutation
  // advances it synchronously through applyTracked (below).
  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // THE todos setter — every mutation goes through it. Applies a pure
  // transform to the FRESHEST list, advances todosRef synchronously, and
  // keeps before/after for an exact Undo. The synchronous advance is what
  // lets several actions in one tick (a Mochi batch: "add X and mark the
  // series done") chain on each other's result — an untracked setter left
  // the ref behind, so a later tracked toggle re-ran its transform on the
  // fresher list with new ids for the appended occurrence, and its Undo
  // couldn't find them. Returns null when nothing changed.
  const applyTracked = useCallback(
    (fn: (ts: Todo[]) => Todo[]): { before: Todo[]; after: Todo[] } | null => {
      const before = todosRef.current;
      const after = fn(before);
      if (after === before) return null;
      todosRef.current = after;
      setTodosRaw((prev) => (prev === before ? after : fn(prev)));
      return { before, after };
    },
    [setTodosRaw],
  );
  // Dispatch-shaped wrapper for the composer's cross-slice work (same path).
  const setTodos = useCallback<Dispatch<SetStateAction<Todo[]>>>(
    (action) => {
      applyTracked(typeof action === "function" ? action : () => action);
    },
    [applyTracked],
  );
  const undoTracked = useCallback(
    (c: { before: Todo[]; after: Todo[] }) => {
      applyTracked((prev) => todosRevertChanges(prev, c.before, c.after));
    },
    [applyTracked, todosRevertChanges],
  );

  // Series horizon top-up. Runs once per uid per DAY so a long-idle device
  // extends its series tails to today's window — and an app left open past
  // midnight extends them too. Only on SERVER-confirmed todos: the first
  // hydrate is cache-first, and topping up a stale cached list (then writing
  // the whole doc) could clobber another device's newer server copy. The
  // latch is set only when it actually ran on confirmed data, so an offline
  // launch tops up once the server answers.
  const topUpForKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!todosLoaded || !todosServerConfirmed) return;
    const k = `${uid ?? "(none)"}|${today}`;
    if (topUpForKeyRef.current === k) return;
    topUpForKeyRef.current = k;
    applyTracked((ts) => {
      const tu = topUpAllSeries(ts, today);
      return tu.changed ? tu.todos : ts;
    });
  }, [todosLoaded, todosServerConfirmed, uid, today, applyTracked, topUpAllSeries]);

  // Auto-clear trash selection when leaving trash view.
  useEffect(() => {
    if (filter !== "trash" && selectedTrashIds.size > 0) {
      setSelectedTrashIds(new Set());
    }
  }, [filter, selectedTrashIds.size]);

  const toggle = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      // Undo reverses EXACTLY what this toggle did — a series completion
      // also appends the next occurrence and moves reminders.
      const change = applyTracked((ts) => todoToggle(ts, id, todayLocal()));
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
    (snapshot: Todo) => applyTracked((prev) => todoRevert(prev, snapshot)),
    [applyTracked, todoRevert],
  );

  const restoreFromTrash = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      applyTracked((prev) => todoRestoreFromTrash(prev, id));
      if (!beforeTodo) return;
      if (filterRef.current === "done" || filterRef.current === "trash") {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
    },
    [applyTracked, filterRef, todoRestoreFromTrash, notify],
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
      const change = applyTracked((ts) => todoSkip(ts, id, todayLocal()));
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
        const r = todoSkipSeriesFuture(ts, id, todayLocal());
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
      applyTracked((prev) => todoDetachFromSeries(prev, id));
    },
    [applyTracked, todoDetachFromSeries],
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
      applyTracked((prev) => todoPermanentlyDelete(prev, id));
    },
    [applyTracked, todoPermanentlyDelete],
  );

  // "Delete series" — hard-remove this + all future siblings.
  const permanentlyDeleteSeriesFuture = useCallback(
    (id: string) => {
      applyTracked((prev) => todoPermanentlyDeleteSeriesFuture(prev, id));
    },
    [applyTracked, todoPermanentlyDeleteSeriesFuture],
  );

  const updatePriority = useCallback(
    (id: string, priority: Priority) => {
      applyTracked((prev) => todoSet(prev, id, "priority", priority));
    },
    [applyTracked, todoSet],
  );

  const updateDueDate = useCallback(
    (id: string, dueDate: string) => {
      applyTracked((prev) => todoSet(prev, id, "dueDate", dueDate));
    },
    [applyTracked, todoSet],
  );

  // Writes the reminders array on the row (empty input clears it). The
  // scheduler diffs and reconciles via the existing syncTodoReminders effect.
  const updateReminders = useCallback(
    (id: string, reminders: Reminder[]) => {
      applyTracked((prev) => todoSetReminders(prev, id, reminders));
    },
    [applyTracked, todoSetReminders],
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
      let skipped = 0;
      const change = applyTracked((ts) => {
        const r = todoDeferTo(ts, ids, addDaysISO(daysFromToday), today);
        deferred = r.deferred;
        skipped = r.skipped;
        return r.next;
      });
      if (!change) return;
      notify.showSnackbar({
        message: deferSnackbarMessage(t.defer.done(deferred), skipped),
        actionLabel: deferred + skipped === 1 ? t.undo : t.undoAll,
        onAction: () => undoTracked(change),
      });
    },
    [selectOverdue, applyTracked, undoTracked, todoDeferTo, notify, t.defer, t.undo, t.undoAll],
  );

  const bulkDeferTodos = useCallback(
    (ids: string[], targetISO: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetISO)) return null;
      let deferred = 0;
      let skipped = 0;
      const change = applyTracked((ts) => {
        const r = todoDeferTo(ts, ids, targetISO, todayLocal());
        deferred = r.deferred;
        skipped = r.skipped;
        return r.next;
      });
      if (!change) return null;
      const undo: Undo = () => undoTracked(change);
      notify.showSnackbar({
        message: deferSnackbarMessage(
          deferred === 1 ? "1 to-do deferred." : `${deferred} to-dos deferred.`,
          skipped,
        ),
        actionLabel: deferred + skipped === 1 ? t.undo : t.undoAll,
        onAction: undo,
      });
      return undo;
    },
    [applyTracked, undoTracked, todoDeferTo, notify, t.undo, t.undoAll],
  );

  const snooze = useCallback(
    (id: string, daysFromToday: number) => {
      const day = dueDateToDate(addDaysISO(daysFromToday));
      // Keeps a time of day (`…T15:00` stays 15:00 on the new day), and
      // todoSet moves the to-do's upcoming reminders by the same delta.
      // Exact Undo covers both.
      const change = applyTracked((ts) => {
        const td = ts.find((x) => x.id === id);
        return td ? todoSet(ts, id, "dueDate", dueDateWithDay(td.dueDate, day)) : ts;
      });
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
      applyTracked((prev) => todoSet(prev, id, "category", category));
    },
    [applyTracked, todoSet],
  );

  const updateText = useCallback(
    (id: string, text: string) => {
      applyTracked((prev) => todoSet(prev, id, "text", text));
    },
    [applyTracked, todoSet],
  );

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      applyTracked((prev) => todoSet(prev, id, "notes", notes));
    },
    [applyTracked, todoSet],
  );

  const addSubtask = useCallback(
    (id: string, text: string, priority?: Priority, dueDate?: string) => {
      const change = applyTracked((prev) => subtaskAdd(prev, id, text, priority, dueDate));
      return change ? () => undoTracked(change) : null;
    },
    [applyTracked, undoTracked, subtaskAdd],
  );

  const toggleSubtask = useCallback(
    (id: string, subId: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      const beforeSub = beforeTodo?.subtasks?.find((s) => s.id === subId);
      // Tracked: finishing the last step completes the to-do (and rolls a
      // series forward), so it gets the same completion snackbar + exact
      // Undo as tapping the circle.
      const change = applyTracked((ts) => subtaskToggle(ts, id, subId, todayLocal()));
      if (!change) return null;
      const undo: Undo = () => undoTracked(change);
      if (!beforeTodo) return undo;
      const afterTodo = change.after.find((td) => td.id === id);
      if (!beforeTodo.done && afterTodo?.done) {
        setTodoReferences((prev) => recordTodoReference(prev, afterTodo));
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
        beforeSub?.done &&
        (filterRef.current === "done" || filterRef.current === "trash")
      ) {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
      return undo;
    },
    [applyTracked, undoTracked, filterRef, subtaskToggle, setTodoReferences, recordTodoReference, notify, t],
  );

  const updateSubtaskText = useCallback(
    (id: string, subId: string, text: string) => {
      applyTracked((prev) => subtaskUpdateText(prev, id, subId, text));
    },
    [applyTracked, subtaskUpdateText],
  );

  const updateSubtaskPriority = useCallback(
    (id: string, subId: string, priority: Priority) => {
      applyTracked((prev) => subtaskUpdatePriority(prev, id, subId, priority));
    },
    [applyTracked, subtaskUpdatePriority],
  );

  const updateSubtaskDueDate = useCallback(
    (id: string, subId: string, dueDate: string) => {
      applyTracked((prev) => subtaskUpdateDueDate(prev, id, subId, dueDate));
    },
    [applyTracked, subtaskUpdateDueDate],
  );

  const removeSubtask = useCallback(
    (id: string, subId: string) => {
      const change = applyTracked((prev) => subtaskRemove(prev, id, subId));
      return change ? () => undoTracked(change) : null;
    },
    [applyTracked, undoTracked, subtaskRemove],
  );

  const clearSubtasks = useCallback(
    (id: string) => {
      applyTracked((prev) => subtaskClearAll(prev, id));
    },
    [applyTracked, subtaskClearAll],
  );

  // ---- Non-stable mutations ----

  const addTaskWithUndo = useCallback(
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
      // R1 — pre-expand the recurring series so the user immediately sees
      // their daily/weekly/monthly/yearly window populated (head + tail).
      // Expanded ONCE, outside the transform, so a re-run on a fresher list
      // prepends the very same rows (same ids).
      const rows = recurrence ? expandSeries(seed, todayLocal()) : [seed];
      const change = applyTracked((prev) => [...rows, ...prev]);
      // Exact: removes just the rows this add created (every occurrence of a
      // new series), keeping anything changed since.
      const undo: Undo = () => {
        if (change) undoTracked(change);
      };
      return { id: seed.id, undo };
    },
    [setTodoReferences, newTodo, applyTracked, undoTracked, recordTodoReference, expandSeries],
  );
  const addTask = useCallback(
    (...args: Parameters<typeof addTaskWithUndo>) => addTaskWithUndo(...args).id,
    [addTaskWithUndo],
  );

  // A series occurrence changes the SERIES rule (Mochi, details "this
  // only"): the same path as the series Save — this row takes the new rule
  // and the future open siblings are rebuilt from it, keeping detached ones.
  // Setting it on one row alone left the series repeating the old rule.
  // A one-off becomes a new series and its window is filled right away.
  const updateRecurrence = useCallback(
    (id: string, recurrence: Recurrence | undefined) => {
      const today = todayLocal();
      const change = applyTracked((prev) => {
        if (prev.find((td) => td.id === id)?.seriesId) {
          return todoApplyRecurrenceChange(prev, id, recurrence, today, { keepDetached: true }).next;
        }
        const next = todoSetRecurrence(prev, id, recurrence);
        const sid = recurrence ? next.find((td) => td.id === id)?.seriesId : undefined;
        return sid ? topUpSeries(next, sid, today) : next;
      });
      return change ? () => undoTracked(change) : null;
    },
    [applyTracked, undoTracked, todoApplyRecurrenceChange, todoSetRecurrence, topUpSeries],
  );

  const emptyTrash = useCallback(() => {
    const n = todosRef.current.filter((td) => td.trashed).length;
    if (n === 0) return;
    Alert.alert(t.emptyTrash, t.emptyTrashConfirm(n), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.emptyTrash,
        style: "destructive",
        onPress: () => { applyTracked(todoEmptyTrash); },
      },
    ]);
  }, [applyTracked, t, todoEmptyTrash]);

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
    applyTracked((prev) => applyBulkRestore(prev, selectedTrashIds));
    clearTrashSelection();
  }, [selectedTrashIds, applyTracked, clearTrashSelection, applyBulkRestore]);

  const bulkPermanentDelete = useCallback(() => {
    const ids = selectedTrashIds;
    if (ids.size === 0) return;
    Alert.alert(t.bulkDeletePermanently, t.bulkDeleteConfirm(ids.size), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.bulkDeletePermanently,
        style: "destructive",
        onPress: () => {
          applyTracked((prev) => applyBulkDelete(prev, ids));
          clearTrashSelection();
        },
      },
    ]);
  }, [selectedTrashIds, t, applyTracked, clearTrashSelection, applyBulkDelete]);

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
          applyTracked((prev) => todoClearDone(prev).todos);
        },
      },
    ]);
  }, [applyTracked, t, todoClearDone]);

  return {
    todos,
    setTodos,
    todosLoaded,
    todosTrusted,
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
    addTaskWithUndo,
    applyTracked,
    undoTracked,
    emptyTrash,
    clearTrashSelection,
    bulkRestore,
    bulkPermanentDelete,
    clearDone,
  };
}
