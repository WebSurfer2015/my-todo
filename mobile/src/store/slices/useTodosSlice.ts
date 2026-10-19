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
import { alertWithPresence } from "../../app/modalPresence";
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
import { TodoStoreActions, mergeTodos, mergeTodoReferences } from "../../../../core/src/store";
import { weekdayDate } from "../../../../core/src/logic/labels";
import {
  todayLocal,
  addDaysISO,
  dueDateToDate,
  dueDateWithDay,
} from "../../../../core/src/logic/utils";
import { useSyncedState } from "../useSyncedState";
import { StorageAdapter } from "../../../../core/src/ports/persistence";
import { unwrapEnvelope, wrapEnvelope } from "../../../../core/src/ports/persistence";
import { PARTIAL_UNDO_MESSAGE, type UndoOutcome } from "../undo";

const parseTodos = (raw: string | null): Todo[] => migrateTodos(unwrapEnvelope(raw));
const parseTodoReferences = (raw: string | null): TodoReference[] =>
  migrateTodoReferences(unwrapEnvelope(raw));

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
    changesSaved: string;
    series: {
      trashedMany: (n: number) => string;
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
    /** Drop a snackbar whose action was taken elsewhere (an inline Undo). */
    retractSnackbar?: (onAction: () => void) => void;
  };
  /** The createTodoStore pure-transform surface. */
  actions: TodoStoreActions;
}

// The single source of the Undo outcome type + partial copy (store/undo);
// re-exported for existing importers.
export type { UndoOutcome };
export { PARTIAL_UNDO_MESSAGE };

/** Reverses exactly what an action did (see applyTracked). */
export type Undo = () => UndoOutcome;

/** `silent`: apply without the store's snackbar (Ask Mochi shows its own
 * inline, turn-stamped Undo). */
export type SilentOpt = { silent?: boolean };

/** What closing details in "Edit series" mode commits (commitSeriesEdits). */
export interface SeriesCommit {
  /** Changed fields: written to this row, then to future siblings. */
  fields: {
    text?: string;
    priority?: Priority;
    /** null clears it (this row and the future siblings). */
    category?: Category | null;
    notes?: string;
  };
  /** R6b — a new repeat rule: replaces the future tail (modulo keepDetached). */
  recurrence?: { value: Recurrence | undefined; keepDetached: boolean };
  /** R6c — copy this row's steps shape to future siblings. */
  subtasks?: { keepDetached: boolean };
  /** Per-occurrence edits made in "Edit series" mode (the date and the
   * reminders belong to THIS date only) — folded into the same change, so
   * the commit's one Undo takes them back too. */
  thisRow?: { dueDate?: string; reminders?: Reminder[] };
}

/** Defer snackbar: what moved, plus — when a repeating series had several
 * missed occurrences — how many older ones were tucked into Done instead of
 * piling onto one day (core todoDeferTo's `skipped`). English-only launch. */
/** Snackbar after a series' repeat rule changed from details. English-only
 * launch (v2 store copy). */
export function recurrenceChangedMessage(replaced: number): string {
  if (replaced <= 0) return "Repeat updated";
  return `Repeat updated · ${replaced} upcoming ${replaced === 1 ? "to-do" : "to-dos"} replaced`;
}

/** A to-do reopened from the Done view leaves it — say where it went. */
export const MOVED_BACK_MESSAGE = "Moved back to your open list.";
/** A to-do reopened anywhere else (Today, a list, details). */
export const REOPENED_MESSAGE = "Reopened";

/** Reopen snackbar copy for the current view. */
function reopenedMessage(filter: Filter): string {
  return filter === "done" || filter === "trash" ? MOVED_BACK_MESSAGE : REOPENED_MESSAGE;
}

const upcoming = (n: number) => `${n} upcoming ${n === 1 ? "to-do" : "to-dos"}`;

/** Snackbar after closing details in "Edit series" mode (one Undo for the
 * whole commit). English-only launch (v2 store copy). */
export function seriesCommitMessage(
  r: { kind: "rule"; replaced: number } | { kind: "steps" | "fields"; affected: number },
): string {
  if (r.kind === "rule") return recurrenceChangedMessage(r.replaced);
  if (r.affected <= 0) return "Changes saved";
  return r.kind === "steps" ? `Steps applied to ${upcoming(r.affected)}` : `Applied to ${upcoming(r.affected)}`;
}

