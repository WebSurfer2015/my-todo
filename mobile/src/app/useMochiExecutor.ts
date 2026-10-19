/**
 * The thin Ask Mochi executor: run each planned intent (core logic/mochiOps)
 * through the SAME store mutation a manual tap uses — the agent has no
 * privileged write path — and hand the chat back an inline Undo (the store's
 * own snackbar renders BEHIND the chat Modal).
 *
 * Only the latest applied Mochi turn keeps its Undo (see mochiUndo): an older
 * turn's snapshot / tracked revert could otherwise overwrite a newer edit.
 *
 * A plain hook (no JSX) so the executor is unit-testable with renderHook.
 */
import { useCallback, useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import type { useTodoStore } from '../store/useTodoStore'
import type { Strings } from '../core-bindings/i18n'
import { categoryLabel } from '../core-bindings/categories'
import type { MochiApplyResult } from '../features/mochi/ChatSheet'
import type { CapturedTodoPatch } from '../features/mochi/EditableCaptureCard'
import type { OpOf, ProposedOperation } from '../../../core/src/ports/aiContracts'
import {
  planMochiOp,
  planMochiOps,
  planPickedTodos,
  type CategoryRef,
  type MochiIntent,
  type MochiSnapshot,
} from '../../../core/src/logic/mochiOps'
import { genUuid, todayLocal } from '../../../core/src/logic/utils'
import { beginMochiTurn } from './mochiUndo'

type Store = ReturnType<typeof useTodoStore>

/** Executor-driven store calls skip the store's snackbar: the chat card
 * shows the inline, turn-stamped Undo (a root snackbar would merge across
 * turns and bypass the latest-turn-only rule). */
const SILENT = { silent: true } as const

/** A Mochi turn that begins (retiring older turns' Undos) only once
 * `begin()` is called — i.e. once something actually applied. */
function lazyTurn() {
  let stamp: ReturnType<typeof beginMochiTurn> | null = null
  return {
    begin: () => {
      stamp ??= beginMochiTurn()
    },
    /** `fn` stamped with this turn; null for no fn or a turn that never began. */
    stamp: (fn: (() => void) | null): (() => void) | null => (fn && stamp ? stamp(fn) : null),
  }
}

/** Combine several actions' Undos into one (newest first); null if none.
 * Every part runs; the result is false only when EVERY part reported that
 * it put nothing back (an Undo returning nothing counts as done). */
export function combineUndos(undos: Array<(() => unknown) | null | undefined>): (() => boolean) | null {
  const list = undos.filter((u): u is () => unknown => !!u)
  if (list.length === 0) return null
  return () => [...list].reverse().map((u) => u()).some((r) => r !== false)
}

export function useMochiExecutor(store: Store, t: Strings) {
  // Latest store, for Undos that run later and must read the CURRENT state
  // (a render-time `store` closed over is stale by then).
  const storeRef = useRef(store)
  useEffect(() => {
    storeRef.current = store
  }, [store])

  // Read-only view of the store for the pure Mochi op planner (core
  // logic/mochiOps). Built at apply time so it sees the latest store.
  const mochiSnapshot = useCallback(
    (): MochiSnapshot => ({
      today: todayLocal(),
      todos: store.todos,
      categories: store.categories.map((c) => ({
        id: c.id,
        label: c.label ?? '',
        displayLabel: categoryLabel(c, t),
        color: c.color,
        icon: c.icon,
      })),
      groceries: store.groceries,
    }),
    [store.todos, store.categories, store.groceries, t],
  )

  // The thin executor: run each planned intent through the SAME store
  // mutation a manual tap uses (the agent has no privileged write path), and
  // collect the Undos the store hands back into one inline Undo — the
  // store's own snackbar renders BEHIND the chat Modal. All the guards
  // (unknown id, idempotent mark-done, Done-bin-only deletes, step matching,
  // same-turn categories) live in the planner, where they're table-tested.
  // Every applied intent contributes an Undo: the store's tracked Undo where
  // it has one, else a snapshot restore (to-do edits, category edits, store
  // renames). Confirm Alerts (askDeleteScope / askRemoveGrocery) are answered
  // later — each `asks` entry resolves true (applied) / false (kept as is).
  const runMochiIntents = useCallback(
    (intents: MochiIntent[]) => {
      const undos: Array<(() => unknown) | null> = []
      const todoIds: string[] = []
      const groceryIds: string[] = []
      const asks: Array<Promise<boolean>> = []
      // Pre-run state for snapshot Undos.
      const todosBefore = store.todos
      const snapshotted = new Set<string>()
      // Run an untracked to-do edit; when it actually changed the list
      // (applyTracked advances todosRef only then), its Undo puts the to-do
      // back exactly as it was before this run (first touch wins, so several
      // edits to one to-do revert to the pre-run state). A no-op edit adds
      // no Undo — and so doesn't begin a new Mochi turn.
      const editTodo = (id: string, apply: () => void) => {
        const listBefore = store.todosRef.current
        apply()
        if (store.todosRef.current === listBefore) return
        const before = todosBefore.find((td) => td.id === id)
        if (!before || snapshotted.has(id)) return
        snapshotted.add(id)
        undos.push(() => store.revertTodo(before))
      }
      // Categories created by this run, by lower-cased label.
      const created = new Map<string, string>()
      const categoryOf = (ref: CategoryRef): string | undefined =>
        'id' in ref ? ref.id : created.get(ref.newLabel.trim().toLowerCase())
      for (const it of intents) {
        switch (it.type) {
          case 'addCategory': {
            const id = store.addCategory({ label: it.label, color: it.color, icon: it.icon })
            created.set(it.label.trim().toLowerCase(), id)
            // Undos run newest-first, so the to-dos this run filed under it are
            // already gone; remove it only if nothing else uses it by then.
            // Read the LIVE store: the category didn't exist at this render.
            undos.push(() => {
              const live = storeRef.current
              if (live.todosRef.current.some((td) => td.category === id)) return
              live.deleteCategory(id)
            })
            break
          }
          case 'addTask': {
            const added = store.addTaskWithUndo(
              it.text,
              it.priority,
              it.dueDate,
              it.category ? categoryOf(it.category) : undefined,
              it.recurrence,
              {
                ...(it.notes ? { notes: it.notes } : {}),
                ...(it.reminders ? { reminders: it.reminders } : {}),
              },
            )
            todoIds.push(added.id)
            // Exact: removes every row it created (the whole new series).
            undos.push(added.undo)
            break
          }
          case 'updateText':
            editTodo(it.todoId, () => store.updateText(it.todoId, it.text))
            break
          case 'updatePriority':
            editTodo(it.todoId, () => store.updatePriority(it.todoId, it.priority))
            break
          case 'updateDueDate':
            editTodo(it.todoId, () => store.updateDueDate(it.todoId, it.dueDate))
            break
          case 'updateCategory': {
            const id = categoryOf(it.category)
            if (id) {
              editTodo(it.todoId, () => store.updateTaskCategory(it.todoId, id))
            }
            break
          }
          case 'updateNotes':
            editTodo(it.todoId, () => store.updateNotes(it.todoId, it.notes))
            break
          case 'updateRecurrence':
            // Tracked: a series occurrence rebuilds the series' future rows
            // — from where the row WAS when the same edit moved it first.
            undos.push(store.updateRecurrence(it.todoId, it.recurrence, it.fromDue ? { fromDue: it.fromDue } : undefined))
            break
          case 'updateReminders':
            editTodo(it.todoId, () => store.updateReminders(it.todoId, it.reminders))
            break
          case 'addSubtask':
            undos.push(store.addSubtask(it.todoId, it.text))
            break
          case 'toggle':
            undos.push(store.toggle(it.todoId, SILENT))
            break
          case 'moveToTrash':
            undos.push(store.moveToTrash(it.todoId, SILENT))
            break
          case 'moveSeriesFutureToTrash':
            undos.push(store.moveSeriesFutureToTrash(it.todoId, SILENT))
            break
          case 'askDeleteScope': {
            const id = it.todoId
            const text = it.text
            asks.push(
              new Promise<boolean>((resolve) => {
                Alert.alert(
                  'Move repeating to-do to Done?',
                  `"${text}" — just this one, or this and all future? They stay in Done for 30 days.`,
                  [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    {
                      text: 'Just this one',
                      onPress: () => {
                        undos.push(store.moveToTrash(id, SILENT))
                        resolve(true)
                      },
                    },
                    {
                      text: 'This & future',
                      onPress: () => {
                        undos.push(store.moveSeriesFutureToTrash(id, SILENT))
                        resolve(true)
                      },
                    },
                  ],
                  { cancelable: true, onDismiss: () => resolve(false) },
                )
              }),
            )
            break
          }
          case 'skipTodo':
            undos.push(store.skipTodo(it.todoId, SILENT))
            break
          case 'skipSeriesFuture':
            undos.push(store.skipSeriesFuture(it.todoId, SILENT))
            break
          case 'restoreFromTrash':
            editTodo(it.todoId, () => store.restoreFromTrash(it.todoId, SILENT))
            break
          case 'bulkDeferTodos':
            undos.push(store.bulkDeferTodos(it.todoIds, it.dueDate, SILENT))
            break
          case 'toggleSubtask':
            // Tracked: finishing the last step can complete the to-do and
            // roll a series forward — the Undo takes all of that back.
            undos.push(store.toggleSubtask(it.todoId, it.subtaskId, SILENT))
            break
          case 'removeSubtask':
            undos.push(store.removeSubtask(it.todoId, it.subtaskId))
            break
          case 'updateSubtaskText':
            editTodo(it.todoId, () => store.updateSubtaskText(it.todoId, it.subtaskId, it.text))
            break
          case 'addGroceryStore':
            undos.push(store.addGroceryStore(it.name))
            break
          case 'renameGroceryStore':
            undos.push(store.renameGroceryStore(it.from, it.to))
            break
          case 'deleteGroceryStore':
            undos.push(store.deleteGroceryStore(it.name))
            break
          case 'addGrocery': {
            const res = store.addGrocery({ text: it.text, groupId: it.groupId, stores: it.stores })
            if (res) {
              groceryIds.push(res.id)
              // A re-add of an item the user already had puts its previous
              // state back; a brand-new item is removed.
              const { id, previous } = res
              undos.push(() => (previous ? store.restoreGrocery(id, previous) : store.deleteGrocery(id)))
            }
            break
          }
          case 'editGrocery': {
            const before = store.groceries.find((g) => g.id === it.groceryId)
            // Only a field that actually differs is an edit — a no-op adds no
            // Undo (and so doesn't begin a new Mochi turn).
            const p = it.patch
            const differs =
              !!before &&
              ((p.text !== undefined && p.text !== before.text) ||
                (p.groupId !== undefined && p.groupId !== before.groupId) ||
                (p.stores !== undefined && (p.stores ?? []).join('\u0000') !== (before.stores ?? []).join('\u0000')))
            if (!before || !differs) break
            store.editGrocery(it.groceryId, p)
            undos.push(() =>
              store.editGrocery(before.id, { text: before.text, groupId: before.groupId, stores: before.stores }),
            )
            break
          }
          case 'toggleGroceryChecked': {
            const id = it.groceryId
            const wasChecked = store.groceries.find((g) => g.id === id)?.checked
            store.toggleGroceryChecked(id)
            // Put back the ABSOLUTE previous state: a blind re-toggle would
            // flip it the wrong way if it was changed again since.
            if (wasChecked !== undefined) {
              undos.push(() => {
                const live = storeRef.current.groceries.find((g) => g.id === id)
                if (live && live.checked !== wasChecked) storeRef.current.toggleGroceryChecked(id)
              })
            }
            break
          }
          case 'askRemoveGrocery': {
            const id = it.groceryId
            const text = it.text
            asks.push(
              new Promise<boolean>((resolve) => {
                Alert.alert(
                  'Remove from shopping?',
                  `Permanently remove "${text}" from your shopping list. This can't be undone.`,
                  [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => {
                        store.deleteGrocery(id)
                        resolve(true)
                      },
                    },
                  ],
                  { cancelable: true, onDismiss: () => resolve(false) },
                )
              }),
            )
            break
          }
          case 'editCategory': {
            const before = store.categories.find((c) => c.id === it.categoryId)
            // The planner merges the patch over the stored values (a
            // built-in's label stored as ""), so equal means nothing changes.
            if (
              !before ||
              (it.label === (before.label ?? '') && it.color === before.color && it.icon === before.icon)
            ) {
              break
            }
            store.editCategory(it.categoryId, { label: it.label, color: it.color, icon: it.icon })
            // A built-in's label is undefined (its localized name) — restore
            // exactly that, not "".
            undos.push(() =>
              store.editCategory(before.id, {
                label: before.label,
                color: before.color,
                icon: before.icon,
              } as { label: string; color: string; icon: string }),
            )
            break
          }
          case 'deleteCategory':
            undos.push(store.deleteCategory(it.categoryId))
            break
          default: {
            const unhandled: never = it
            void unhandled
          }
        }
      }
      // Read the list at call time: an Alert answered later adds its Undo.
      const undo = () => combineUndos(undos)?.()
      const hasUndo = () => undos.some((u) => !!u)
      // Whether anything applied right away: every store call that changed
      // something hands back an Undo (a no-op — an unchanged category, a
      // toggle of a gone row — hands back none). Confirm Alerts answer later.
      const appliedNow = hasUndo()
      return { undo, hasUndo, asks, appliedNow, todoIds, groceryIds, categoryOf }
    },
    [store],
  )

  // Apply one confirmed Mochi turn. Planning the WHOLE turn at once lets a
  // to-do land in a category created by the same turn. Returns the combined
  // inline Undo (mark done / delete / skip), or null.
  // A turn with confirm Alerts reports through `pending` once they're all
  // answered, so the card never says "✓ Done" for something the user kept.
  // Only the latest applied turn keeps its Undo (mochiUndo). A new Mochi
  // turn (retiring every older turn's Undo) begins only once something
  // actually applied — a cancelled confirm, an empty plan or a no-op keeps
  // the previous turn's Undo live.
  const applyMochiOps = useCallback(
    (ops: ProposedOperation[]): MochiApplyResult => {
      const run = runMochiIntents(planMochiOps(ops, mochiSnapshot(), { genId: genUuid }))
      const turn = lazyTurn()
      if (run.appliedNow) turn.begin()
      const current = () => turn.stamp(run.hasUndo() ? run.undo : null)
      if (run.asks.length === 0) return { undo: current() }
      return {
        undo: null,
        pending: Promise.all(run.asks).then((answers) => {
          if (answers.some(Boolean)) turn.begin()
          return {
            undo: current(),
            applied: run.appliedNow || answers.some(Boolean),
            keptSome: answers.some((a) => !a),
          }
        }),
      }
    },
    [mochiSnapshot, runMochiIntents],
  )

  // Optimistic capture: apply a single new to-do / grocery item RIGHT AWAY
  // (no Confirm tap) and return an `undo` the chat renders inline — a snackbar
  // would render behind the chat Modal. Undo removes exactly what the capture
  // created — for a repeating to-do the whole new series (it only just
  // started) plus a category it created, with no extra question.
  const applyCaptureWithUndo = useCallback(
    (op: ProposedOperation): { id: string | null; category?: string; undo: () => void | boolean | Promise<boolean> } => {
      if (op.kind !== 'createTodo' && op.kind !== 'addGroceryItem') return { id: null, undo: () => {} }
      const intents = planMochiOp(op, mochiSnapshot(), { genId: genUuid })
      const run = runMochiIntents(intents)
      if (op.kind === 'addGroceryItem') {
        // null id → no inline chip-editing for groceries (Undo only). The
        // Undo removes a new item, or restores one that was already listed.
        return { id: null, undo: run.hasUndo() ? beginMochiTurn()(run.undo) : () => false }
      }
      const id = run.todoIds[0] ?? null
      const task = intents.find((i): i is Extract<MochiIntent, { type: 'addTask' }> => i.type === 'addTask')
      // Nothing created → no new turn (the previous turn's Undo stays live).
      if (!id) return { id: null, undo: () => false }
      // A repeating capture is a brand-new series: its Undo removes every
      // row carrying this seriesId, whatever dates it has by then (a date
      // chip may have moved the start).
      const seriesId = op.args.recurrence ? storeRef.current.todosRef.current.find((td) => td.id === id)?.seriesId : undefined
      return {
        id,
        category: task?.category ? run.categoryOf(task.category) : undefined,
        // Resolves whether anything was removed (false when stale, or when
        // the to-do is already gone).
        undo: beginMochiTurn()((): boolean => {
          // Remove the captured to-do BY ID — even after a chip edit, the
          // card's Undo means "I didn't want this". A series drops EVERY
          // row of it (occurrences topped up since included). The run's Undo
          // then removes a category it created, now unused.
          const live = storeRef.current
          const listBefore = live.todosRef.current
          if (seriesId) live.permanentlyDeleteSeries(seriesId)
          else live.permanentlyDelete(id)
          const removed = live.todosRef.current !== listBefore
          run.undo()
          return removed
        }),
      }
    },
    [mochiSnapshot, runMochiIntents],
  )

  // Inline-edit a just-captured to-do straight from the Mochi card — fixes the
  // common "Mochi got the category/date slightly off" without leaving chat.
  const editCapturedTodo = useCallback(
    (id: string, patch: CapturedTodoPatch) => {
      // null clears the category (a chip Undo back to "no category").
      if (patch.category !== undefined) store.updateTaskCategory(id, patch.category ?? undefined)
      if (patch.priority !== undefined) store.updatePriority(id, patch.priority)
      if (patch.dueDate !== undefined) {
        // A repeating capture's date chip moves the series' START: re-expand
        // it from the new date (moving only the head left the old tail).
        const row = storeRef.current.todosRef.current.find((td) => td.id === id)
        if (row?.seriesId && row.recurrence) store.rescheduleSeriesFrom(id, patch.dueDate)
        else store.updateDueDate(id, patch.dueDate)
      }
    },
    [store],
  )

  // Apply a pick-list proposal to the user's ticked ids (planned in core:
  // delete → Done bin, markDone only flips open ones, edit / addSteps per id).
  // Returns the combined inline Undo.
  const applyPickedTodos = useCallback(
    (op: OpOf<'pickTodos'>, ids: string[]) => {
      if (ids.length === 0) return null
      const run = runMochiIntents(planPickedTodos(op, ids, mochiSnapshot(), { genId: genUuid }))
      return run.hasUndo() ? beginMochiTurn()(run.undo) : null
    },
    [mochiSnapshot, runMochiIntents],
  )

  // Scoped delete for the Mochi delete card — to the Trash: one instance, or
  // this + every future occurrence in the series.
  const deleteTodoScoped = useCallback(
    (id: string, scope: 'one' | 'series') => {
      const undo = scope === 'series' ? store.moveSeriesFutureToTrash(id, SILENT) : store.moveToTrash(id, SILENT)
      return undo ? beginMochiTurn()(undo) : null
    },
    [store],
  )

  // Bulk action on the pick-list's chosen ids (the card owns the date picker);
  // delete goes to the Trash.
  const applyPickAction = useCallback(
    (action: 'skip' | 'defer' | 'delete', ids: string[], dueDate?: string) => {
      const run = (): (() => void) | null => {
        if (action === 'skip') return combineUndos(ids.map((id) => store.skipTodo(id, SILENT)))
        if (action === 'delete') return combineUndos(ids.map((id) => store.moveToTrash(id, SILENT)))
        // Defer like the Today "Defer" action (todoDeferTo): keeps each to-do's
        // time, moves its reminders, handles a series, and has an exact Undo.
        if (action === 'defer' && dueDate) return store.bulkDeferTodos(ids, dueDate, SILENT)
        return null
      }
      if (ids.length === 0 || (action === 'defer' && !dueDate)) return null
      const undo = run()
      return undo ? beginMochiTurn()(undo) : null
    },
    [store],
  )

  return {
    mochiSnapshot,
    runMochiIntents,
    applyMochiOps,
    applyCaptureWithUndo,
    editCapturedTodo,
    applyPickedTodos,
    deleteTodoScoped,
    applyPickAction,
  }
}
