// PR 4 of the useTodoStore split — see docs/USETODOSTORE-SPLIT-PLAN.md.
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
import { Profile } from "../../core-bindings/profile";
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
import { Analytics } from "../../adapters/analytics";
import { unwrap, serializeAny } from "../../storage/envelope";

const parseTodos = (raw: string | null): Todo[] => migrateTodos(unwrap(raw));
const parseTodoReferences = (raw: string | null): TodoReference[] =>
  migrateTodoReferences(unwrap(raw));

export interface TodosSliceDeps {
  onSaved?: (ts: number) => void;
  /** Live profile state. */
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  profileRef: MutableRefObject<Profile>;
  profileLoaded: boolean;
  /** Current filter + ref. The selectedTrashIds auto-clear effect
   * watches `filter`; some snackbar logic reads `filterRef.current`
   * inside stable callbacks. */
  filter: Filter;
  filterRef: MutableRefObject<Filter>;
  /** uid — passed through for the post-hydrate migration/top-up effect. */
  uid: string | null;
  t: {
    movedToTrash: string;
    movedToTrashMany: (n: number) => string;
    skippedSnackbar: string;
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

export interface TodosSlice {
  // Persisted state
  todos: Todo[];
  setTodos: Dispatch<SetStateAction<Todo[]>>;
  todosLoaded: boolean;
  todoReferences: TodoReference[];
  setTodoReferences: Dispatch<SetStateAction<TodoReference[]>>;
  // Session state
  selectedTrashIds: Set<string>;
  // Refs (exposed so the composer's deleteCategory cross-slice work
  // can read the latest todos without a fresh prop).
  todosRef: MutableRefObject<Todo[]>;
  // TaskItem-stable callbacks
  toggle: (id: string) => void;
  moveToTrash: (id: string) => void;
  /** R5 — Skip. Marks status='notDo' and routes to the Done bin
   * without flipping done. Series instances also get a fresh tail
   * appended. */
  skipTodo: (id: string) => void;
  skipSeriesFuture: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  permanentlyDelete: (id: string) => void;
  permanentlyDeleteSeriesFuture: (id: string) => void;
  updatePriority: (id: string, priority: Priority) => void;
  updateDueDate: (id: string, dueDate: string) => void;
  updateReminder: (id: string, reminder: Todo["reminder"] | undefined) => void;
  /** Multi-reminder write — replaces the entire `reminders[]` on a
   * todo. Pass `[]` to clear. Also drops the legacy `reminder` field
   * so the row converges on the new schema. */
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
  moveSeriesFutureToTrash: (id: string) => void;
  // Subtasks
  addSubtask: (
    id: string,
    text: string,
    priority?: Priority,
    dueDate?: string,
  ) => void;
  toggleSubtask: (id: string, subId: string) => void;
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
      reminder?: Todo["reminder"]; // legacy
      reminders?: Reminder[]; // multi-reminder (preferred)
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
    onSaved,
    profile,
    setProfile,
    profileRef,
    profileLoaded,
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
    migrateToRecurringV2,
    topUpAllSeries,
    todoSkip,
    todoSkipSeriesFuture,
    todoDetachFromSeries,
    todoApplyRecurrenceChange,
    todoApplySeriesSubtasks,
    expandSeries,
    todoSetReminders,
    todoSetRecurrence,
    selectOverdue,
    setDueDates,
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
    onSaved,
  );
  const [todoReferences, setTodoReferences] = useSyncedState<TodoReference[]>(
    adapter,
    "todoReferences",
    [],
    parseTodoReferences,
    serializeAny,
    onSaved,
  );
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(
    new Set(),
  );

  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // R2 recurring-redesign migration + horizon top-up. Runs once per
  // uid swap, after both profile and todos have loaded. The ref
  // guard prevents re-entry within a session even though the effect
  // would otherwise re-fire when profile.recurringV2 flips true.
  //
  // Top-up always runs (even on second-launch where migration is a
  // no-op) so a long-idle device extends its series tails to today's
  // window before the user sees the list.
  const recurringV2ForUidRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!profileLoaded || !todosLoaded) return;
    const k = uid ?? "(local)";
    if (recurringV2ForUidRef.current === k) return;
    recurringV2ForUidRef.current = k;

    const today = todayLocal();
    let working = todosRef.current;
    let mutated = false;

