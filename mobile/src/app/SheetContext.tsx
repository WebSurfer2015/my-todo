/**
 * Cross-screen sheet host. ProfileSheet, SettingsSheet, and the
 * ThemeSelector are reachable from every tab (the avatar + gear
 * sit in each screen's AppHeader), so the visibility state + the
 * sheet components themselves live at the app shell, not inside a
 * single tab screen.
 *
 * Per-tab sheets (ComposeSheet / ChatSheet / CategorySheet for Todos;
 * GroceryEditSheet / StorePicker for Groceries)
 * stay inside their owning screen — those don't need cross-tab access.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
  useCallback,
} from 'react'
import { Alert, Share } from 'react-native'
import { createNavigationContainerRef } from '@react-navigation/native'
import { useStore } from './StoreContext'
import { useAuth } from './AuthContext'
import { useNotify } from './notify'
import { useLang } from './LangContext'
import { usePurchases } from './PurchasesContext'
import {
  buildExportPayload,
  serializeExport,
  isExportEmpty,
} from '../../../core/src/data/exporter'
import ProfileSheet from '../features/profile/ProfileSheet'
import SettingsSheet from '../features/profile/SettingsSheet'
import ThemeSelector from '../features/profile/ThemeSelector'
import GuideMenuSheet from '../features/onboarding/GuideMenuSheet'
import GuideSheet from '../features/onboarding/GuideSheet'
import GuidesPrompt from '../features/onboarding/GuidesPrompt'
import ComposeSheet, { type ComposePrefill } from '../features/task/ComposeSheet'
import TaskDetailsSheet from '../features/task/TaskDetailsSheet'
import ChatSheet, { type MochiApplyResult } from '../features/mochi/ChatSheet'
import type { OpOf, ProposedOperation } from '../../../core/src/ports/aiContracts'
import {
  planMochiOp,
  planMochiOps,
  planPickedTodos,
  type CategoryRef,
  type MochiIntent,
  type MochiSnapshot,
} from '../../../core/src/logic/mochiOps'
import { clearMochiRest } from '../features/mochi/mochiRest'
import { IAP_ENABLED, MOCHI_AGENT_ENABLED } from './featureFlags'
import ManageAnimationSoundSheet from '../features/profile/ManageAnimationSoundSheet'
import CategorySheet from '../features/category/CategorySheet'
import { COLOR_PALETTE, categoryLabel } from '../core-bindings/categories'
import { SEED_GROCERY_STORES, frequentGroceries } from '../core-bindings/groceries'
import type { Filter, Priority } from '../core-bindings/types'
import type { Guide } from '../features/onboarding/guides'
import { genUuid, todayLocal } from '../../../core/src/logic/utils'

/** How long a sheet takes to animate out before the next one may open —
 * iOS can't reliably present a <Modal> while another is still dismissing. */
export const MODAL_HANDOFF_MS = 280

/** Signal that a screen should open its tab-local manage sheet. The
 * `seq` bumps so a repeat-trigger fires even when target stays the
 * same; screens read on focus and act when both target + seq change.
 * Used for Groceries today since StorePicker still lives inside
 * GroceryView. */
export interface ManageRequest {
  target: 'todos' | 'groceries' | null
  seq: number
}

interface Sheets {
  openProfile: () => void
  openSettings: () => void
  openTheme: () => void
  /** Open the Tips & guides menu (entry point for Settings). */
  openGuides: () => void
  /** Open the add-todo compose sheet from any tab. */
  openCompose: () => void
  /** FAB entry point — opens the last-used capture surface (manual or Mochi). */
  openCapture: () => void
  /** Open the Mochi capture assistant (natural-language add/edit). Entry
   * point lives in the compose sheet. */
  openMochi: () => void
  /** First-run hand-off: give `text` to Mochi and send it (Compose with the
   * words pre-filled when Mochi is off). */
  openCaptureWith: (text: string) => void
  /** Open the Manage Filter sheet (Todos gear icon, Settings entry). */
  openManageFilter: () => void
  /** Open the Select Filter sheet (Todos funnel). */
  openSelectFilter: () => void
  /** Open Manage Groceries — navigates to Groceries tab then signals
   * the screen to open StorePicker in edit mode (since StorePicker
   * still lives inside GroceryView). */
  openManageGroceries: () => void
  /** Latest manage-sheet request the SheetContext has dispatched.
   * Tab screens read this to know when to open their local sheets. */
  manageRequest: ManageRequest
  /** Ask the Todos screen to scroll to a date-bucket group (by key). The
   * `seq` bumps so a repeat request for the same group re-fires. Set by the
   * Dashboard's "N open →" links; read by TodosScreen. */
  requestTodosScroll: (group: string) => void
  todosScrollRequest: { group: string | null; seq: number }
}

const SheetContext = createContext<Sheets | null>(null)

/** Opens the to-do details sheet (optionally jumped into a step's editor).
 * A separate, STABLE context so memoized list rows don't re-render whenever
 * the sheet layer does. */
export const TaskDetailsOpenContext = createContext<(todoId: string, subtaskId?: string | null) => void>(
  () => {},
)