/** Defer snackbar for to-dos moved to one day: a single one names the day
 * ("Deferred to Wed, Oct 21"). English-only launch. */
export function deferredMessage(deferred: number, targetISO: string): string {
  if (deferred !== 1) return `${deferred} to-dos deferred.`;
  if (isNaN(dueDateToDate(targetISO).getTime())) return "1 to-do deferred.";
  return `Deferred to ${weekdayDate(targetISO)}`;
}

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
  // The returned Undo also retracts the action's own snackbar (an inline
  // Undo must not leave a second live Undo behind). `silent`: no snackbar —
  // Ask Mochi shows its own inline Undo (only the newest turn's is live).
  toggle: (id: string, opts?: SilentOpt) => Undo | null;
  moveToTrash: (id: string, opts?: SilentOpt) => Undo | null;
  /** R5 — Skip. Marks status='notDo' and routes to the Done bin
   * without flipping done. Series instances also get a fresh tail
   * appended. */
  skipTodo: (id: string, opts?: SilentOpt) => Undo | null;
  skipSeriesFuture: (id: string, opts?: SilentOpt) => Undo | null;
  /** Reopen from Done; in the Done view it says so, with an exact Undo
   * (`silent`: no snackbar). */
  restoreFromTrash: (id: string, opts?: SilentOpt) => void;
  permanentlyDelete: (id: string) => void;
  permanentlyDeleteSeriesFuture: (id: string) => void;
  /** Hard-remove EVERY row of a series, any date or state (the Undo of a
   * just-captured repeating to-do). Returns whether anything was removed. */
  permanentlyDeleteSeries: (seriesId: string) => boolean;
  /** Move a series' start: this row takes `dueDate` and the series is
   * re-expanded from it under the same rule (a just-captured repeating
   * to-do's date chip). A one-off just moves. */
  rescheduleSeriesFrom: (id: string, dueDate: string, opts?: SilentOpt) => Undo | null;
  updatePriority: (id: string, priority: Priority) => void;
  updateDueDate: (id: string, dueDate: string) => void;
  /** Replaces the entire `reminders[]` on a todo. Pass `[]` to clear. */
  updateReminders: (id: string, reminders: Reminder[]) => void;
  /** `undefined` clears it (no category). */
  updateTaskCategory: (id: string, category: Category | undefined) => void;
  updateText: (id: string, text: string) => void;
  updateNotes: (id: string, notes: string) => void;
  /** Series occurrence → the series-wide rule change (keepDetached).
   * `fromDue`: the row's original date when the same edit just moved it —
   * the "this and future" cutoff. */
  updateRecurrence: (
    id: string,
    recurrence: Recurrence | undefined,
    opts?: { fromDue?: string } & SilentOpt,
  ) => Undo | null;
  toggleTrashSelection: (id: string) => void;
  // Series ops
  /** Closing details in "Edit series" mode: write the buffered fields to
   * this row, propagate them to future siblings, then (optionally) the
   * series' new repeat rule (R6b) or its steps shape (R6c) — as ONE tracked
   * change with ONE snackbar Undo. Returns that Undo (null = no change). */
  commitSeriesEdits: (id: string, edits: SeriesCommit, opts?: SilentOpt) => Undo | null;
  /** R6a — Mark this series instance as detached so later series-wide
   * edits skip it by default. No-op when already detached or when
   * the row has no seriesId. */
  detachFromSeries: (id: string) => void;
  moveSeriesFutureToTrash: (id: string, opts?: SilentOpt) => Undo | null;
  // Subtasks
  addSubtask: (
    id: string,
    text: string,
    priority?: Priority,
    dueDate?: string,
    opts?: SilentOpt,
  ) => Undo | null;
  toggleSubtask: (id: string, subId: string, opts?: SilentOpt) => Undo | null;
  /** Put a to-do back exactly as `snapshot` (the edit/completion Undo).
   * Returns whether it changed anything. */
  revertTodo: (snapshot: Todo) => boolean;
  updateSubtaskText: (id: string, subId: string, text: string) => void;
  updateSubtaskPriority: (id: string, subId: string, priority: Priority) => void;
  updateSubtaskDueDate: (id: string, subId: string, dueDate: string) => void;
  removeSubtask: (id: string, subId: string, opts?: SilentOpt) => Undo | null;
  clearSubtasks: (id: string) => void;
  // Defer / snooze
  deferOverdue: (daysFromToday: number) => void;
  bulkDeferTodos: (ids: string[], targetISO: string, opts?: SilentOpt) => Undo | null;
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
   * created — the whole new series for a repeating to-do — and the title it
   * added to the suggestion history). Its Undo is silent (no partial-Undo
   * snackbar): its callers (Ask Mochi) show the outcome inline. */
  addTaskWithUndo: (...args: Parameters<TodosSlice["addTask"]>) => { id: string; undo: Undo };
  /** Run a pure transform through the tracked setter (exact Undo source). */
  applyTracked: (fn: (ts: Todo[]) => Todo[]) => { before: Todo[]; after: Todo[] } | null;
  /** Revert a tracked change (see UndoOutcome). A partial revert (rows
   * edited since are kept) says so in a calm snackbar unless `silent` (Ask
   * Mochi shows it inline from the "partial" outcome). */
  undoTracked: (c: { before: Todo[]; after: Todo[] }, opts?: SilentOpt) => UndoOutcome;
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
    todosRevertChangesWithReport,
    todoMoveToTrash,
    todoMoveToTrashFutureSeries,
    todoApplySeriesFutureEdits,
    todoRestoreFromTrash,
    todoPermanentlyDelete,
    todoPermanentlyDeleteSeriesFuture,
    todoPermanentlyDeleteSeries,
    todoEmptyTrash,
    todoClearDone,
    todoSet,
    recordTodoReference,
    forgetTodoReferences,
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
    useSyncedState<Todo[]>(adapter, "todos", [], parseTodos, wrapEnvelope, {
      merge: mergeTodos,
    });
  const [todoReferences, setTodoReferences] = useSyncedState<TodoReference[]>(
    adapter,
    "todoReferences",
    [],
    parseTodoReferences,
    wrapEnvelope,
    // One doc: merge (union by text, newest use wins) so two devices'
    // histories don't overwrite each other.
    { merge: mergeTodoReferences },
  );
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(
    new Set(),
  );

  // Latest suggestion history (read by addTaskWithUndo's Undo).
  const todoReferencesRef = useRef(todoReferences);
  useEffect(() => {
    todoReferencesRef.current = todoReferences;
  }, [todoReferences]);

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
    (c: { before: Todo[]; after: Todo[] }, opts?: SilentOpt): UndoOutcome => {
      let skipped = 0;
      const reverted = applyTracked((prev) => {
        const r = todosRevertChangesWithReport(prev, c.before, c.after);
        skipped = r.skipped;
        return r.todos;
      });
      // Part of it was edited since and kept: say so, calmly (no Undo) — or
      // let a silent caller say it inline.
      if (reverted === null) return false;
      if (skipped > 0 && !opts?.silent) notify.showSnackbar({ message: PARTIAL_UNDO_MESSAGE });
      return skipped > 0 ? "partial" : true;
    },
    [applyTracked, todosRevertChangesWithReport, notify],
  );
  // A PERMANENT delete also forgets the deleted titles from the suggestion
  // history (unless another to-do still carries the same text) — deleting a
  // to-do for good shouldn't leave its title stored forever.
  const forgetRemoved = useCallback(
    (before: Todo[], after: Todo[]) => {
      const kept = new Set(after.map((td) => td.id));
      const removed = before.filter((td) => !kept.has(td.id));
      if (removed.length === 0) return;
      setTodoReferences((prev) => forgetTodoReferences(prev, removed, after));
    },
    [setTodoReferences, forgetTodoReferences],
  );
  const applyHardDelete = useCallback(
    (fn: (ts: Todo[]) => Todo[]) => {
      const change = applyTracked(fn);
      if (change) forgetRemoved(change.before, change.after);
      return change;
    },
    [applyTracked, forgetRemoved],
  );
  // Show an Undo snackbar for `undo` (unless silent) and hand back the Undo
  // the caller renders inline: running it also retracts that snackbar, so
  // the same change never has two live Undos (and a merged "2 completed"
  // can't swallow a re-completion of something already undone).
  const withUndoSnackbar = useCallback(
    (
      undo: Undo,
      snack: { message: string; mergeKey?: string; mergedMessage?: (n: number) => string; mergedActionLabel?: string },
      opts?: SilentOpt,
    ): Undo => {
      if (opts?.silent) return undo;
      notify.showSnackbar({ ...snack, actionLabel: t.undo, onAction: undo });
      return (): UndoOutcome => {
        notify.retractSnackbar?.(undo);
        return undo();
      };
    },
    [notify, t.undo],
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
    (id: string, opts?: SilentOpt) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      // Undo reverses EXACTLY what this toggle did — a series completion
      // also appends the next occurrence and moves reminders.
      const change = applyTracked((ts) => todoToggle(ts, id, todayLocal()));
      if (!beforeTodo || !change) return null;
      const undo: Undo = () => undoTracked(change, opts);
      const { after, referenceRow } = toggleOutcome(beforeTodo);
      if (referenceRow) {
        setTodoReferences((prev) => recordTodoReference(prev, referenceRow));
      }
      if (!beforeTodo.done && after.done) {
        // Every completion is undoable. Undo restores the exact snapshot
        // (incl. per-step state), not a toggle-back. Several completions in
        // a row merge into one "N done · Undo all".
        const text = beforeTodo.text.length > 40 ? `${beforeTodo.text.slice(0, 39)}…` : beforeTodo.text;
        return withUndoSnackbar(
          undo,
          {
            message: t.completedSnackbar(text),
            mergeKey: "done",
            mergedMessage: (n: number) => t.completedSnackbarMany(n),
            mergedActionLabel: t.undoAll,
          },
          opts,
        );
      }
      if (beforeTodo.done && !after.done) {
        // Reopened: from Done it leaves this list, so say where it went;
        // anywhere else just "Reopened" — both with the same exact Undo
        // (silent callers get just the Undo).
        return withUndoSnackbar(undo, { message: reopenedMessage(filterRef.current) }, opts);
      }
      return undo;
    },
    [applyTracked, undoTracked, withUndoSnackbar, toggleOutcome, filterRef, todoToggle, setTodoReferences, recordTodoReference, t],
  );

  const revertTodo = useCallback(
    (snapshot: Todo) => applyTracked((prev) => todoRevert(prev, snapshot)) !== null,
    [applyTracked, todoRevert],
  );

  const restoreFromTrash = useCallback(
    (id: string, opts?: SilentOpt) => {
      const change = applyTracked((prev) => todoRestoreFromTrash(prev, id));
      if (!change) return;
      withUndoSnackbar(() => undoTracked(change, opts), { message: reopenedMessage(filterRef.current) }, opts);
    },
    [applyTracked, undoTracked, withUndoSnackbar, filterRef, todoRestoreFromTrash],
  );

  const moveToTrash = useCallback(
    (id: string, opts?: SilentOpt) => {
      const change = applyTracked((ts) => todoMoveToTrash(ts, id));
      if (!change) return null;
      // Exact: restoreFromTrash reopened every step (2/5 came back 0/5).
      return withUndoSnackbar(
        () => undoTracked(change, opts),
        {
          message: t.movedToTrash,
          mergeKey: "trash",
          mergedMessage: (n: number) => t.movedToTrashMany(n),
          mergedActionLabel: t.undoAll,
        },
        opts,
      );
    },
    [applyTracked, undoTracked, withUndoSnackbar, t, todoMoveToTrash],
  );

  // R5 — Skip ("Not Do"). Sends the row to the Done
  // bin with status='notDo' so the bin renderer can distinguish it
  // from completed/trashed rows. For series instances, the core
  // helper also appends a fresh tail.
  const skipTodo = useCallback(
    (id: string, opts?: SilentOpt) => {
      // null = nothing changed (e.g. a to-do with steps can't be skipped) —
      // don't claim "Skipped" for a no-op.
      const change = applyTracked((ts) => todoSkip(ts, id, todayLocal()));
      if (!change) return null;
      // Exact: restoreFromTrash lost the occurrence's reminders and left
      // the appended next occurrence behind.
      return withUndoSnackbar(() => undoTracked(change, opts), { message: t.skippedSnackbar }, opts);
    },
    [applyTracked, undoTracked, withUndoSnackbar, t.skippedSnackbar, todoSkip],
  );

  // "Skip all" — skip this occurrence + every future sibling in the
  // series. Ends the series (no fresh tail).
  const skipSeriesFuture = useCallback(
    (id: string, opts?: SilentOpt) => {
      // Computed from the live list so the count is right and Undo can
      // reverse exactly this (it ended the series silently, with no Undo).
      let affected = 0;
      const change = applyTracked((ts) => {
        const r = todoSkipSeriesFuture(ts, id, todayLocal());
        affected = r.affected;
        return r.next;
      });
      if (!change) return null;
      return withUndoSnackbar(
        () => undoTracked(change, opts),
        { message: affected > 1 ? `Skipped ${affected} to-dos in this series.` : t.skippedSnackbar },
        opts,
      );
    },
    [applyTracked, undoTracked, withUndoSnackbar, t.skippedSnackbar, todoSkipSeriesFuture],
  );

  // Closing details in "Edit series" mode. Every step is a pure transform
  // composed into ONE tracked apply, so the snackbar's Undo reverts the whole
  // commit exactly (row fields, sibling edits, a rebuilt tail or copied
  // steps) while later edits survive. Counts are read from the live list.
  const commitSeriesEdits = useCallback(
    (id: string, edits: SeriesCommit, opts?: SilentOpt) => {
      const { fields, recurrence, subtasks, thisRow } = edits;
      const today = todayLocal();
      let affected = 0;
      let replaced = 0;
      let stepsAffected = 0;
      const change = applyTracked((ts) => {
        let next = ts;
        // "This and future" is measured from where this occurrence WAS: a
        // date moved in the same commit must not skip (moved later) or reach
        // back over (moved earlier) the siblings in between.
        const fromDue = ts.find((td) => td.id === id)?.dueDate;
        // This occurrence's own date / reminders (before a rule change, which
        // expands the new tail from this row).
        if (thisRow?.dueDate !== undefined) next = todoSet(next, id, "dueDate", thisRow.dueDate);
        if (thisRow?.reminders !== undefined) next = todoSetReminders(next, id, thisRow.reminders);
        // This row first (category only when one is set, as a manual pick).
        if (fields.text !== undefined) next = todoSet(next, id, "text", fields.text);
        if (fields.notes !== undefined) next = todoSet(next, id, "notes", fields.notes);
        if (fields.priority !== undefined) next = todoSet(next, id, "priority", fields.priority);
        if (fields.category !== undefined) next = todoSet(next, id, "category", fields.category ?? undefined);
        if (Object.keys(fields).length > 0) {
          const r = todoApplySeriesFutureEdits(next, id, fields, { fromDue });
          affected = r.affected;
          next = r.next;
        }
        if (recurrence) {
          // R6b — the new tail is expanded from this row, which already
          // carries its edited steps, so R6c is redundant here.
          const r = todoApplyRecurrenceChange(next, id, recurrence.value, today, {
            keepDetached: recurrence.keepDetached,
            fromDue,
          });
          replaced = r.trashedCount;
          next = r.next;
        } else if (subtasks) {
          const r = todoApplySeriesSubtasks(next, id, { ...subtasks, fromDue });
          stepsAffected = r.affected;
          next = r.next;
        }
        return next;
      });
      if (!change) return null;
      return withUndoSnackbar(
        () => undoTracked(change, opts),
        {
          message: recurrence
            ? seriesCommitMessage({ kind: "rule", replaced })
            : subtasks
              ? seriesCommitMessage({ kind: "steps", affected: stepsAffected })
              : seriesCommitMessage({ kind: "fields", affected }),
        },
        opts,
      );
    },
    [applyTracked, undoTracked, withUndoSnackbar, todoSet, todoSetReminders, todoApplySeriesFutureEdits, todoApplyRecurrenceChange, todoApplySeriesSubtasks],
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

  const moveSeriesFutureToTrash = useCallback(
    (id: string, opts?: SilentOpt) => {
      // Computed from the live list: the count read inside the updater was
      // often still 0 when the snackbar ran, and there was no Undo.
      let affected = 0;
      const change = applyTracked((ts) => {
        const r = todoMoveToTrashFutureSeries(ts, id);
        affected = r.affected;
        return r.next;
      });
      if (!change) return null;
      return withUndoSnackbar(
        () => undoTracked(change, opts),
        { message: affected > 1 ? t.series.trashedMany(affected) : t.movedToTrash },
        opts,
      );
    },
    [applyTracked, undoTracked, withUndoSnackbar, t.series, t.movedToTrash, todoMoveToTrashFutureSeries],
  );

  const permanentlyDelete = useCallback(
    (id: string) => {
      applyHardDelete((prev) => todoPermanentlyDelete(prev, id));
    },
    [applyHardDelete, todoPermanentlyDelete],
  );

  // "Delete series" — hard-remove this + all future siblings.
  const permanentlyDeleteSeriesFuture = useCallback(
    (id: string) => {
      applyHardDelete((prev) => todoPermanentlyDeleteSeriesFuture(prev, id));
    },
    [applyHardDelete, todoPermanentlyDeleteSeriesFuture],
  );

  const permanentlyDeleteSeries = useCallback(
    (seriesId: string) => applyHardDelete((prev) => todoPermanentlyDeleteSeries(prev, seriesId)) !== null,
    [applyHardDelete, todoPermanentlyDeleteSeries],
  );

  const rescheduleSeriesFrom = useCallback(
    (id: string, dueDate: string, opts?: SilentOpt) => {
      const today = todayLocal();
      const change = applyTracked((prev) => {
        const td = prev.find((x) => x.id === id);
        if (!td) return prev;
        const moved = todoSet(prev, id, "dueDate", dueDate);
        if (moved === prev || !td.seriesId || !td.recurrence) return moved;
        // Same rule, rebuilt from the new date: every occurrence from where
        // the row was is replaced by the new start's tail (the rule
        // re-anchors on the new day).
        // Re-anchored on the new day, with a fresh horizon.
        const rule: Recurrence = { ...td.recurrence };
        delete rule.anchorDay;
        delete rule.materializedThrough;
        return todoApplyRecurrenceChange(moved, id, rule, today, {
          keepDetached: true,
          fromDue: td.dueDate,
          rebuild: true,
        }).next;
      });
      return change ? () => undoTracked(change, opts) : null;
    },
    [applyTracked, undoTracked, todoSet, todoApplyRecurrenceChange],
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
    (ids: string[], targetISO: string, opts?: SilentOpt) => {
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
      const undo: Undo = () => undoTracked(change, opts);
      if (opts?.silent) return undo;
      notify.showSnackbar({
        message: deferSnackbarMessage(deferredMessage(deferred, targetISO), skipped),
        actionLabel: deferred + skipped === 1 ? t.undo : t.undoAll,
        onAction: undo,
      });
      return (): UndoOutcome => {
        notify.retractSnackbar?.(undo);
        return undo();
      };
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
    (id: string, category: Category | undefined) => {
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
    (id: string, text: string, priority?: Priority, dueDate?: string, opts?: SilentOpt) => {
      const change = applyTracked((prev) => subtaskAdd(prev, id, text, priority, dueDate));
      return change ? () => undoTracked(change, opts) : null;
    },
    [applyTracked, undoTracked, subtaskAdd],
  );

  const toggleSubtask = useCallback(
    (id: string, subId: string, opts?: SilentOpt) => {
      const beforeTodo = todosRef.current.find((td) => td.id === id);
      const beforeSub = beforeTodo?.subtasks?.find((s) => s.id === subId);
      // Tracked: finishing the last step completes the to-do (and rolls a
      // series forward), so it gets the same completion snackbar + exact
      // Undo as tapping the circle.
      const change = applyTracked((ts) => subtaskToggle(ts, id, subId, todayLocal()));
      if (!change) return null;
      const undo: Undo = () => undoTracked(change, opts);
      if (!beforeTodo) return undo;
      const afterTodo = change.after.find((td) => td.id === id);
      if (!beforeTodo.done && afterTodo?.done) {
        setTodoReferences((prev) => recordTodoReference(prev, afterTodo));
        const text = beforeTodo.text.length > 40 ? `${beforeTodo.text.slice(0, 39)}…` : beforeTodo.text;
        // Details' inline "✓ Done · Undo" runs the returned Undo, which also
        // retracts this snackbar (it would otherwise merge a re-completion
        // into "2 completed").
        return withUndoSnackbar(
          undo,
          {
            message: t.completedSnackbar(text),
            mergeKey: "done",
            mergedMessage: (n: number) => t.completedSnackbarMany(n),
            mergedActionLabel: t.undoAll,
          },
          opts,
        );
      } else if (beforeTodo.done && beforeSub?.done && !afterTodo?.done) {
        return withUndoSnackbar(undo, { message: reopenedMessage(filterRef.current) }, opts);
      }
      return undo;
    },
    [applyTracked, undoTracked, withUndoSnackbar, filterRef, subtaskToggle, setTodoReferences, recordTodoReference, t],
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
    (id: string, subId: string, opts?: SilentOpt) => {
      const change = applyTracked((prev) => subtaskRemove(prev, id, subId));
      return change ? () => undoTracked(change, opts) : null;
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
      // The history entry this add replaces (same text), put back by Undo.
      const textLower = text.trim().toLowerCase();
      const priorRef = todoReferencesRef.current.find((r) => r.textLower === textLower);
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
      // new series), keeping anything changed since — and the title it put in
      // the suggestion history (its earlier entry, if any, comes back).
      const createdIds = new Set(rows.map((r) => r.id));
      const undo: Undo = () => {
        if (!change) return false;
        const out = undoTracked(change, { silent: true });
        // Nothing reverted because its rows are already gone (a capture Undo
        // hard-deletes them first, which forgot the title): still put the
        // suggestion history back. Rows kept (edited since) keep it as is.
        if (out === false && todosRef.current.some((td) => createdIds.has(td.id))) return false;
        const stillUsed = todosRef.current.some((td) => td.text.trim().toLowerCase() === textLower);
        if (priorRef || !stillUsed) {
          setTodoReferences((prev) => {
            const rest = prev.filter((r) => r.textLower !== textLower);
            return priorRef ? [priorRef, ...rest] : rest.length === prev.length ? prev : rest;
          });
        }
        return out;
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
    (id: string, recurrence: Recurrence | undefined, opts?: { fromDue?: string } & SilentOpt) => {
      const today = todayLocal();
      const change = applyTracked((prev) => {
        if (prev.find((td) => td.id === id)?.seriesId) {
          return todoApplyRecurrenceChange(prev, id, recurrence, today, {
            keepDetached: true,
            fromDue: opts?.fromDue,
          }).next;
        }
        const next = todoSetRecurrence(prev, id, recurrence);
        const sid = recurrence ? next.find((td) => td.id === id)?.seriesId : undefined;
        return sid ? topUpSeries(next, sid, today) : next;
      });
      return change ? () => undoTracked(change, opts) : null;
    },
    [applyTracked, undoTracked, todoApplyRecurrenceChange, todoSetRecurrence, topUpSeries],
  );

  const emptyTrash = useCallback(() => {
    const n = todosRef.current.filter((td) => td.trashed).length;
    if (n === 0) return;
    alertWithPresence(t.emptyTrash, t.emptyTrashConfirm(n), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.emptyTrash,
        style: "destructive",
        onPress: () => { applyHardDelete(todoEmptyTrash); },
      },
    ]);
  }, [applyHardDelete, t, todoEmptyTrash]);

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
    alertWithPresence(t.bulkDeletePermanently, t.bulkDeleteConfirm(ids.size), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.bulkDeletePermanently,
        style: "destructive",
        onPress: () => {
          applyHardDelete((prev) => applyBulkDelete(prev, ids));
          clearTrashSelection();
        },
      },
    ]);
  }, [selectedTrashIds, t, applyHardDelete, clearTrashSelection, applyBulkDelete]);

  const clearDone = useCallback(() => {
    const count = todosRef.current.filter(
      (td) => td.done || td.trashed,
    ).length;
    if (count === 0) return;
    alertWithPresence(t.clearAllCompleted, t.emptyTrashConfirm(count), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.deletePermanently,
        style: "destructive",
        onPress: () => {
          applyHardDelete((prev) => todoClearDone(prev).todos);
        },
      },
    ]);
  }, [applyHardDelete, t, todoClearDone]);

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
    permanentlyDeleteSeries,
    rescheduleSeriesFrom,
    updatePriority,
    updateDueDate,
    updateReminders,
    updateTaskCategory,
    updateText,
    updateNotes,
    updateRecurrence,
    toggleTrashSelection,
    detachFromSeries,
    commitSeriesEdits,
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