    if (!profile.recurringV2) {
      const mig = migrateToRecurringV2(working, today);
      if (mig.changed) {
        working = mig.todos;
        mutated = true;
      }
      // Mark the migration done even when no recurring todos were
      // found — there's nothing to re-do next launch either way.
      setProfile((p) => ({ ...p, recurringV2: true }));
    }

    const tu = topUpAllSeries(working, today);
    if (tu.changed) {
      working = tu.todos;
      mutated = true;
    }

    if (mutated) setTodos(working);
  }, [
    profileLoaded,
    todosLoaded,
    uid,
    profile.recurringV2,
    setProfile,
    setTodos,
  ]);

  // Auto-clear trash selection when leaving trash view.
  useEffect(() => {
    if (filter !== "trash" && selectedTrashIds.size > 0) {
      setSelectedTrashIds(new Set());
    }
  }, [filter, selectedTrashIds.size]);

  const toggle = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      setTodos((prev) => todoToggle(prev, id));
      if (!beforeTodo) return;
      const { after, referenceRow } = toggleOutcome(beforeTodo);
      if (referenceRow) {
        setTodoReferences((prev) => recordTodoReference(prev, referenceRow));
      }
      if (
        beforeTodo.done &&
        !after.done &&
        (filterRef.current === "done" || filterRef.current === "trash")
      ) {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
    },
    [setTodos, setTodoReferences, notify, filterRef],
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
    [setTodos, notify, filterRef],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      setTodos((prev) => todoMoveToTrash(prev, id));
      notify.showSnackbar({
        message: t.movedToTrash,
        actionLabel: t.undo,
        onAction: () => restoreFromTrash(id),
        mergeKey: "trash",
        mergedMessage: (n: number) => t.movedToTrashMany(n),
        mergedActionLabel: t.undoAll,
      });
    },
    [setTodos, notify, t, restoreFromTrash],
  );

  // R5 — Skip ("Not Do"). Sends the row to the Done
  // bin with status='notDo' so the bin renderer can distinguish it
  // from completed/trashed rows. For series instances, the core
  // helper also appends a fresh tail.
  const skipTodo = useCallback(
    (id: string) => {
      setTodos((prev) => todoSkip(prev, id));
      notify.showSnackbar({
        message: t.skippedSnackbar,
        actionLabel: t.undo,
        onAction: () => restoreFromTrash(id),
      });
    },
    [setTodos, notify, t, restoreFromTrash],
  );

  // "Skip all" — skip this occurrence + every future sibling in the
  // series. Ends the series (no fresh tail). Undo restores via the
  // series-restore path is out of scope here; a plain snackbar nudge.
  const skipSeriesFuture = useCallback(
    (id: string) => {
      setTodos((prev) => todoSkipSeriesFuture(prev, id).next);
    },
    [setTodos],
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
      let affected = 0;
      setTodos((prev) => {
        const result = todoApplySeriesFutureEdits(prev, id, fields, {
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
    [setTodos, notify, t],
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
    [setTodos],
  );

  // R6c — propagate the target's current subtasks shape (live edits
  // have already landed on this row) to every future non-trashed
  // sibling, modulo keepDetached. Cloned fresh per-instance so each
  // copy is independently togglable.
  const applySeriesSubtasks = useCallback(
    (id: string, options: { keepDetached: boolean }) => {
      let affected = 0;
      setTodos((prev) => {
        const result = todoApplySeriesSubtasks(prev, id, options);
        affected = result.affected;
        return result.next;
      });
      notify.showSnackbar({
        message: t.series.subtasksApplied(affected),
      });
    },
    [setTodos, notify, t],
  );

  // R6b — frequency-change apply for a series. Writes the new
  // recurrence, trashes future siblings (honoring keepDetached),
  // and re-expands a fresh tail. Composes the diff inside one
  // setTodos so cross-device sync sees a single mutation event.
  const applyRecurrenceChange = useCallback(
    (
      id: string,
      newRecurrence: Recurrence | undefined,
      options: { keepDetached: boolean },
    ) => {
      const today = todayLocal();
      let trashedCount = 0;
      setTodos((prev) => {
        const result = todoApplyRecurrenceChange(prev, id, newRecurrence, today, {
          keepDetached: options.keepDetached,
        });
        trashedCount = result.trashedCount;
        return result.next;
      });
      notify.showSnackbar({
        message: t.series.recurrenceRecreated(trashedCount),
      });
    },
    [setTodos, notify, t],
  );

  const moveSeriesFutureToTrash = useCallback(
    (id: string) => {
      let affected = 0;
      setTodos((prev) => {
        const result = todoMoveToTrashFutureSeries(prev, id);
        affected = result.affected;
        return result.next;
      });
      notify.showSnackbar({
        message:
          affected > 1 ? t.series.trashedMany(affected) : t.movedToTrash,
      });
    },
    [setTodos, notify, t],
  );

  const permanentlyDelete = useCallback(
    (id: string) => {
      setTodos((prev) => todoPermanentlyDelete(prev, id));
    },
    [setTodos],
  );

  // "Delete series" — hard-remove this + all future siblings.
  const permanentlyDeleteSeriesFuture = useCallback(
    (id: string) => {
      setTodos((prev) => todoPermanentlyDeleteSeriesFuture(prev, id));
    },
    [setTodos],
  );

  const updatePriority = useCallback(
    (id: string, priority: Priority) => {
      setTodos((prev) => todoSet(prev, id, "priority", priority));
    },
    [setTodos],
  );

  const updateDueDate = useCallback(
    (id: string, dueDate: string) => {
      setTodos((prev) => todoSet(prev, id, "dueDate", dueDate));
    },
    [setTodos],
  );

  const updateReminder = useCallback(
    (id: string, reminder: Todo["reminder"] | undefined) => {
      setTodos((prev) => todoSet(prev, id, "reminder", reminder));
    },
    [setTodos],
  );

  // Multi-reminder write. Writes the array on the row, drops the
  // legacy `reminder` field. Empty input clears both. The scheduler
  // diffs and reconciles via the existing syncTodoReminders effect.
  const updateReminders = useCallback(
    (id: string, reminders: Reminder[]) => {
      setTodos((prev) => todoSetReminders(prev, id, reminders));
    },
    [setTodos],
  );

  const deferOverdue = useCallback(
    (daysFromToday: number) => {
      const newDate = addDaysISO(daysFromToday);
      const overdue = selectOverdue(todosRef.current, todayLocal());
      if (overdue.length === 0) return;
      const originals = new Map(overdue.map((td) => [td.id, td.dueDate]));
      const reschedule = new Map(overdue.map((td) => [td.id, newDate]));
      setTodos((prev) => setDueDates(prev, reschedule));
      notify.showSnackbar({
        message: t.defer.done(overdue.length),
        actionLabel: t.undoAll,
        onAction: () => setTodos((prev) => setDueDates(prev, originals)),
      });
    },
    [setTodos, notify, t],
  );

  const bulkDeferTodos = useCallback(
    (ids: string[], targetISO: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetISO)) return;
      const want = new Set(ids);
      const candidates = todosRef.current.filter(
        (td) => want.has(td.id) && !td.trashed && !td.done,
      );
      if (candidates.length === 0) return;
      const originals = new Map(candidates.map((td) => [td.id, td.dueDate]));
      const reschedule = new Map(candidates.map((td) => [td.id, targetISO]));
      setTodos((prev) => setDueDates(prev, reschedule));
      notify.showSnackbar({
        message:
          candidates.length === 1
            ? "1 to-do deferred."
            : `${candidates.length} to-dos deferred.`,
        actionLabel: t.undoAll,
        onAction: () => setTodos((prev) => setDueDates(prev, originals)),
      });
    },
    [setTodos, notify, t],
  );

  const snooze = useCallback(
    (id: string, daysFromToday: number) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      if (!beforeTodo) return;
      const originalDate = beforeTodo.dueDate;
      const newDate = addDaysISO(daysFromToday);
      setTodos((prev) => todoSet(prev, id, "dueDate", newDate));
      const label =
        daysFromToday === 1
          ? t.snooze.toTomorrow
          : daysFromToday === 7
            ? t.snooze.toNextWeek
            : t.snooze.toDays(daysFromToday);
      notify.showSnackbar({
        message: label,
        actionLabel: t.undo,
        onAction: () => {
          setTodos((prev) => todoSet(prev, id, "dueDate", originalDate));
        },
      });
    },
    [setTodos, notify, t],
  );

  const updateTaskCategory = useCallback(
    (id: string, category: Category) => {
      setTodos((prev) => todoSet(prev, id, "category", category));
    },
    [setTodos],
  );

  const updateText = useCallback(
    (id: string, text: string) => {
      setTodos((prev) => todoSet(prev, id, "text", text));
    },
    [setTodos],
  );

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      setTodos((prev) => todoSet(prev, id, "notes", notes));
    },
    [setTodos],
  );

  const addSubtask = useCallback(
    (id: string, text: string, priority?: Priority, dueDate?: string) => {
      setTodos((prev) => subtaskAdd(prev, id, text, priority, dueDate));
    },
    [setTodos],
  );

  const toggleSubtask = useCallback(
    (id: string, subId: string) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      const beforeSub = beforeTodo?.subtasks?.find((s) => s.id === subId);
      setTodos((prev) => subtaskToggle(prev, id, subId));
      if (
        beforeTodo?.done &&
        beforeSub?.done &&
        (filterRef.current === "done" || filterRef.current === "trash")
      ) {
        notify.showSnackbar({ message: "Moved back to your open list." });
      }
    },
    [setTodos, notify, filterRef],
  );

  const updateSubtaskText = useCallback(
    (id: string, subId: string, text: string) => {
      setTodos((prev) => subtaskUpdateText(prev, id, subId, text));
    },
    [setTodos],
  );

  const updateSubtaskPriority = useCallback(
    (id: string, subId: string, priority: Priority) => {
      setTodos((prev) => subtaskUpdatePriority(prev, id, subId, priority));
    },
    [setTodos],
  );

  const updateSubtaskDueDate = useCallback(
    (id: string, subId: string, dueDate: string) => {
      setTodos((prev) => subtaskUpdateDueDate(prev, id, subId, dueDate));
    },
    [setTodos],
  );

  const removeSubtask = useCallback(
    (id: string, subId: string) => {
      setTodos((prev) => subtaskRemove(prev, id, subId));
    },
    [setTodos],
  );

  const clearSubtasks = useCallback(
    (id: string) => {
      setTodos((prev) => subtaskClearAll(prev, id));
    },
    [setTodos],
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
        reminder?: Todo["reminder"]; // legacy single-reminder support
        reminders?: Reminder[]; // multi-reminder (preferred)
      },
    ) => {
      const notes = extras?.notes;
      const subtasks = extras?.subtasks;
      const reminder = extras?.reminder;
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
        // Prefer the new multi-reminder array when supplied; the
        // legacy `reminder` input stays for any caller that hasn't
        // migrated yet.
        reminder,
      });
      // Attach reminders[] post-newTodo (newTodo's input shape
      // doesn't have the array yet — keep it narrow).
      if (reminders && reminders.length > 0) {
        seed.reminders = reminders;
        // If both inputs were given, the array wins; drop the
        // legacy field so the persisted doc converges on the new schema.
        delete seed.reminder;
      }
      setTodos((prev) => {
        if (prev.length === 0) void Analytics.firstTodoCreated();
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
    [setTodos, setTodoReferences],
  );

  const updateRecurrence = useCallback(
    (id: string, recurrence: Recurrence | undefined) => {
      setTodos((prev) => todoSetRecurrence(prev, id, recurrence));
    },
    [setTodos],
  );

  const emptyTrash = useCallback(() => {
    if (todosRef.current.filter((td) => td.trashed).length === 0) return;
    Alert.alert(t.emptyTrash, t.deletePermanentlyConfirm(t.filters.trash), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.emptyTrash,
        style: "destructive",
        onPress: () => setTodos(todoEmptyTrash),
      },
    ]);
  }, [setTodos, t]);

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
  }, []);

  const clearTrashSelection = useCallback(() => {
    setSelectedTrashIds(new Set());
  }, []);

  const bulkRestore = useCallback(() => {
    if (selectedTrashIds.size === 0) return;
    setTodos((prev) => applyBulkRestore(prev, selectedTrashIds));
    clearTrashSelection();
  }, [selectedTrashIds, setTodos, clearTrashSelection]);

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
  }, [selectedTrashIds, setTodos, t, clearTrashSelection]);

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
  }, [setTodos, t]);

  // Quiet down the linter for refs we expose but never read in the
  // slice body itself (the composer reads them through the return).
  void profileRef;

  return {
    todos,
    setTodos,
    todosLoaded,
    todoReferences,
    setTodoReferences,
    selectedTrashIds,
    todosRef,
    toggle,
    moveToTrash,
    skipTodo,
    skipSeriesFuture,
    restoreFromTrash,
    permanentlyDelete,
    permanentlyDeleteSeriesFuture,
    updatePriority,
    updateDueDate,
    updateReminder,
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