/**
 * Module-level NavigationContainer ref. SheetProvider is mounted ABOVE
 * NavigationContainer in App.tsx, so `useNavigation` isn't available
 * here — instead App.tsx threads this same ref to NavigationContainer.
 * Once the container mounts, `isReady()` returns true and we can
 * `.navigate('Todos' | 'Groceries')` from Settings entries.
 */
export const sheetNavigationRef = createNavigationContainerRef<{
  Home: undefined
  Todos: undefined
  Groceries: undefined
}>()

/** Combine several actions' Undos into one (newest first); null if none. */
function combineUndos(undos: Array<(() => void) | null | undefined>): (() => void) | null {
  const list = undos.filter((u): u is () => void => !!u)
  if (list.length === 0) return null
  return () => [...list].reverse().forEach((u) => u())
}

export function SheetProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { user, deleteAccount, signOut } = useAuth()
  const { showSnackbar } = useNotify()
  const { t } = useLang()
  const { tier, openPaywall } = usePurchases()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [guideMenuOpen, setGuideMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  // Pre-filled fields when Compose is opened from Ask Mochi's "Review & add".
  // Null for a normal blank compose (the Add FAB).
  const [composePrefill, setComposePrefill] = useState<ComposePrefill | null>(null)
  const [mochiOpen, setMochiOpen] = useState(false)
  // Text carried from Compose into Mochi ("Ask Mochi instead").
  const [mochiSeed, setMochiSeed] = useState('')
  useEffect(() => {
    if (!mochiOpen) {
      setMochiSeed('')
      setMochiAutoSend(false)
    }
  }, [mochiOpen])
  const [animationSoundOpen, setAnimationSoundOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySheetMode, setCategorySheetMode] = useState<'view' | 'edit'>('view')
  const [manageRequest, setManageRequest] = useState<ManageRequest>({ target: null, seq: 0 })
  const [todosScrollRequest, setTodosScrollRequest] = useState<{ group: string | null; seq: number }>({ group: null, seq: 0 })
  const requestTodosScroll = useCallback((group: string) => {
    setTodosScrollRequest((p) => ({ group, seq: p.seq + 1 }))
  }, [])
  // Currently-playing single guide. Null when only the menu is up
  // (or both are closed). Setting this immediately renders the
  // guide carousel over the menu.
  const [activeGuide, setActiveGuide] = useState<Guide | null>(null)
  // First-run prompt — shown once when onboarding is done and
  // profile.guidesPromptShown is not yet set. Local visibility
  // state lets us animate it independently of the menu.
  const [promptOpen, setPromptOpen] = useState(false)

  // The ONE to-do details sheet. It used to live inside each list row, so
  // an edit that moved the row (date → tomorrow on Today, a group change on
  // Todos) unmounted the row and closed the sheet mid-edit, losing typed
  // text. Hosted here, it always shows the live to-do from the store.
  const [detailsReq, setDetailsReq] = useState<{ id: string; subtaskId: string | null } | null>(null)
  const openTaskDetails = useCallback(
    (todoId: string, subtaskId: string | null = null) => setDetailsReq({ id: todoId, subtaskId }),
    [],
  )
  const detailsTodo = detailsReq ? store.todos.find((td) => td.id === detailsReq.id) : undefined
  // The to-do vanished while open (e.g. deleted on another device): forget
  // the request, or the sheet would pop back if that id reappeared.
  useEffect(() => {
    if (detailsReq && !detailsTodo) setDetailsReq(null)
  }, [detailsReq, detailsTodo])
  const openProfile = useCallback(() => setProfileOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openTheme = useCallback(() => setThemePickerOpen(true), [])
  const openGuides = useCallback(() => setGuideMenuOpen(true), [])
  // Compose opened from the Today tab starts dated today — Today only lists
  // dated to-dos, so an undated add would seem to vanish. Everywhere else a
  // new to-do has no date by default.
  const [composeStartsToday, setComposeStartsToday] = useState(false)
  const openCompose = useCallback(() => {
    setComposePrefill(null) // Add FAB → blank compose
    setComposeStartsToday(
      sheetNavigationRef.isReady() && sheetNavigationRef.getCurrentRoute()?.name === 'Home',
    )
    setComposeOpen(true)
  }, [])
  const openMochi = useCallback(() => setMochiOpen(true), [])
  const [mochiAutoSend, setMochiAutoSend] = useState(false)
  const agentOn = MOCHI_AGENT_ENABLED && store.profile.agentEnabled !== false
  const openCaptureWith = useCallback(
    (text: string) => {
      if (agentOn) {
        setMochiSeed(text)
        setMochiAutoSend(true)
        setMochiOpen(true)
      } else {
        setComposePrefill({ text })
        setComposeOpen(true)
      }
    },
    [agentOn],
  )

  // The FAB reopens whichever capture surface you used last — manual compose
  // or Ask Mochi — persisted on the profile so it sticks across launches. The
  // two "switch" links below update it. When AI assistance is OFF, the FAB
  // always opens manual compose, regardless of the remembered mode — Ask Mochi
  // shouldn't surface at all while AI is disabled.
  const agentEnabled = store.profile.agentEnabled !== false
  // Default is Mochi — it's the front door (2026-10-18). "Enter manually"
  // switches the remembered mode to manual.
  const lastComposeMode = store.profile.lastComposeMode ?? 'mochi'
  const openCapture = useCallback(() => {
    if (MOCHI_AGENT_ENABLED && agentEnabled && lastComposeMode === 'mochi') setMochiOpen(true)
    else openCompose()
  }, [agentEnabled, lastComposeMode, openCompose])

  // Sheet → sheet handoffs: iOS can't reliably stack two <Modal>s, so the
  // next sheet opens only once the current one has animated out. Pending
  // handoffs are cancelled on unmount (e.g. sign-out tears the shell down).
  const handoffTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const timers = handoffTimers.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])
  const afterModalClose = useCallback((fn: () => void) => {
    const id = setTimeout(() => {
      handoffTimers.current.delete(id)
      fn()
    }, MODAL_HANDOFF_MS)
    handoffTimers.current.add(id)
  }, [])

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

  // Latest store, for Undos that run later and must read the CURRENT to-dos
  // (the render-time `store` an Undo closed over is stale by then).
  const storeRef = useRef(store)
  useEffect(() => {
    storeRef.current = store
  }, [store])

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
      const undos: Array<(() => void) | null> = []
      const todoIds: string[] = []
      const groceryIds: string[] = []
      const asks: Array<Promise<boolean>> = []
      // Pre-run state for snapshot Undos.
      const todosBefore = store.todos
      const beforeIds = new Set(todosBefore.map((td) => td.id))
      const snapshotted = new Set<string>()
      // Put a to-do back exactly as it was before this run (first touch wins,
      // so several edits to one to-do revert to the pre-run state).
      const snapshotTodo = (id: string, opts?: { dropNewSeriesRows?: boolean }) => {
        const before = todosBefore.find((td) => td.id === id)
        if (!before || snapshotted.has(id)) return
        snapshotted.add(id)
        undos.push(() => {
          store.revertTodo(before)
          if (!opts?.dropNewSeriesRows) return
          // A recurrence edit tops up the series right away — remove the
          // occurrences it generated (rows that didn't exist before the run).
          const live = storeRef.current.todos
          const sid = live.find((td) => td.id === id)?.seriesId
          if (!sid) return
          live
            .filter((td) => td.seriesId === sid && td.id !== id && !beforeIds.has(td.id))
            .forEach((td) => store.permanentlyDelete(td.id))
        })
      }
      // Categories created by this run, by lower-cased label.
      const created = new Map<string, string>()
      const categoryOf = (ref: CategoryRef): string | undefined =>
        'id' in ref ? ref.id : created.get(ref.newLabel.trim().toLowerCase())
      for (const it of intents) {
        switch (it.type) {
          case 'addCategory':
            created.set(
              it.label.trim().toLowerCase(),
              store.addCategory({ label: it.label, color: it.color, icon: it.icon }),
            )
            break
          case 'addTask':
            todoIds.push(
              store.addTask(
                it.text,
                it.priority,
                it.dueDate,
                it.category ? categoryOf(it.category) : undefined,
                it.recurrence,
                {
                  ...(it.notes ? { notes: it.notes } : {}),
                  ...(it.reminders ? { reminders: it.reminders } : {}),
                },
              ),
            )
            break
          case 'updateText':
            snapshotTodo(it.todoId)
            store.updateText(it.todoId, it.text)
            break
          case 'updatePriority':
            snapshotTodo(it.todoId)
            store.updatePriority(it.todoId, it.priority)
            break
          case 'updateDueDate':
            snapshotTodo(it.todoId)
            store.updateDueDate(it.todoId, it.dueDate)
            break
          case 'updateCategory': {
            const id = categoryOf(it.category)
            if (id) {
              snapshotTodo(it.todoId)
              store.updateTaskCategory(it.todoId, id)
            }
            break
          }
          case 'updateNotes':
            snapshotTodo(it.todoId)
            store.updateNotes(it.todoId, it.notes)
            break
          case 'updateRecurrence':
            snapshotTodo(it.todoId, { dropNewSeriesRows: true })
            store.updateRecurrence(it.todoId, it.recurrence)
            break
          case 'updateReminders':
            snapshotTodo(it.todoId)
            store.updateReminders(it.todoId, it.reminders)
            break
          case 'addSubtask':
            snapshotTodo(it.todoId)
            store.addSubtask(it.todoId, it.text)
            break
          case 'toggle':
            undos.push(store.toggle(it.todoId))
            break
          case 'moveToTrash':
            undos.push(store.moveToTrash(it.todoId))
            break
          case 'moveSeriesFutureToTrash':
            undos.push(store.moveSeriesFutureToTrash(it.todoId))
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
                        undos.push(store.moveToTrash(id))
                        resolve(true)
                      },
                    },
                    {
                      text: 'This & future',
                      onPress: () => {
                        undos.push(store.moveSeriesFutureToTrash(id))
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
            undos.push(store.skipTodo(it.todoId))
            break
          case 'skipSeriesFuture':
            undos.push(store.skipSeriesFuture(it.todoId))
            break
          case 'restoreFromTrash':
            snapshotTodo(it.todoId)
            store.restoreFromTrash(it.todoId)
            break
          case 'bulkDeferTodos':
            undos.push(store.bulkDeferTodos(it.todoIds, it.dueDate))
            break
          case 'toggleSubtask':
            snapshotTodo(it.todoId)
            store.toggleSubtask(it.todoId, it.subtaskId)
            break
          case 'removeSubtask':
            snapshotTodo(it.todoId)
            store.removeSubtask(it.todoId, it.subtaskId)
            break
          case 'updateSubtaskText':
            snapshotTodo(it.todoId)
            store.updateSubtaskText(it.todoId, it.subtaskId, it.text)
            break
          case 'addGroceryStore':
            store.addGroceryStore(it.name)
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
            store.editGrocery(it.groceryId, it.patch)
            if (before) {
              undos.push(() =>
                store.editGrocery(before.id, { text: before.text, groupId: before.groupId, stores: before.stores }),
              )
            }
            break
          }
          case 'toggleGroceryChecked': {
            const id = it.groceryId
            store.toggleGroceryChecked(id)
            undos.push(() => store.toggleGroceryChecked(id))
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
            store.editCategory(it.categoryId, { label: it.label, color: it.color, icon: it.icon })
            if (before) {
              // A built-in's label is undefined (its localized name) — restore
              // exactly that, not "".
              undos.push(() =>
                store.editCategory(before.id, {
                  label: before.label,
                  color: before.color,
                  icon: before.icon,
                } as { label: string; color: string; icon: string }),
              )
            }
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
      // Whether anything applied right away (everything but the confirm Alerts).
      const appliedNow = intents.some((i) => i.type !== 'askDeleteScope' && i.type !== 'askRemoveGrocery')
      return { undo, hasUndo, asks, appliedNow, todoIds, groceryIds, categoryOf }
    },
    [store],
  )

  // Ask Mochi → "Review & add": hand the chat's createTodo proposal to the
  // manual ComposeSheet (the same code a manual add uses) so the user reviews
  // and saves through one path — no separate apply logic, identical outcome.
  // The planner stamps reminder ids and resolves a same-turn new category
  // (creating it now, so Compose can preselect it); only the addTask is left
  // for the user to save.
  const reviewCreateTodo = useCallback(
    (args: OpOf<'createTodo'>['args'], opts?: { note?: string }) => {
      const intents = planMochiOp({ kind: 'createTodo', args }, mochiSnapshot(), { genId: genUuid })
      const task = intents.find((i): i is Extract<MochiIntent, { type: 'addTask' }> => i.type === 'addTask')
      const { categoryOf } = runMochiIntents(intents.filter((i) => i.type === 'addCategory'))
      setComposePrefill({
        text: args.text,
        priority: args.priority ?? 'medium',
        category: task?.category ? categoryOf(task.category) : undefined,
        dueDate: args.dueDate,
        recurrence: args.recurrence,
        ...(task?.reminders ? { reminders: task.reminders } : {}),
        ...(opts?.note ? { note: opts.note } : {}),
      })
      // Close the chat first, then open Compose once it has dismissed.
      setMochiOpen(false)
      afterModalClose(() => setComposeOpen(true))
    },
    [mochiSnapshot, runMochiIntents, afterModalClose],
  )

  // Apply one confirmed Mochi turn. Planning the WHOLE turn at once lets a
  // to-do land in a category created by the same turn. Returns the combined
  // inline Undo (mark done / delete / skip), or null.
  // A turn with confirm Alerts reports through `pending` once they're all
  // answered, so the card never says "✓ Done" for something the user kept.
  const applyMochiOps = useCallback(
    (ops: ProposedOperation[]): MochiApplyResult => {
      const run = runMochiIntents(planMochiOps(ops, mochiSnapshot(), { genId: genUuid }))
      const current = () => (run.hasUndo() ? run.undo : null)
      if (run.asks.length === 0) return { undo: current() }
      return {
        undo: null,
        pending: Promise.all(run.asks).then((answers) => ({
          undo: current(),
          applied: run.appliedNow || answers.some(Boolean),
          keptSome: answers.some((a) => !a),
        })),
      }
    },
    [mochiSnapshot, runMochiIntents],
  )

  // Optimistic capture: apply a single new to-do / grocery item RIGHT AWAY
  // (no Confirm tap) and return an `undo` the chat renders inline — a snackbar
  // would render behind the chat Modal. For a recurring to-do, Undo asks
  // whether to drop just this occurrence or the whole repeat.
  const applyCaptureWithUndo = useCallback(
    (op: ProposedOperation): { id: string | null; category?: string; undo: () => void } => {
      if (op.kind !== 'createTodo' && op.kind !== 'addGroceryItem') return { id: null, undo: () => {} }
      const intents = planMochiOp(op, mochiSnapshot(), { genId: genUuid })
      const run = runMochiIntents(intents)
      if (op.kind === 'addGroceryItem') {
        // null id → no inline chip-editing for groceries (Undo only). The
        // Undo removes a new item, or restores one that was already listed.
        return { id: null, undo: run.undo }
      }
      const id = run.todoIds[0] ?? null
      const task = intents.find((i): i is Extract<MochiIntent, { type: 'addTask' }> => i.type === 'addTask')
      const text = op.args.text
      const isRecurring = !!op.args.recurrence
      return {
        id,
        category: task?.category ? run.categoryOf(task.category) : undefined,
        undo: () => {
          if (!id) return
          if (isRecurring) {
            Alert.alert(
              'Remove repeating to-do?',
              `"${text}" repeats — remove just this one, or the whole series?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Just this one', onPress: () => store.permanentlyDelete(id) },
                {
                  text: 'Whole series',
                  style: 'destructive',
                  onPress: () => store.permanentlyDeleteSeriesFuture(id),
                },
              ],
            )
          } else {
            store.permanentlyDelete(id)
          }
        },
      }
    },
    [store, mochiSnapshot, runMochiIntents],
  )

  // Inline-edit a just-captured to-do straight from the Mochi card — fixes the
  // common "Mochi got the category/date slightly off" without leaving chat.
  const editCapturedTodo = useCallback(
    (id: string, patch: { category?: string; priority?: Priority; dueDate?: string }) => {
      if (patch.category !== undefined) store.updateTaskCategory(id, patch.category)
      if (patch.priority !== undefined) store.updatePriority(id, patch.priority)
      if (patch.dueDate !== undefined) store.updateDueDate(id, patch.dueDate)
    },
    [store],
  )

  // Apply a pick-list proposal to the user's ticked ids (planned in core:
  // delete → Done bin, markDone only flips open ones, edit / addSteps per id).
  // Returns the combined inline Undo.
  const applyPickedTodos = useCallback(
    (op: OpOf<'pickTodos'>, ids: string[]) =>
      ids.length === 0
        ? null
        : (() => {
            const run = runMochiIntents(planPickedTodos(op, ids, mochiSnapshot(), { genId: genUuid }))
            return run.hasUndo() ? run.undo : null
          })(),
    [mochiSnapshot, runMochiIntents],
  )

  // Scoped delete for the Mochi delete card — to the Trash: one instance, or
  // this + every future occurrence in the series.
  const deleteTodoScoped = useCallback(
    (id: string, scope: 'one' | 'series') =>
      scope === 'series' ? store.moveSeriesFutureToTrash(id) : store.moveToTrash(id),
    [store],
  )

  // Bulk action on the pick-list's chosen ids (the card owns the date picker);
  // delete goes to the Trash.
  const applyPickAction = useCallback(
    (action: 'skip' | 'defer' | 'delete', ids: string[], dueDate?: string) => {
      if (action === 'skip') return combineUndos(ids.map((id) => store.skipTodo(id)))
      if (action === 'delete') return combineUndos(ids.map((id) => store.moveToTrash(id)))
      // Defer like the Today "Defer" action (todoDeferTo): keeps each to-do's
      // time, moves its reminders, handles a series, and has an exact Undo.
      if (action === 'defer' && dueDate) return store.bulkDeferTodos(ids, dueDate)
      return null
    },
    [store],
  )
  const openManageFilter = useCallback(() => {
    setCategorySheetMode('edit')
    setCategorySheetOpen(true)
  }, [])
  const openSelectFilter = useCallback(() => {
    setCategorySheetMode('view')
    setCategorySheetOpen(true)
  }, [])
  const openManageGroceries = useCallback(() => {
    // Navigate to the Groceries tab so the signal fires when its
    // screen is on top, then bump the manage request. GroceriesScreen
    // watches manageRequest and opens StorePicker in edit mode.
    if (sheetNavigationRef.isReady()) {
      sheetNavigationRef.navigate('Groceries')
    }
    setManageRequest((prev) => ({ target: 'groceries', seq: prev.seq + 1 }))
  }, [])

  // ----- Settings → DATA section handlers -----
  // Export, Delete data only, Delete account. Owned here because they
  // touch cross-slice store data + the auth context. The SettingsSheet
  // just wires UI to these callbacks.
  const handleExport = useCallback(async () => {
    const payload = buildExportPayload({
      todos: store.todos,
      todoReferences: store.todoReferences,
      categories: store.categories,
      profile: store.profile,
      groceries: store.groceries,
      groceryGroups: store.groceryGroups,
    })
    if (isExportEmpty(payload)) {
      Alert.alert(t.exportData, t.exportEmpty)
      return
    }
    try {
      const json = serializeExport(payload)
      await Share.share({
        title: 'sagely-data.json',
        message: json,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert(t.exportFailed, message)
    }
  }, [
    store.todos,
    store.todoReferences,
    store.categories,
    store.profile,
    store.groceries,
    store.groceryGroups,
    t,
  ])

  const handleDeleteData = useCallback(async () => {
    try {
      await store.clearAllData()
      setSettingsOpen(false)
      // Force a sign-out → sign-in cycle so the user gets a fresh
      // hydrate. The in-place setter reset can lose to a Firestore
      // subscribe race + the useSyncedState write debounce, and the
      // user explicitly asked for "log out to refresh the view" as
      // the calmer fallback. They sign back in to a clean slate.
      await signOut()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert(t.deleteDataOnly, message)
    }
  }, [store, signOut, t])

  const handleDeleteAccount = useCallback(async () => {
    try {
      // Close the settings sheet first so the SignIn redirect (which
      // happens automatically when AuthContext sees !user) doesn't
      // race with an open modal.
      setSettingsOpen(false)
      await deleteAccount()
      // NotifyProvider wraps the SignIn screen too, so this survives the
      // switch to signed-out.
      showSnackbar({ message: t.accountDeletedDone })
    } catch (err) {
      const code = (err as { name?: string } | null)?.name
      if (code === 'RecentLoginRequiredError') {
        // Firebase needs a fresh sign-in to delete. Offer it directly instead
        // of telling the user to find "Sign out" themselves. Wait for Settings
        // to finish dismissing — iOS drops an Alert raised mid-dismiss.
        afterModalClose(() =>
          Alert.alert(t.deleteAccount, t.deleteAccountReauth, [
            { text: t.cancel, style: 'cancel' },
            { text: t.signInAgain, onPress: () => void signOut() },
          ]),
        )
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      afterModalClose(() => Alert.alert(t.deleteAccount, message))
    }
  }, [deleteAccount, signOut, showSnackbar, t, afterModalClose])

  // Mochi's "resting" state is per account: forget it on sign-out so the
  // next account on this device doesn't inherit it.
  const uid = user?.uid ?? null
  useEffect(() => {
    if (!uid) clearMochiRest()
  }, [uid])

  // Mount the first-run prompt the first time the user lands in
  // the app post-onboarding with the flag unset. Stamping the
  // flag inside the accept / dismiss handlers prevents repeats
  // even if the user dismisses without action.
  useEffect(() => {
    if (!store.loaded) return
    if (!store.profile.onboardingDone) return
    if (store.profile.guidesPromptShown) return
    // Defer a beat so the prompt doesn't race with the splash
    // fade-out on cold launch.
    const t = setTimeout(() => setPromptOpen(true), 600)
    return () => clearTimeout(t)
  }, [store.loaded, store.profile.onboardingDone, store.profile.guidesPromptShown])

  // Updater form throughout: a spread of the render-time `store.profile`
  // would clobber a profile change that landed since (another sheet's save,
  // a Firestore snapshot).
  function stampPromptShown() {
    store.saveProfile((p) => ({ ...p, guidesPromptShown: true }))
  }

  function markGuideSeen(id: string) {
    store.saveProfile((p) => {
      const seen = p.guidesSeen ?? []
      return seen.includes(id) ? p : { ...p, guidesSeen: [...seen, id] }
    })
  }

  return (
    <TaskDetailsOpenContext.Provider value={openTaskDetails}>
    <SheetContext.Provider value={{ openProfile, openSettings, openTheme, openGuides, openCompose, openCapture, openMochi, openCaptureWith, openManageFilter, openSelectFilter, openManageGroceries, manageRequest, requestTodosScroll, todosScrollRequest }}>
      {children}
      {/* Sheets are only relevant once signed in. Crucially, mounting these
          <Modal>s on the signed-out SignIn screen FLATTENS its iOS a11y tree
          (RN Modal quirk, #15) — which hid every SignIn control from Maestro
          and broke the E2E sign-in prelude. Gating on `user` keeps the
          SignIn screen's a11y intact. */}
      {user && (
      <>
      <ProfileSheet
        visible={profileOpen}
        profile={store.profile}
        onSave={(p) => {
          store.saveProfile(p)
          setProfileOpen(false)
        }}
        onClose={() => setProfileOpen(false)}
      />
      <SettingsSheet
        visible={settingsOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile((p) => ({ ...p, ...patch }))
        }
        onOpenTheme={openTheme}
        onShowIntro={() =>
          store.saveProfile((p) => ({ ...p, onboardingDone: false }))
        }
        onOpenGuides={openGuides}
        onOpenManageTodos={openManageFilter}
        onOpenManageGroceries={openManageGroceries}
        onOpenAnimationSound={() => setAnimationSoundOpen(true)}
        onExport={handleExport}
        onDeleteData={handleDeleteData}
        onDeleteAccount={handleDeleteAccount}
        onClose={() => setSettingsOpen(false)}
      />
      <ThemeSelector
        visible={themePickerOpen}
        value={store.profile.theme ?? 'sage'}
        // Free-only v2.0.0: every theme is free while IAP is off.
        allThemesUnlocked={!IAP_ENABLED || tier !== 'free'}
        onUpgrade={() => {
          // Close the picker first, then open the paywall after it dismisses
          // (iOS can't reliably stack two Modals).
          setThemePickerOpen(false)
          afterModalClose(() => openPaywall('Unlock every theme with Premium.'))
        }}
        onChange={(next) => {
          // Close the picker FIRST, then apply the theme after it has
          // dismissed. Applying live re-themes the whole app (incl. the
          // mounted Modals) while this Modal is still animating, which
          // desyncs iOS's native modal stack and leaves an invisible
          // touch-capturing layer → the UI freezes ("no action works").
          setThemePickerOpen(false)
          // Functional update so we apply onto the LATEST profile, not the
          // one captured when onChange fired (avoids clobbering a concurrent
          // edit during the dismiss window).
          afterModalClose(() => store.saveProfile((p) => ({ ...p, theme: next })))
        }}
        onClose={() => setThemePickerOpen(false)}
      />
      <GuidesPrompt
        visible={promptOpen}
        onAccept={() => {
          stampPromptShown()
          setPromptOpen(false)
          // Open the menu only once the prompt has dismissed — in the same
          // tick it can render behind the closing prompt and look dead.
          afterModalClose(() => setGuideMenuOpen(true))
        }}
        onDismiss={() => {
          stampPromptShown()
          setPromptOpen(false)
        }}
      />
      <GuideMenuSheet
        visible={guideMenuOpen}
        seen={store.profile.guidesSeen ?? []}
        onSelect={(g) => {
          // iOS can't stack Modals reliably — the second one
          // renders behind the first and looks invisible. Close
          // the menu first, then open the guide on the next
          // animation tick. The guide's onClose re-opens the
          // menu so the user lands back on the list.
          setGuideMenuOpen(false)
          afterModalClose(() => setActiveGuide(g))
        }}
        onClose={() => setGuideMenuOpen(false)}
      />
      <GuideSheet
        visible={!!activeGuide}
        guide={activeGuide}
        onComplete={() => {
          if (activeGuide) markGuideSeen(activeGuide.id)
          setActiveGuide(null)
          // Return the user to the menu so they can pick another
          // walkthrough (or close out). Same modal-handoff dance
          // as opening.
          afterModalClose(() => setGuideMenuOpen(true))
        }}
        onClose={() => {
          setActiveGuide(null)
          afterModalClose(() => setGuideMenuOpen(true))
        }}
      />
      {/* ComposeSheet promoted to the app shell so the Add FAB works
          from any tab (Home, Todos). Per-tab compose wiring inside
          TodosScreen was removed when this moved up. */}
      <ComposeSheet
        visible={composeOpen}
        startsToday={composeStartsToday}
        categories={store.categories}
        defaultCategory={store.defaultCategory}
        references={store.todoReferences}
        agentEnabled={store.profile.agentEnabled !== false}
        onCreateCategory={(label) => {
          const color =
            COLOR_PALETTE[store.categories.length % COLOR_PALETTE.length]
          return store.addCategory({ label, color, icon: 'tag' })
        }}
        onAdd={store.addTask}
        prefill={composePrefill}
        onClose={() => {
          setComposeOpen(false)
          setComposePrefill(null)
        }}
        // Kill-switch: when Mochi is off, omit the callback so the
        // compose sheet hides the "Ask Mochi instead" affordance.
        onAskMochi={
          MOCHI_AGENT_ENABLED
            ? (text: string) => {
                store.saveProfile((p) => ({ ...p, lastComposeMode: 'mochi' }))
                setMochiSeed(text)
                setComposeOpen(false)
                // Same handoff as the other sheet switches — iOS can't
                // reliably stack two Modals.
                afterModalClose(() => setMochiOpen(true))
              }
            : undefined
        }
      />
      {/* Mochi capture assistant — opened from the compose sheet's "Ask
          Mochi" affordance. Applies via the same store mutations as a
          manual tap, after the user confirms each proposal. Gated by the
          MOCHI_AGENT_ENABLED kill-switch so the sheet never mounts when
          the feature is paused. */}
      {MOCHI_AGENT_ENABLED && (
        <ChatSheet
          visible={mochiOpen}
          initialInput={mochiSeed}
          autoSendInitial={mochiAutoSend}
          greetingName={
            store.profile.firstName?.trim() || store.profile.name?.trim() || ''
          }
          reduceMotion={store.reduceMotion}
          categories={store.categories}
          // Open to-dos FIRST: the server keeps only the first 100, and a pile
          // of completed ones would otherwise push older open to-dos out of
          // Mochi's view ("nothing matches"). Stable sort keeps the order.
          todos={store.todos
            .filter((td) => !td.trashed)
            .sort((a, b) => Number(a.done) - Number(b.done))
            .map((td) => ({
              id: td.id,
              text: td.text,
              priority: td.priority,
              category: td.category,
              dueDate: td.dueDate,
              done: td.done,
              subtasks: td.subtasks?.map((s) => s.text),
              recurrence: td.recurrence,
              seriesId: td.seriesId,
              reminders: td.reminders?.map((r) => ({ at: r.at })),
            }))}
          trashedTodos={store.todos
            .filter((td) => td.trashed)
            .map((td) => ({ id: td.id, text: td.text }))}
          groceryGroups={store.groceryGroups.map((g) => ({
            id: g.id,
            label: g.label,
          }))}
          groceries={store.groceries.map((g) => ({ id: g.id, text: g.text }))}
          // Top frequently-bought staples → quick re-add chips on the opening
          // screen (minCount 2 so they surface without a long history). Empty
          // for a new account; ChatSheet falls back to teaching examples.
          frequentChips={frequentGroceries(store.groceries, { minCount: 2 })
            .slice(0, 3)
            .map((g) => ({
              label: g.text.charAt(0).toUpperCase() + g.text.slice(1),
              prefill: `Add ${g.text} to shopping list`,
            }))}
          stores={store.profile.groceryStores ?? SEED_GROCERY_STORES}
          onApplyOperations={applyMochiOps}
          onCaptureWithUndo={applyCaptureWithUndo}
          onEditCapturedTodo={editCapturedTodo}
          onApplyPickedTodos={applyPickedTodos}
          onDeleteTodo={deleteTodoScoped}
          onPickAction={applyPickAction}
          onReviewCreateTodo={reviewCreateTodo}
          onClose={() => setMochiOpen(false)}
          onEnterManually={(opts?: { remember?: boolean }) => {
            // "Add it myself" while Mochi rests is a one-off — it must not make
            // manual the remembered FAB mode.
            if (opts?.remember !== false) {
              store.saveProfile((p) => ({ ...p, lastComposeMode: 'manual' }))
            }
            setComposePrefill(null)
            setComposeStartsToday(
              sheetNavigationRef.isReady() && sheetNavigationRef.getCurrentRoute()?.name === 'Home',
            )
            setMochiOpen(false)
            // Same Modal handoff as the other sheet switches.
            afterModalClose(() => setComposeOpen(true))
          }}
        />
      )}
      <ManageAnimationSoundSheet
        visible={animationSoundOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile((p) => ({ ...p, ...patch }))
        }
        onClose={() => setAnimationSoundOpen(false)}
      />
      {/* CategorySheet promoted out of TodosScreen so Settings (on
          any tab) can open it via sheets.openManageFilter. Todos'
          funnel/gear still drive it via openSelectFilter / openManageFilter. */}
      <CategorySheet
        visible={categorySheetOpen}
        defaultMode={categorySheetMode}
        selectedFilters={store.filters}
        onToggleFilter={store.toggleFilter}
        onClearFilters={store.clearFilters}
        pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[][]}
        onPinFilter={store.pinFilter}
        categories={store.categories}
        taskCounts={store.taskCountsForSheet}
        systemCounts={store.systemCounts}
        priorityCounts={store.byPriority}
        orderedStatuses={store.orderedStatuses}
        orderedVisibleStatuses={store.orderedVisibleStatuses}
        orderedPriorities={store.orderedPriorities}
        onAdd={store.addCategory}
        onEdit={store.editCategory}
        onDelete={store.deleteCategory}
        onReorder={store.reorderCategories}
        onRenameStatus={store.renameStatus}
        onToggleStatusHidden={store.toggleStatusHidden}
        onReorderStatuses={store.reorderStatuses}
        onTogglePriorityHidden={store.togglePriorityHidden}
        onReorderPriorities={store.reorderPriorities}
        onClose={() => setCategorySheetOpen(false)}
      />
      </>
      )}
      {detailsReq && detailsTodo && (
        <TaskDetailsSheet
          visible
          todo={detailsTodo}
          categories={store.categories}
          initialSubtaskEditId={detailsReq.subtaskId}
          onClose={() => setDetailsReq(null)}
          onUpdateText={store.updateText}
          onUpdateNotes={store.updateNotes}
          onUpdatePriority={store.updatePriority}
          onUpdateDueDate={store.updateDueDate}
          onUpdateCategory={store.updateTaskCategory}
          onUpdateRecurrence={store.updateRecurrence}
          onUpdateReminders={store.updateReminders}
          onMoveToTrash={store.moveToTrash}
          onToggle={store.toggle}
          onPermanentDelete={store.permanentlyDelete}
          onMoveSeriesFutureToTrash={store.moveSeriesFutureToTrash}
          onSkip={store.skipTodo}
          onSkipSeries={store.skipSeriesFuture}
          onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
          onApplySeriesFutureEdits={store.applySeriesFutureEdits}
          onDetachFromSeries={store.detachFromSeries}
          onApplyRecurrenceChange={store.applyRecurrenceChange}
          onApplySeriesSubtasks={store.applySeriesSubtasks}
          onAddSubtask={store.addSubtask}
          onToggleSubtask={store.toggleSubtask}
          onUpdateSubtaskText={store.updateSubtaskText}
          onUpdateSubtaskPriority={store.updateSubtaskPriority}
          onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
          onRemoveSubtask={store.removeSubtask}
          onClearSubtasks={store.clearSubtasks}
          agentEnabled={store.profile.agentEnabled !== false}
        />
      )}
    </SheetContext.Provider>
    </TaskDetailsOpenContext.Provider>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetContext)
  if (!s) throw new Error('useSheets must be used inside SheetProvider')
  return s
}
